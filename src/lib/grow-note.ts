import type { IntakeLead, IntakeStep } from "@/types/database"
import { consultMethod } from "@/lib/client-messages"
import { plain } from "@/lib/consult-post"

// The booking note on the client's Clio Grow matter, so the team finds every
// detail of the consult in Grow instead of checking Acuity, LexiDesk and the
// dashboard. One note when the booking comes in, a short one if it is moved or
// canceled. Shared by the automatic sync and the lead page's preview.

const TZ = "America/Phoenix"

export type GrowNoteKind = "booked" | "rescheduled" | "canceled"

export type GrowNoteLead = Pick<
  IntakeLead,
  | "client_first"
  | "client_last"
  | "email"
  | "phone"
  | "consult_datetime"
  | "consult_type"
  | "consulting_attorney"
  | "method"
  | "office"
  | "self_scheduled"
  | "matter_type"
  | "county"
  | "opposing_party_name"
  | "referral_source"
  | "qualified"
  | "description"
  | "external_id"
  | "raw_payload"
>

/** The lead's latest Acuity appointment, as the appointments mirror holds it. */
export type GrowNoteAppt = { end_time: string | null; location: string | null; paid: string | null; notes: string | null } | null

const clock = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" })
    .format(d)
    .replace(/\s*([AP])M$/i, (_, p: string) => `${p.toLowerCase()}m`)
const longDay = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(d)
const shortDay = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" }).format(d)
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// The booking form's "who referred you" answer is free text, often "No" or "N/A".
const NOT_A_NAME = /^(no|na|n\s*\/\s*a|none|no\s*one|nobody|nope|not applicable|unknown|return|me|myself|self|-+|\.+)$/i

/**
 * Who referred the client, when the booking names someone. Only a referral
 * (attorney, personal, client...) has a person behind it, not Google or TikTok.
 */
export function referredBy(lead: Pick<IntakeLead, "referral_source" | "raw_payload">): string | null {
  if (!/referral/i.test(lead.referral_source ?? "")) return null
  const answer = (lead.raw_payload as { extras?: { referral_name?: unknown } } | null)?.extras?.referral_name
  const text = typeof answer === "string" ? answer.trim() : ""
  return text && !NOT_A_NAME.test(text.replace(/[.!]+$/, "").trim()) ? text : null
}

const nameWords = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)

/**
 * Whether Grow spells the client's name differently from the booking: a typo,
 * or a nickname against the legal name. Compares the first and last names
 * ("Last, First" in Grow is read as First Last); a middle name doesn't count.
 */
export function nameDiffers(first: string | null, last: string | null, growName: string | null): boolean {
  const booked = nameWords([first, last].filter(Boolean).join(" "))
  const [before, after] = (growName ?? "").split(",", 2)
  const grow = nameWords(after != null ? `${after} ${before}` : before)
  if (!booked.length || !grow.length) return false
  return booked[0] !== grow[0] || booked[booked.length - 1] !== grow[grow.length - 1]
}

/** Lines with a value only; blocks separated by one blank line. */
function blocks(...groups: (string | null | false | undefined)[][]) {
  return groups
    .map((g) => g.filter((l): l is string => Boolean(l)))
    .filter((g) => g.length)
    .map((g) => g.join("\n"))
    .join("\n\n")
}

