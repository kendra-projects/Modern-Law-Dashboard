import "server-only"

import { growFetch, growStatus } from "@/lib/grow"
import { growNote, growState, type GrowCandidate, type GrowNoteKind, type GrowNoteLead } from "@/lib/grow-note"
import { createAdminClient } from "@/lib/supabase/admin"
import type { IntakeLead, IntakeStep, Json } from "@/types/database"

// Adds the booking note to the client's Clio Grow matter on its own: when the
// booking comes in, when a lead's page opens, and with the open-leads sync.
// It only writes when exactly one Grow matter fits the client; when several
// could, staff pick on the lead page. Reschedules and cancellations add a
// short note to the same matter. GROW_AUTO_NOTES=off turns the automatic part
// off and leaves the lead page's buttons.

const DAY = 24 * 60 * 60 * 1000
const MATCH_PER_RUN = 8
const MAX_MATTER_PAGES = 20

export const GROW_LEAD_COLUMNS =
  "id, status, created_at, external_id, client_first, client_last, email, phone, consult_datetime, consult_type, consulting_attorney, method, office, self_scheduled, matter_type, county, opposing_party_name, referral_source, qualified, description, raw_payload"

export type GrowLead = GrowNoteLead & Pick<IntakeLead, "id" | "status" | "created_at">

type GrowMatter = {
  id: number
  description?: string | null
  type?: string | null
  status?: string | null
  status_category?: string | null
  created_at: string
  client?: { id: number; full_name?: string | null; phone_number?: string | null; primary_email?: string | null } | null
}
type GrowContact = { id: number; emails?: string[] | null; phone_numbers?: string[] | null }
type Admin = NonNullable<ReturnType<typeof createAdminClient>>

const autoOn = () => process.env.GROW_AUTO_NOTES !== "off"
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").slice(-10)

/** intake_steps allows one row per lead and key, so a repeat updates that row. */
async function setStep(admin: Admin, leadId: string, key: string, state: IntakeStep["state"], detail: Record<string, unknown>, error: string | null = null) {
  const { data: row } = await admin.from("intake_steps").select("id").eq("lead_id", leadId).eq("step_key", key).maybeSingle()
  const now = new Date().toISOString()
  if (row) await admin.from("intake_steps").update({ state, detail: detail as unknown as Json, error, created_at: now, updated_at: now }).eq("id", row.id)
  else await admin.from("intake_steps").insert({ lead_id: leadId, step_key: key, state, detail: detail as unknown as Json, error })
}

const clearStep = (admin: Admin, leadId: string, key: string) => admin.from("intake_steps").delete().eq("lead_id", leadId).eq("step_key", key)

function candidate(m: GrowMatter): GrowCandidate {
  return {
    id: m.id,
    name: m.client?.full_name || m.description || `Matter ${m.id}`,
    detail: [m.description && m.description !== m.client?.full_name ? m.description : null, m.type, m.status].filter(Boolean).join(" · "),
    created_at: m.created_at,
  }
}

/** Grow matters opened since a date (Grow can't list a contact's matters directly). */
async function mattersCreatedSince(since: Date): Promise<GrowMatter[]> {
  const out: GrowMatter[] = []
  let pageToken: string | null = null
  for (let i = 0; i < MAX_MATTER_PAGES; i++) {
    const q = new URLSearchParams({ created_since: since.toISOString() })
    if (pageToken) q.set("page_token", pageToken)
    const res = await growFetch<{ data?: GrowMatter[]; meta?: { paging?: { next?: string | null } } }>(`/matters?${q}`)
    out.push(...(res.data ?? []))
    const next = res.meta?.paging?.next
    pageToken = next ? new URL(next).searchParams.get("page_token") : null
    if (!pageToken) break
  }
  return out
}

/** The Grow contacts that are this client: same email or same phone number. */
async function contactIds(lead: GrowLead): Promise<Set<number>> {
  const ids = new Set<number>()
  const email = lead.email?.trim().toLowerCase() || null
  const phone = digits(lead.phone)
  for (const query of [email, phone.length === 10 ? phone : null]) {
    if (!query) continue
    const res = await growFetch<{ data?: GrowContact[] }>(`/contacts?query=${encodeURIComponent(query)}`)
    for (const c of res.data ?? []) {
      const byEmail = email && (c.emails ?? []).some((e) => e.toLowerCase() === email)
      const byPhone = phone.length === 10 && (c.phone_numbers ?? []).some((p) => digits(p) === phone)
      if (byEmail || byPhone) ids.add(c.id)
    }
  }
  return ids
}

/**
 * The client's matter for this consult: their one matter still in intake, or,
 * if they have several in intake, the one opened around the booking. Hired
 * matters are offered to staff but never picked on their own (a returning
 * client's new consult usually gets a new matter).
 */
