import "server-only"

import { clioFetch, clioStatus } from "@/lib/clio"
import { CLIO_APP } from "@/lib/clio-intake"
import { growFetch, growStatus } from "@/lib/grow"
import { logStep } from "@/lib/intake-step-log"
import { createAdminClient } from "@/lib/supabase/admin"
import type { IntakeLead, IntakeStep } from "@/types/database"

// The conflict check's search, done for staff: the client's and the opposing
// party's names looked up in Clio Manage (each matching contact, the matters
// they are the client on and the matters they are related to) and in Clio
// Grow (the contact's status there). It only reads. The decision stays with
// staff: the result is shown on the lead's conflict step, with the matches the
// firm should look at flagged. Clio's own conflict check also searches notes,
// documents and custom fields, so the step still links to it.
//
// Runs when a booking comes in, when the lead's page opens and with the
// open-leads sync, for leads whose conflict check is still pending. A saved
// search is reused until a name, the lead's Clio records or 12 hours change.

export const CONFLICT_SEARCH = "conflict_search"
const FRESH_MS = 12 * 60 * 60 * 1000
const PER_SIDE = 8

export type ConflictRole = { text: string; url: string | null; flag: boolean }
export type ConflictHit = {
  side: "client" | "opposing"
  name: string
  /** The Clio Manage contact, when there is one. */
  url: string | null
  /** This lead's own client or opposing-party record. */
  self: boolean
  flag: boolean
  roles: ConflictRole[]
}
export type ConflictSearch = {
  action: "auto"
  client: string
  opposing: string | null
  /** Why the opposing party wasn't searched. */
  opposing_skipped: string | null
  contact_id: string | null
  matter_id: string | null
  searched: string[]
  hits: ConflictHit[]
  flags: number
  errors: string[]
  at: string
}

type Lead = Pick<
  IntakeLead,
  "id" | "status" | "client_first" | "client_last" | "email" | "phone" | "opposing_party_name" | "conflict_status" | "clio_client_contact_id" | "clio_op_contact_id" | "clio_matter_id"
>
const LEAD_COLUMNS =
  "id, status, client_first, client_last, email, phone, opposing_party_name, conflict_status, clio_client_contact_id, clio_op_contact_id, clio_matter_id"

type Contact = { id: number; name: string; primary_email_address?: string | null; primary_phone_number?: string | null }
type Matter = { id: number; display_number: string; status: string }
type Relationship = { id: number; description: string | null; matter: (Matter & { client?: { id: number; name: string } | null }) | null }
type GrowContact = { id: number | string; clio_id?: number | null; name?: string | null; status?: string | null; emails?: string[] | null; phone_numbers?: string[] | null }

const words = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’.]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

/** Same person by name: the first and last words match (a middle name or initial may differ). */
export function sameName(a: string, b: string) {
  const x = words(a)
  const y = words(b)
  if (!x.length || !y.length) return false
  if (x.length === 1 || y.length === 1) return x.join(" ") === y.join(" ")
  return x[0] === y[0] && x[x.length - 1] === y[y.length - 1]
}

/** A name worth searching: two words with letters. Acuity sometimes holds "4" or "n/a". */
function usableName(s: string | null | undefined) {
  const w = words(s ?? "").filter((t) => /[a-z]/.test(t))
  return w.length >= 2 && !["n a", "none", "unknown", "tbd", "not sure", "no one"].includes(w.join(" "))
}

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").slice(-10)
const opposingRole = (d: string | null) => /^(op|opp)$|oppos/i.test((d ?? "").trim())
const contactUrl = (id: number | string) => `${CLIO_APP}/contacts/${id}`
const matterUrl = (id: number | string) => `${CLIO_APP}/matters/${id}`
const matterLabel = (m: Matter) => `${m.display_number}${m.status ? ` (${m.status})` : ""}`
/** A Grow status that says the person dealt with the firm as a (would-be) client: Intake, Hired, Did Not Hire. */
const growClientStatus = (s: string) => /client|intake|consult|hire|lead|prospect|retain/i.test(s)

const fullName = (lead: Lead) => [lead.client_first, lead.client_last].filter(Boolean).join(" ").trim()

async function manageMatches(name: string): Promise<Contact[]> {
  const fields = "id,name,primary_email_address,primary_phone_number"
  const res = await clioFetch<{ data: Contact[] }>(`/api/v4/contacts?query=${encodeURIComponent(name)}&fields=${fields}&limit=50`)
  return res.data.filter((c) => sameName(c.name, name))
}

async function manageRecords(contactId: number) {
  const rel = encodeURIComponent("id,description,matter{id,display_number,status,client}")
  const [rels, matters] = await Promise.all([
    clioFetch<{ data: Relationship[] }>(`/api/v4/relationships?contact_id=${contactId}&fields=${rel}&limit=50`),
    clioFetch<{ data: Matter[] }>(`/api/v4/matters?client_id=${contactId}&fields=id,display_number,status&limit=50`),
  ])
  return { rels: rels.data, matters: matters.data }
}