export function growNote(
  kind: GrowNoteKind,
  lead: GrowNoteLead,
  appt: GrowNoteAppt,
  officeAddress: string | null
): { subject: string; body: string } {
  const name = [lead.client_first, lead.client_last].filter(Boolean).join(" ")
  const consult = lead.consult_type === "LSS" ? "Limited Scope Strategy Session" : "Initial Consultation"
  const start = lead.consult_datetime ? new Date(lead.consult_datetime) : null
  const end = appt?.end_time ? new Date(appt.end_time) : null
  const at = start ? `${shortDay(start)}, ${clock(start)}` : null
  const when = start ? `When: ${longDay(start)}, ${clock(start)}${end ? ` to ${clock(end)}` : ""} (Arizona time)` : null

  const method = consultMethod(lead.method, appt?.location ?? null)
  const how =
    method === "in_person"
      ? `How: In person${lead.office ? ` at the ${capital(lead.office)} office` : ""}`
      : method === "phone"
        ? "How: Phone"
        : method === "zoom"
          ? "How: Zoom"
          : null
  const zoom = appt?.location?.match(/https?:\/\/\S*zoom\.us\/\S+/i)?.[0]
  const where = [how, zoom && `Zoom link: ${zoom}`, method === "in_person" && officeAddress && `Address: ${officeAddress}`]
  const acuity = lead.external_id ? `Acuity appointment #${lead.external_id}` : null

  if (kind === "canceled") {
    return {
      subject: `Consultation canceled${at ? `: ${at}` : ""}`,
      body: blocks(
        [`This ${consult}${lead.consulting_attorney ? ` with ${lead.consulting_attorney}` : ""} was canceled in Acuity:`],
        [when, name && `Client: ${name}`, acuity],
        ["Added by the Modern Law dashboard."]
      ),
    }
  }
  if (kind === "rescheduled") {
    return {
      subject: `Consultation rescheduled${at ? ` to ${at}` : ""}`,
      body: blocks(
        [`The ${consult}${lead.consulting_attorney ? ` with ${lead.consulting_attorney}` : ""} was moved. The new time:`],
        [when, ...where],
        [acuity],
        ["Added by the Modern Law dashboard."]
      ),
    }
  }

  const paid = appt?.paid?.trim()
  const fee = paid ? (/^y/i.test(paid) ? "Yes" : /^n/i.test(paid) ? "No" : paid) : null
  const extras = (lead.raw_payload as { extras?: { lexidesk_conversation_url?: string } } | null)?.extras
  const description = lead.description ?? appt?.notes ?? null
  return {
    subject: `Consultation booked: ${consult}${lead.consulting_attorney ? ` with ${lead.consulting_attorney}` : ""}${at ? `, ${at}` : ""}`,
    body: blocks(
      [`${consult}${lead.consulting_attorney ? ` with ${lead.consulting_attorney}` : ""}`],
      [
        when,
        ...where,
        lead.self_scheduled == null ? null : `Booked by: ${lead.self_scheduled ? "the client (online or through Lexi)" : "staff"}`,
        fee && `Fee paid: ${fee}`,
      ],
      [name && `Client: ${name}`, lead.phone && `Phone: ${lead.phone}`, lead.email && `Email: ${lead.email}`],
      [
        lead.matter_type && `Matter type: ${lead.matter_type}`,
        lead.county && `County: ${lead.county}`,
        lead.opposing_party_name && `Opposing party: ${lead.opposing_party_name}`,
        lead.referral_source && `Referral source: ${lead.referral_source}`,
        referredBy(lead) && `Referred by: ${referredBy(lead)}`,
        lead.qualified != null && `Qualified lead: ${lead.qualified ? "Yes" : "No"}`,
      ],
      [description && "Description:", description && plain(description)],
      [acuity, extras?.lexidesk_conversation_url && `LexiDesk conversation: ${extras.lexidesk_conversation_url}`],
      ["Added by the Modern Law dashboard."]
    ),
  }
}

// ── Where a lead stands, from its grow_* steps ──────────────────────────────
// grow_note             the booking note (one per lead)
// grow_note_rescheduled the latest reschedule note
// grow_note_canceled    the cancellation note
// grow_note_failed      the latest failed attempt
// grow_match            more than one matter fits (or only a hired one), for staff to pick

// Grow ids are ULIDs like 01M4CAXGV5PTNK0V23124HZE32 (the id in grow.clio.com/matters/...).
export type GrowCandidate = { id: string | number; name: string; detail: string; created_at: string }

type StepRow = Pick<IntakeStep, "step_key" | "state" | "detail" | "error" | "created_at" | "updated_at">

export type GrowState = {
  /** clientName: the client's name as Grow has it, to check against the booking. */
  noted: { matterId: string; matterName: string | null; clientName: string | null; by: string | null; at: string } | null
  /** The consult time the latest note describes, to spot a reschedule. */
  lastDatetime: string | null
  canceled: boolean
  failed: string | null
  match: { result: "several" | "hired"; candidates: GrowCandidate[] } | null
}

export function growState(steps: StepRow[]): GrowState {
  const get = (key: string) => steps.find((s) => s.step_key === key)
  const detail = (s: StepRow | undefined) => (s?.detail ?? {}) as Record<string, unknown>
  const note = get("grow_note")
  const moved = get("grow_note_rescheduled")
  const fail = get("grow_note_failed")
  const match = get("grow_match")
  const lastOk = [note, moved, get("grow_note_canceled")].reduce((t, s) => Math.max(t, s ? new Date(s.updated_at).getTime() : 0), 0)
  const n = detail(note)
  const m = detail(match)
  return {
    noted: note
      ? {
          matterId: String(n.matter_id ?? ""),
          matterName: (n.matter_name as string | undefined) ?? null,
          clientName: (n.client_name as string | undefined) ?? null,
          by: (n.by as string | undefined) ?? null,
          at: note.created_at,
        }
      : null,
    lastDatetime: ((detail(moved).datetime ?? n.datetime) as string | undefined) ?? null,
    canceled: Boolean(get("grow_note_canceled")),
    failed: fail && fail.state === "failed" && new Date(fail.updated_at).getTime() > lastOk ? fail.error ?? "Clio Grow didn't take the note." : null,
    match:
      !note && match
        ? { result: m.result === "hired" ? "hired" : "several", candidates: (m.candidates as GrowCandidate[] | undefined) ?? [] }
        : null,
  }
}