function pickMatter(lead: GrowLead, matters: GrowMatter[], ids: Set<number>) {
  const email = lead.email?.trim().toLowerCase() || null
  const phone = digits(lead.phone)
  const mine = matters.filter(
    (m) =>
      m.client &&
      (ids.has(m.client.id) ||
        (email && m.client.primary_email?.toLowerCase() === email) ||
        (phone.length === 10 && digits(m.client.phone_number) === phone))
  )
  const intake = mine.filter((m) => (m.status_category ?? "intake").toLowerCase() === "intake")
  let matter: GrowMatter | null = intake.length === 1 ? intake[0] : null
  if (intake.length > 1) {
    const since = new Date(lead.created_at).getTime() - 3 * DAY
    const recent = intake.filter((m) => new Date(m.created_at).getTime() >= since)
    if (recent.length === 1) matter = recent[0]
  }
  return { matter, candidates: mine.map(candidate), result: (intake.length ? "several" : "hired") as "several" | "hired" }
}

/** Each lead's latest appointment and office address, for the note. */
async function noteContext(admin: Admin, leadIds: string[]) {
  const [{ data: appts }, { data: offices }] = await Promise.all([
    admin
      .from("appointments")
      .select("lead_id, canceled, end_time, location, paid:raw->>paid, notes:raw->>notes")
      .in("lead_id", leadIds)
      .order("datetime", { ascending: false }),
    admin.from("office_addresses").select("office, address"),
  ])
  const address = new Map((offices ?? []).map((o) => [o.office as string, o.address as string]))
  return (lead: GrowLead) => {
    const rows = (appts ?? []).filter((a) => a.lead_id === lead.id)
    const appt = rows.find((a) => !a.canceled) ?? rows[0] ?? null
    return {
      appt: appt ? { end_time: appt.end_time, location: appt.location, paid: appt.paid, notes: appt.notes } : null,
      office: lead.office ? address.get(lead.office) ?? null : null,
    }
  }
}

/** Post a note, unless an earlier run already posted one with this subject. */
async function postNote(matterId: string, note: { subject: string; body: string }): Promise<string | null> {
  try {
    const existing = await growFetch<{ data?: { id: number; subject?: string }[] }>(`/matters/${matterId}/notes`)
    const same = (existing.data ?? []).find((n) => n.subject === note.subject)
    if (same) return String(same.id)
  } catch {
    /* reading the notes is only a duplicate guard */
  }
  const res = await growFetch<{ data?: { id: number } }>(`/matters/${matterId}/notes`, {
    method: "POST",
    body: JSON.stringify({ data: { subject: note.subject.slice(0, 255), body: note.body.slice(0, 65000) } }),
  })
  return res.data?.id != null ? String(res.data.id) : null
}

async function writeNote(
  admin: Admin,
  lead: GrowLead,
  kind: GrowNoteKind,
  matterId: string,
  context: Awaited<ReturnType<typeof noteContext>>,
  extra: Record<string, unknown>
) {
  const { appt, office } = context(lead)
  const noteId = await postNote(matterId, growNote(kind, lead, appt, office))
  const key = kind === "booked" ? "grow_note" : kind === "rescheduled" ? "grow_note_rescheduled" : "grow_note_canceled"
  await setStep(admin, lead.id, key, "done", { action: "auto", matter_id: matterId, note_id: noteId, datetime: lead.consult_datetime, ...extra })
  // Done, so nothing is left for the Recovery page to show.
  await clearStep(admin, lead.id, "grow_note_failed")
  if (kind === "booked") await clearStep(admin, lead.id, "grow_match")
}

