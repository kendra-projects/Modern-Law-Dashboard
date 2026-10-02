import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import type { Json } from "@/types/database"
import {
  ACUITY_FIELD_TO_COLUMN,
  conflictFromYesNo,
  yesNoToBool,
} from "@/lib/acuity-map"

// Talks to the Acuity Scheduling API. Acuity's webhook only sends an appointment
// id + action — the real data (client, form answers) comes from GET the
// appointment. Auth is HTTP Basic with the account's User ID + API Key, read from
// env. With no creds set this module no-ops, so the webhook still works before
// the client hands over the key; the moment ACUITY_USER_ID / ACUITY_API_KEY land
// in Vercel, enrichment starts filling leads in automatically.

type AcuityForm = { id: number; values: { fieldID: number; value: string }[] }
export type AcuityAppointment = {
  id: number
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  datetime?: string
  type?: string
  appointmentTypeID?: number
  calendarID?: number
  calendar?: string
  location?: string
  category?: string
  duration?: string | number
  canceled?: boolean
  /** The staff login that booked it; empty when the client booked (online or through Lexi). */
  scheduledBy?: string | null
  forms?: AcuityForm[]
}

/**
 * Only new consultations become intake leads. Acuity fires the webhook for every
 * appointment type, including existing clients' follow-ups and internal
 * meetings, which must be ignored. Consult types are the "…Consultation…" ones
 * (IC) and "Limited Scope Strategy Session…" (LSS).
 */
export function isConsultType(type: string | undefined): boolean {
  if (!type) return false
  return /(consultation|strategy session)/i.test(type) && !/follow[\s-]?up/i.test(type)
}

/** "Hillary Ryan • Family Law Attorney" / "Richard Nedlin - Attorney" → the name. */
function attorneyFromCalendar(cal: string | undefined): string | null {
  if (!cal) return null
  const name = cal.split(/\s[•-]\s/)[0]?.trim()
  return name || null
}

/** Zoom link → zoom; an office address → in person at that office; else phone. */
function methodAndOffice(loc: string | undefined) {
  const s = (loc ?? "").toLowerCase()
  if (!s.trim()) return {}
  if (s.includes("zoom")) return { method: "zoom" }
  if (s.includes("mesa") || s.includes("baseline")) return { method: "in_person", office: "mesa" }
  if (s.includes("peoria") || s.includes("thunderbird")) return { method: "in_person", office: "peoria" }
  if (s.includes("tucson") || s.includes("la cholla")) return { method: "in_person", office: "tucson" }
  if (s.includes("phone") || /\d{3}\D?\d{3}\D?\d{4}/.test(s)) return { method: "phone" }
  return {}
}

function acuityCreds() {
  const userId = process.env.ACUITY_USER_ID
  const apiKey = process.env.ACUITY_API_KEY
  if (!userId || !apiKey) return null
  return { userId, apiKey }
}

export async function fetchAcuityAppointment(
  id: string | number
): Promise<AcuityAppointment | null> {
  const creds = acuityCreds()
  if (!creds) return null
  const auth = Buffer.from(`${creds.userId}:${creds.apiKey}`).toString("base64")
  try {
    const res = await fetch(
      `https://acuityscheduling.com/api/v1/appointments/${id}`,
      { headers: { Authorization: `Basic ${auth}` }, cache: "no-store" }
    )
    if (!res.ok) return null
    return (await res.json()) as AcuityAppointment
  } catch {
    return null
  }
}

/**
 * Turn an Acuity appointment into an intake_leads patch. Direct fields map to
 * columns; form answers map by numeric field id (see acuity-map). Anything
 * without a column (referral name, minor-children, LexiDesk ids) is returned in
 * `extras` to fold into raw_payload rather than lost.
 */
