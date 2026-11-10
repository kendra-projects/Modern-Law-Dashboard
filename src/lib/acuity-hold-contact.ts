import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { fetchAcuityAppointment } from "@/lib/acuity"
import { logStep } from "@/lib/intake-step-log"
import { holdEmail } from "@/lib/safety-hold"

// Acuity's own reminder emails and texts for a client on safety hold.
//
// Acuity can't switch reminders off for one appointment (its reminder settings
// are account-wide), so while a lead is on hold its Acuity appointment carries
// the firm's address (holdEmail(), sales@ by default) and no phone: reminder
// emails reach the firm, and no reminder texts go out. The change is made with
// noEmail=true, so Acuity doesn't tell the client about it. The client's real
// email and phone are kept on this step's row and on the lead (Acuity's copy
// never overwrites them while the firm's address is on the appointment; see
// mapAppointmentToLead), and are put back when the hold is released.
//
// Anything Acuity already sent (the booking confirmation goes out the moment
// the booking is made) can't be taken back.

export const ACUITY_CONTACT_HIDDEN = "acuity_contact_hidden"

type Db = SupabaseClient<Database>
type Saved = { email: string | null; phone: string | null }
export type HideResult = "hidden" | "already" | "none" | "failed"
export type RestoreResult = "restored" | "changed_by_hand" | "none" | "failed"

function auth() {
  const userId = process.env.ACUITY_USER_ID
  const apiKey = process.env.ACUITY_API_KEY
  if (!userId || !apiKey) return null
  return `Basic ${Buffer.from(`${userId}:${apiKey}`).toString("base64")}`
}

async function putContact(appointmentId: string, body: { firstName?: string; lastName?: string; email: string; phone: string }) {
  const a = auth()
  if (!a) throw new Error("Acuity isn't connected (ACUITY_USER_ID / ACUITY_API_KEY).")
  const res = await fetch(`https://acuityscheduling.com/api/v1/appointments/${appointmentId}?admin=true&noEmail=true`, {
    method: "PUT",
    headers: { Authorization: a, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  if (!res.ok) {
    const text = (await res.text().catch(() => "")).slice(0, 200)
    throw new Error(`Acuity didn't take the change (${res.status}) ${text}`.trim())
  }
}

async function leadOf(db: Db, leadId: string) {
  const { data } = await db.from("intake_leads").select("source, external_id, email, phone").eq("id", leadId).maybeSingle()
  return data
}

/** Swap the held client's email and phone on their Acuity appointment for the firm's. */
export async function hideAcuityContact(db: Db, leadId: string, by: string): Promise<HideResult> {
  const lead = await leadOf(db, leadId)
  if (!lead || lead.source !== "acuity" || !lead.external_id) return "none"
  let saved: Saved | null = null
  try {
    const appt = await fetchAcuityAppointment(lead.external_id)
    if (!appt) throw new Error("Couldn't read the Acuity appointment.")
    if ((appt.email ?? "").trim().toLowerCase() === holdEmail()) return "already"
    saved = { email: appt.email?.trim() || lead.email, phone: appt.phone?.trim() || lead.phone }
    await putContact(lead.external_id, { firstName: appt.firstName, lastName: appt.lastName, email: holdEmail(), phone: "" })
    await logStep(db, {
      lead_id: leadId,
      step_key: ACUITY_CONTACT_HIDDEN,
      state: "done",
      detail: { ...saved, sent_to: holdEmail(), by, at: new Date().toISOString() },
    })
    return "hidden"
  } catch (e) {
    await logStep(db, {
      lead_id: leadId,
      step_key: ACUITY_CONTACT_HIDDEN,
      state: "failed",
      detail: { ...(saved ?? {}), by, note: "Turn off this client's Acuity reminders by hand." },
      error: e instanceof Error ? e.message : String(e),
    })
    return "failed"
  }
}

/** Put the client's own email and phone back on their Acuity appointment. */
export async function restoreAcuityContact(db: Db, leadId: string, by: string): Promise<RestoreResult> {
  const lead = await leadOf(db, leadId)
  if (!lead?.external_id) return "none"
  const { data: row } = await db
    .from("intake_steps")
    .select("state, detail")
    .eq("lead_id", leadId)
    .eq("step_key", ACUITY_CONTACT_HIDDEN)
    .maybeSingle()
  if (!row || row.state !== "done") return "none"
  const saved = (row.detail ?? {}) as Saved & Record<string, unknown>
  try {
    const appt = await fetchAcuityAppointment(lead.external_id)
    if (!appt) throw new Error("Couldn't read the Acuity appointment.")
    // Someone already changed it in Acuity: leave their change alone.
    if ((appt.email ?? "").trim().toLowerCase() !== holdEmail()) {
      await logStep(db, { lead_id: leadId, step_key: ACUITY_CONTACT_HIDDEN, state: "skipped", detail: { ...saved, restored: "by hand", by } })
      return "changed_by_hand"
    }
    await putContact(lead.external_id, {
      firstName: appt.firstName,
      lastName: appt.lastName,
      email: saved.email ?? lead.email ?? "",
      phone: saved.phone ?? lead.phone ?? "",
    })
    await logStep(db, {
      lead_id: leadId,
      step_key: ACUITY_CONTACT_HIDDEN,
      state: "skipped",
      detail: { ...saved, restored_at: new Date().toISOString(), by },
    })
    return "restored"
  } catch (e) {
    // Kept as "done" with the saved details, so the release can be tried again.
    await logStep(db, {
      lead_id: leadId,
      step_key: ACUITY_CONTACT_HIDDEN,
      state: "done",
      detail: { ...saved, restore_failed: e instanceof Error ? e.message : String(e) },
    })
    return "failed"
  }
}
