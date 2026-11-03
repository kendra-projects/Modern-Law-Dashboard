import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { fetchAcuityAppointment } from "@/lib/acuity"
import { ACUITY_FORMS, ACUITY_MATTER_TYPES, ACUITY_REFERRAL_SOURCES } from "@/lib/acuity-map"
import { consultLocation } from "@/lib/attorney-zoom"
import type { Database, IntakeLead } from "@/types/database"

// Kendra's walkthrough step for a self-scheduled consult: once the conflict
// check is clear, staff fill in the staff intake form on the Acuity
// appointment ("MODERN LAW Intake Form"): booked by "Client", the Zoom link,
// referral source (Google when the client gave none), type of matter, opposing
// party, conflict check completed and qualified. This does the same through
// Acuity's API, filling only answers that are empty; "Conflict Check
// Completed?" is set to yes. Acuity copies the "Zoom Link, Office Address, or
// Phone Number" answer into the appointment's location, and a PUT of some
// answers leaves the others as they were (both seen on a test booking, 29 Oct
// 2026). The API can't resend the confirmation (gear → Resend), so that stays
// with staff. ACUITY_FORM_UPDATE=on turns it on (default off).

type Db = SupabaseClient<Database>

export const acuityFormOn = () => process.env.ACUITY_FORM_UPDATE === "on"

/** The staff form's fields (form 2151090), by Acuity field id. */
const FIELD = {
  intakeBy: 12016550, // Intake by which Team Member
  where: 12016702, // Zoom Link, Office Address, or Phone Number
  referral: 12016728, // Referral Source
  matterType: 12016776, // Type of matter?
  conflictDone: 12016778, // Conflict Check Completed? (yes/no)
  opposingParty: 16141672, // Opposing Party Name
  qualified: 12016798, // Is this a qualified lead? (yes/no)
} as const

const LABEL: Record<number, string> = {
  [FIELD.intakeBy]: "booked by",
  [FIELD.where]: "Zoom link / address",
  [FIELD.referral]: "referral source",
  [FIELD.matterType]: "type of matter",
  [FIELD.conflictDone]: "conflict check completed",
  [FIELD.opposingParty]: "opposing party",
  [FIELD.qualified]: "qualified",
}

type Lead = Pick<
  IntakeLead,
  "external_id" | "method" | "office" | "phone" | "consulting_attorney" | "referral_source" | "matter_type" | "opposing_party_name"
>

function acuityAuth() {
  const userId = process.env.ACUITY_USER_ID
  const apiKey = process.env.ACUITY_API_KEY
  return userId && apiKey ? `Basic ${Buffer.from(`${userId}:${apiKey}`).toString("base64")}` : null
}

/** Where the consult happens, for the staff form: the Zoom link, the office address or the phone number. */
async function whereValue(db: Db, lead: Lead, location: string | null): Promise<string | null> {
  if (lead.method === "in_person" && lead.office) {
    const { data } = await db.from("office_addresses").select("address").eq("office", lead.office).maybeSingle()
    return data?.address ?? null
  }
  if (lead.method === "phone") return lead.phone
  const { location: loc } = await consultLocation(db, lead, location)
  return loc?.match(/https?:\/\/\S*zoom\.us\/\S+/i)?.[0] ?? null
}

/**
 * Fill the empty answers of the staff intake form on a self-scheduled
 * booking's Acuity appointment. Returns what changed and what was left.
 */
export async function fillAcuityForm(db: Db, lead: Lead): Promise<{ changed: string[]; notes: string[] }> {
  const auth = acuityAuth()
  if (!auth) throw new Error("Acuity isn't connected (ACUITY_USER_ID / ACUITY_API_KEY).")
  if (!lead.external_id) throw new Error("The lead has no Acuity appointment id.")
  const appt = await fetchAcuityAppointment(lead.external_id)
  if (!appt) throw new Error("Couldn't read the Acuity appointment.")

  const staffForm = (appt.forms ?? []).find((f) => f.id === ACUITY_FORMS.internalIntake)
  if (!staffForm) throw new Error("The appointment has no MODERN LAW Intake Form.")
  const current = new Map(staffForm.values.map((v) => [v.fieldID, (v.value ?? "").trim()]))
  const empty = (id: number) => !current.get(id)

  const notes: string[] = []
  const want = new Map<number, string>()
  if (empty(FIELD.intakeBy)) want.set(FIELD.intakeBy, "Client")
  if (empty(FIELD.where)) {
    const where = await whereValue(db, lead, appt.location ?? null)
    if (where) want.set(FIELD.where, where)
    else notes.push("No Zoom link, address or phone to put in")
  }
  if (empty(FIELD.referral)) {
    // The client's own answer, else Google (the walkthrough's default); an answer
    // that isn't one of the form's options is left for staff.
    const given = lead.referral_source?.trim()
    if (!given) want.set(FIELD.referral, "Google")
    else if ((ACUITY_REFERRAL_SOURCES as readonly string[]).includes(given)) want.set(FIELD.referral, given)
    else notes.push(`Referral source "${given}" isn't an Acuity option, left for staff`)
  }
  if (empty(FIELD.matterType)) {
    const type = lead.matter_type?.trim()
    if (type && (ACUITY_MATTER_TYPES as readonly string[]).includes(type)) want.set(FIELD.matterType, type)
    else notes.push("Type of matter left for staff")
  }
  if (empty(FIELD.opposingParty) && lead.opposing_party_name?.trim()) want.set(FIELD.opposingParty, lead.opposing_party_name.trim())
  if (current.get(FIELD.conflictDone)?.toLowerCase() !== "yes") want.set(FIELD.conflictDone, "yes")
  if (empty(FIELD.qualified)) want.set(FIELD.qualified, "yes")
  notes.push("Resend in Acuity stays with staff")

  if (want.size) {
    const res = await fetch(`https://acuityscheduling.com/api/v1/appointments/${lead.external_id}?admin=true`, {
      method: "PUT",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: appt.firstName,
        lastName: appt.lastName,
        fields: Array.from(want, ([id, value]) => ({ id, value })),
      }),
      cache: "no-store",
    })
    if (!res.ok) {
      const body = (await res.text().catch(() => "")).slice(0, 200)
      throw new Error(`Acuity didn't take the form answers (${res.status}) ${body}`.trim())
    }
  }
  return { changed: Array.from(want.keys(), (id) => LABEL[id]), notes }
}