async function growMatches(name: string): Promise<GrowContact[]> {
  const res = await growFetch<{ data?: GrowContact[] }>(`/contacts?query=${encodeURIComponent(name)}`)
  return (res.data ?? []).filter((c) => c.name && sameName(c.name, name))
}

/** Search Clio Manage and Grow for one lead. Reads only. Throws when Clio Manage can't be searched. */
export async function searchConflicts(lead: Lead): Promise<ConflictSearch> {
  const client = fullName(lead)
  const opposingName = lead.opposing_party_name?.trim() || null
  const opposing = usableName(opposingName) ? opposingName : null
  const ownId = lead.clio_client_contact_id ? Number(lead.clio_client_contact_id) : null
  const matterId = lead.clio_matter_id ? Number(lead.clio_matter_id) : null
  const email = lead.email?.trim().toLowerCase() || null
  const phone = digits(lead.phone)
  // The client's own record: same email, or the linked contact or same phone
  // under the client's name. A phone shared with someone else (a spouse, a
  // parent) doesn't make their contact the client's.
  const emailIs = (e: string | null | undefined) => Boolean(email && e?.trim().toLowerCase() === email)
  const isClientRecord = (c: Contact) =>
    emailIs(c.primary_email_address) ||
    ((c.id === ownId || (phone.length === 10 && digits(c.primary_phone_number) === phone)) && sameName(c.name, client))

  const hits: ConflictHit[] = []
  const errors: string[] = []

  // ── Clio Manage ──
  const sides: { side: ConflictHit["side"]; name: string }[] = [{ side: "client", name: client }]
  if (opposing) sides.push({ side: "opposing", name: opposing })
  for (const { side, name } of sides) {
    const found = await manageMatches(name)
    // The client's own contact, even when it's spelled differently in Clio.
    if (side === "client" && ownId != null && !found.some((c) => c.id === ownId)) {
      const own = await clioFetch<{ data: Contact }>(`/api/v4/contacts/${ownId}?fields=id,name,primary_email_address,primary_phone_number`).catch(() => null)
      if (own && isClientRecord(own.data)) found.unshift(own.data)
    }
    const records = await Promise.all(found.slice(0, PER_SIDE).map(async (c) => ({ c, ...(await manageRecords(c.id)) })))
    for (const { c, rels, matters } of records) {
      const roles: ConflictRole[] = []
      let self = side === "client" ? isClientRecord(c) : lead.clio_op_contact_id != null && String(c.id) === lead.clio_op_contact_id
      for (const m of matters) {
        if (m.id === matterId) continue
        // The opposing party being the firm's client is the conflict to catch.
        roles.push({ text: `Client on ${matterLabel(m)}`, url: matterUrl(m.id), flag: side === "opposing" })
      }
      for (const r of rels) {
        const m = r.matter
        if (!m) continue
        const opp = opposingRole(r.description)
        if (m.id === matterId) {
          if (side === "opposing" && opp) self = true
          continue
        }
        const role = (r.description ?? "Related").trim()
        const whose = m.client?.name ? `, ${m.client.name}'s matter` : ""
        if (side === "client") {
          // The client on the other side of someone the firm represented.
          const own = m.client?.id != null && m.client.id === ownId
          roles.push({ text: `${opp ? "Opposing party" : role} on ${matterLabel(m)}${whose}`, url: matterUrl(m.id), flag: !own })
        } else {
          // The same opponent on the client's own (often earlier) matter.
          const theirs = m.client?.id != null && m.client.id === ownId
          if (theirs && opp) self = true
          roles.push({
            text: theirs ? `${opp ? "Opposing party" : role} on the client's matter ${matterLabel(m)}` : `${opp ? "Opposing party" : role} on ${matterLabel(m)}${whose}`,
            url: matterUrl(m.id),
            // Opposing another client is no conflict; any other tie to a client's case is worth a look.
            flag: !opp && !theirs,
          })
        }
      }
      hits.push({ side, name: c.name, url: contactUrl(c.id), self, flag: roles.some((r) => r.flag), roles })
    }
  }
  const searched = ["Clio Manage"]

  // ── Clio Grow: who the firm has spoken to, and how Grow files them ──
  if ((await growStatus()).connected) {
    try {
      for (const { side, name } of sides) {
        for (const g of (await growMatches(name)).slice(0, PER_SIDE)) {
          const status = g.status?.trim() || "No status"
          const flag = side === "client" ? /oppos/i.test(status) : growClientStatus(status)
          const role: ConflictRole = { text: `Clio Grow: ${status}`, url: null, flag }
          const same = g.clio_id != null ? hits.find((h) => h.side === side && h.url === contactUrl(g.clio_id as number)) : undefined
          if (same) {
            same.roles.push(role)
            same.flag = same.flag || flag
            continue
          }
          const self =
            side === "client" &&
            ((g.clio_id != null && g.clio_id === ownId) ||
              (g.emails ?? []).some((e) => email && e.toLowerCase() === email) ||
              (g.phone_numbers ?? []).some((p) => phone.length === 10 && digits(p) === phone))
          hits.push({ side, name: g.name ?? name, url: g.clio_id ? contactUrl(g.clio_id) : null, self, flag, roles: [role] })
        }
      }
      searched.push("Clio Grow")
    } catch (e) {
      errors.push(`Clio Grow couldn't be searched (${e instanceof Error ? e.message.slice(0, 120) : "error"}).`)
    }
  }

  // Flagged first, then other people with the name, then the lead's own records.
  hits.sort((a, b) => Number(b.flag) - Number(a.flag) || Number(a.self) - Number(b.self))
  return {
    action: "auto",
    client,
    opposing,
    opposing_skipped: opposing
      ? null
      : opposingName
        ? `The booking's opposing party ("${opposingName}") isn't a full name, so it wasn't searched.`
        : "The booking names no opposing party.",
    contact_id: lead.clio_client_contact_id,
    matter_id: lead.clio_matter_id,
    searched,
    hits,
    flags: hits.filter((h) => h.flag).length,
    errors,
    at: new Date().toISOString(),
  }
}