/** Bring these leads' Grow notes up to date. Returns the ids of the leads that changed. */
export async function syncGrowNotes(leads: GrowLead[], opts: { matchLimit?: number } = {}): Promise<string[]> {
  const admin = createAdminClient()
  if (!admin || !leads.length || !autoOn() || !(await growStatus()).connected) return []

  const ids = leads.map((l) => l.id)
  const { data: steps } = await admin
    .from("intake_steps")
    .select("lead_id, step_key, state, detail, error, created_at, updated_at")
    .in("lead_id", ids)
    .like("step_key", "grow_%")
  const context = await noteContext(admin, ids)
  const changed = new Set<string>()
  const toMatch: GrowLead[] = []

  for (const lead of leads) {
    if (lead.status === "stopped" || lead.status === "failed") continue
    const st = growState((steps ?? []).filter((s) => s.lead_id === lead.id))
    try {
      if (lead.status === "canceled") {
        if (st.noted && !st.canceled) {
          await writeNote(admin, lead, "canceled", st.noted.matterId, context, {})
          changed.add(lead.id)
        }
        // A canceled consult needs no matter picked any more.
        if (st.match) {
          await clearStep(admin, lead.id, "grow_match")
          changed.add(lead.id)
        }
      } else if (!st.noted) {
        if (lead.email || lead.phone) toMatch.push(lead)
      } else if (
        lead.consult_datetime &&
        st.lastDatetime &&
        new Date(lead.consult_datetime).getTime() !== new Date(st.lastDatetime).getTime()
      ) {
        await writeNote(admin, lead, "rescheduled", st.noted.matterId, context, {})
        changed.add(lead.id)
      }
    } catch (e) {
      await setStep(admin, lead.id, "grow_note_failed", "failed", {}, e instanceof Error ? e.message : "Clio Grow didn't take the note.")
      changed.add(lead.id)
    }
  }

  const batch = toMatch.slice(0, opts.matchLimit ?? MATCH_PER_RUN)
  if (!batch.length) return Array.from(changed)
  // The consult's matter is opened around the booking (LexiDesk makes it, or staff).
  const since = new Date(Math.min(...batch.map((l) => new Date(l.created_at).getTime())) - 30 * DAY)
  const matters = await mattersCreatedSince(since)
  for (const lead of batch) {
    try {
      const { matter, candidates, result } = pickMatter(lead, matters, await contactIds(lead))
      const before = growState((steps ?? []).filter((s) => s.lead_id === lead.id)).match
      if (matter) {
        await writeNote(admin, lead, "booked", String(matter.id), context, { matter_name: candidate(matter).name })
        changed.add(lead.id)
      } else if (candidates.length) {
        const same = before && before.result === result && before.candidates.map((c) => c.id).join() === candidates.map((c) => c.id).join()
        if (!same) {
          await setStep(admin, lead.id, "grow_match", "awaiting_human", { result, candidates })
          changed.add(lead.id)
        }
      } else if (before) {
        await clearStep(admin, lead.id, "grow_match")
        changed.add(lead.id)
      }
    } catch (e) {
      await setStep(admin, lead.id, "grow_note_failed", "failed", {}, e instanceof Error ? e.message : "Clio Grow didn't take the note.")
      changed.add(lead.id)
    }
  }
  return Array.from(changed)
}

/** One lead: when its booking comes in, or its page opens. */
export async function syncGrowForLead(leadId: string): Promise<string[]> {
  const admin = createAdminClient()
  if (!admin) return []
  const { data } = await admin.from("intake_leads").select(GROW_LEAD_COLUMNS).eq("id", leadId).maybeSingle()
  return data ? syncGrowNotes([data as unknown as GrowLead], { matchLimit: 1 }) : []
}

/** The last 30 days of leads, for the open-leads sync. */
export async function syncOpenLeadsFromGrow() {
  const admin = createAdminClient()
  if (!admin) return { checked: 0, changed: 0 }
  const { data } = await admin
    .from("intake_leads")
    .select(GROW_LEAD_COLUMNS)
    .not("status", "in", "(stopped,failed)")
    .gte("created_at", new Date(Date.now() - 30 * DAY).toISOString())
    .order("created_at", { ascending: false })
  const leads = (data ?? []) as unknown as GrowLead[]
  return { checked: leads.length, changed: (await syncGrowNotes(leads)).length }
}

/**
 * From the lead page: put the booking note on the matter staff chose (one of
 * the candidates, or a Grow link or number they pasted).
 */
export async function addGrowNoteTo(leadId: string, matterRef: string, by: string): Promise<{ ok: boolean; message: string }> {
  const admin = createAdminClient()
  if (!admin) return { ok: false, message: "The server isn't set up for this (service key missing)." }
  if (!(await growStatus()).connected) return { ok: false, message: "Clio Grow isn't connected yet (Intake Settings)." }
  const matterId = matterRef.match(/(\d{3,})(?!.*\d{3,})/)?.[1]
  if (!matterId) return { ok: false, message: "Paste a Clio Grow matter link or its number." }

  const { data } = await admin.from("intake_leads").select(GROW_LEAD_COLUMNS).eq("id", leadId).maybeSingle()
  if (!data) return { ok: false, message: "Lead not found." }
  const lead = data as unknown as GrowLead
  const { data: done } = await admin.from("intake_steps").select("id").eq("lead_id", leadId).eq("step_key", "grow_note").maybeSingle()
  if (done) return { ok: true, message: "The booking note is already in Clio Grow." }

  try {
    const { data: matter } = await growFetch<{ data: GrowMatter }>(`/matters/${matterId}`)
    const context = await noteContext(admin, [leadId])
    const { appt, office } = context(lead)
    const noteId = await postNote(matterId, growNote("booked", lead, appt, office))
    await setStep(admin, leadId, "grow_note", "done", {
      action: "added",
      by,
      matter_id: matterId,
      note_id: noteId,
      datetime: lead.consult_datetime,
      matter_name: candidate(matter).name,
    })
    await clearStep(admin, leadId, "grow_match")
    await clearStep(admin, leadId, "grow_note_failed")
    return { ok: true, message: `Booking note added to ${candidate(matter).name} in Clio Grow.` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Clio Grow didn't take the note."
    await setStep(admin, leadId, "grow_note_failed", "failed", { by }, msg)
    return { ok: false, message: msg.includes("(404)") ? "No Clio Grow matter has that number." : msg }
  }
}
