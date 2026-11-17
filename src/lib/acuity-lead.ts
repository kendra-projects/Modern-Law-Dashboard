import type { createAdminClient } from "@/lib/supabase/admin"
import { enrichLeadFromAcuity, upsertAppointment, type AcuityAppointment } from "@/lib/acuity"
import { syncGrowForLead } from "@/lib/grow-sync"
import { runAutoIntake } from "@/lib/auto-intake"
import { wakeBotFor } from "@/lib/bot"
import { markLexiBooked } from "@/lib/lexi-followups"
import { runConflictSearch } from "@/lib/conflict-search"
import { sendSelfScheduleAlert } from "@/lib/self-schedule-alert"
import { holdFromAcuity } from "@/lib/safety-hold"
import { hideAcuityContact } from "@/lib/acuity-hold-contact"
import type { Json } from "@/types/database"

type Admin = NonNullable<ReturnType<typeof createAdminClient>>

/**
 * The booking note on the client's Clio Grow matter, right away when the
 * matter is already there. Capped at a few seconds so Acuity gets its answer
 * quickly; whatever doesn't finish, the regular sync picks up (it never posts
 * the same note twice).
 */
export async function growNoteSoon(leadId: string) {
  await Promise.race([syncGrowForLead(leadId).catch(() => []), new Promise((r) => setTimeout(r, 8000))])
}

/** The conflict search for a self-scheduled booking, before its #clientadvocates alert. Same cap. */
async function conflictSearchSoon(leadId: string) {
  await Promise.race([runConflictSearch(leadId).catch(() => null), new Promise((r) => setTimeout(r, 8000))])
}

/**
 * New consult → new lead, and the whole intake automation starts on it. Used by
 * the Acuity webhook and by "Start intake" on the Appointments page (for a
 * consult booked before its type counted as one). If the lookup failed (Acuity
 * down), the lead is still recorded so nothing is lost; enrich retries on the
 * next update.
 */
export async function startAcuityLead(
  admin: Admin,
  appointmentId: string,
  appt: AcuityAppointment | null,
  raw: Record<string, unknown>
): Promise<{ id: string | null; error?: string }> {
  const { data: created, error } = await admin
    .from("intake_leads")
    .insert({
      source: "acuity",
      external_id: appointmentId,
      status: "received",
      raw_payload: raw as unknown as Json,
    })
    .select("id")
    .maybeSingle()
  if (error) return { id: null, error: error.message }
  if (!created?.id) return { id: null }

  // First, before any automation: a safety concern answered when booking puts
  // the lead on hold (lib/safety-hold.ts).
  if (await holdFromAcuity(admin, created.id, appt).catch(() => false))
    await hideAcuityContact(admin, created.id, "Acuity booking form").catch(() => "failed")
  try {
    await enrichLeadFromAcuity(created.id, appointmentId, appt)
    if (appt) await upsertAppointment(appt, { leadId: created.id })
  } catch {
    /* best-effort */
  }
  // Booked through Lexi: LexiDesk stops its own follow-ups.
  await markLexiBooked(created.id).catch(() => 0)
  // The #clientadvocates heads-up for a consult the client booked themselves,
  // with what the conflict search found in Clio.
  await conflictSearchSoon(created.id)
  await sendSelfScheduleAlert(created.id).catch(() => {})
  await growNoteSoon(created.id)
  // Staff-booked consults arrive with the conflict check done and the
  // advocate named, so the rest of the intake can happen right away.
  await runAutoIntake(created.id).catch(() => null)
  // The bot pauses Lexi right away, and sends the text once the lead is ready.
  await wakeBotFor(created.id).catch(() => false)
  return { id: created.id }
}