/** The saved search, when it still fits the lead as it is now. */
function fresh(saved: ConflictSearch | null, lead: Lead) {
  if (!saved) return false
  return (
    saved.client === fullName(lead) &&
    saved.opposing === (usableName(lead.opposing_party_name) ? lead.opposing_party_name?.trim() ?? null : null) &&
    saved.contact_id === lead.clio_client_contact_id &&
    saved.matter_id === lead.clio_matter_id &&
    Date.now() - Date.parse(saved.at) < FRESH_MS
  )
}

const pending = (lead: Lead) => lead.conflict_status === "pending" && !["canceled", "stopped", "failed", "done"].includes(lead.status)

export function savedSearch(steps: Pick<IntakeStep, "step_key" | "detail">[]): ConflictSearch | null {
  const s = steps.find((x) => x.step_key === CONFLICT_SEARCH)
  return (s?.detail as ConflictSearch | null) ?? null
}

/**
 * Search for a lead whose conflict check is pending, unless a fresh search is
 * saved. `force` searches again anyway (the lead page's button). Returns the
 * search when one ran, null when nothing needed to.
 */
export async function runConflictSearch(leadId: string, opts: { force?: boolean } = {}): Promise<ConflictSearch | null> {
  const admin = createAdminClient()
  if (!admin || !(await clioStatus()).connected) return null
  const [{ data: lead }, { data: step }] = await Promise.all([
    admin.from("intake_leads").select(LEAD_COLUMNS).eq("id", leadId).maybeSingle(),
    admin.from("intake_steps").select("step_key, detail").eq("lead_id", leadId).eq("step_key", CONFLICT_SEARCH).maybeSingle(),
  ])
  if (!lead || !pending(lead as Lead)) return null
  if (!opts.force && fresh(savedSearch(step ? [step] : []), lead as Lead)) return null
  const result = await searchConflicts(lead as Lead)
  await logStep(admin, { lead_id: leadId, step_key: CONFLICT_SEARCH, state: "done", detail: result as unknown as Record<string, unknown> })
  return result
}

/** The open-leads sync: search the pending leads that have no fresh search, a few per run. */
export async function runConflictSearchForOpenLeads(limit = 3) {
  const admin = createAdminClient()
  if (!admin || !(await clioStatus()).connected) return { checked: 0, ran: 0 }
  const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  const { data: leads } = await admin
    .from("intake_leads")
    .select(LEAD_COLUMNS)
    .eq("conflict_status", "pending")
    .not("status", "in", "(canceled,stopped,failed,done)")
    .gte("consult_datetime", since)
    .order("consult_datetime", { ascending: true })
    .limit(50)
  const list = (leads ?? []) as Lead[]
  if (!list.length) return { checked: 0, ran: 0 }
  const { data: steps } = await admin
    .from("intake_steps")
    .select("lead_id, step_key, detail")
    .eq("step_key", CONFLICT_SEARCH)
    .in("lead_id", list.map((l) => l.id))
  const saved = new Map((steps ?? []).map((s) => [s.lead_id, s.detail as unknown as ConflictSearch]))
  let ran = 0
  for (const lead of list) {
    if (ran >= limit) break
    if (fresh(saved.get(lead.id) ?? null, lead)) continue
    try {
      const result = await searchConflicts(lead)
      await logStep(admin, { lead_id: lead.id, step_key: CONFLICT_SEARCH, state: "done", detail: result as unknown as Record<string, unknown> })
      ran++
    } catch {
      /* Clio hiccup: the next run tries again */
    }
  }
  return { checked: list.length, ran }
}