export function mapAppointmentToLead(a: AcuityAppointment) {
  const patch: Record<string, unknown> = {
    client_first: a.firstName ?? null,
    client_last: a.lastName ?? null,
    email: a.email ?? null,
    phone: a.phone ?? null,
    consult_datetime: a.datetime ?? null,
    consulting_attorney: attorneyFromCalendar(a.calendar),
    consult_type: /strategy session/i.test(a.type ?? "") ? "LSS" : "IC",
    self_scheduled: !a.scheduledBy,
    ...methodAndOffice(a.location),
  }
  const extras: Record<string, string> = {}
  const noColumn = new Set([
    "referral_name",
    "minor_children",
    "lexidesk_client_id",
    "lexidesk_conversation_id",
    "lexidesk_conversation_url",
    "lexidesk_appointment_offer_id",
  ])

  for (const form of a.forms ?? []) {
    for (const v of form.values ?? []) {
      const col = ACUITY_FIELD_TO_COLUMN[v.fieldID]
      if (!col || v.value == null || v.value === "") continue
      if (col === "conflict_status") patch.conflict_status = conflictFromYesNo(v.value)
      else if (col === "qualified") patch.qualified = yesNoToBool(v.value)
      else if (col === "priority_score") {
        const n = parseInt(v.value, 10)
        if (Number.isFinite(n)) patch.priority_score = n
      } else if (noColumn.has(col)) extras[col] = v.value
      else patch[col] = v.value
    }
  }
  return { patch, extras }
}

/**
 * Fetch + map an appointment onto a lead. No-op (returns false) without creds.
 * Pass `preloaded` when the caller already fetched the appointment.
 */
export async function enrichLeadFromAcuity(
  leadId: string,
  appointmentId: string | number,
  preloaded?: AcuityAppointment | null
): Promise<boolean> {
  const a = preloaded ?? (await fetchAcuityAppointment(appointmentId))
  if (!a) return false
  const admin = createAdminClient()
  if (!admin) return false

  const { patch, extras } = mapAppointmentToLead(a)
  const { error } = await admin
    .from("intake_leads")
    .update({
      ...patch,
      raw_payload: { acuity: a, extras } as unknown as Json,
    })
    .eq("id", leadId)
  if (error) return false

  // Only a brand-new lead moves to "enriched". A reschedule re-pulls the
  // details but must never drag a lead that's already further along back.
  await admin
    .from("intake_leads")
    .update({ status: "enriched" })
    .eq("id", leadId)
    .eq("status", "received")

  await admin.from("intake_steps").insert({
    lead_id: leadId,
    step_key: "acuity_enrich",
    state: "done",
    detail: { appointment_id: a.id } as unknown as Json,
  })
  return true
}

/**
 * Mirror every Acuity appointment (consult or not) into `appointments`, so the
 * dashboard's Appointments page shows the whole schedule as history/info.
 * Only consults also become intake leads; `leadId` links the two.
 */
export async function upsertAppointment(
  a: AcuityAppointment,
  opts: { leadId?: string | null; canceled?: boolean } = {}
): Promise<void> {
  const admin = createAdminClient()
  if (!admin) return
  const dur = a.duration != null ? parseInt(String(a.duration), 10) : NaN
  const start = a.datetime ? new Date(a.datetime) : null
  const row: Record<string, unknown> = {
    acuity_id: String(a.id),
    datetime: start ? start.toISOString() : null,
    end_time: start && Number.isFinite(dur) ? new Date(start.getTime() + dur * 60000).toISOString() : null,
    duration_min: Number.isFinite(dur) ? dur : null,
    type: a.type ?? null,
    category: a.category?.trim() ?? null,
    appointment_type_id: a.appointmentTypeID != null ? String(a.appointmentTypeID) : null,
    calendar: a.calendar?.trim() ?? null,
    attorney: attorneyFromCalendar(a.calendar),
    client_first: a.firstName ?? null,
    client_last: a.lastName ?? null,
    email: a.email ?? null,
    phone: a.phone ?? null,
    location: a.location ?? null,
    canceled: Boolean(opts.canceled || a.canceled),
    is_consult: isConsultType(a.type),
    raw: a as unknown as Json,
    updated_at: new Date().toISOString(),
  }
  if (opts.leadId) row.lead_id = opts.leadId
  await admin.from("appointments").upsert(row as never, { onConflict: "acuity_id" })
}
