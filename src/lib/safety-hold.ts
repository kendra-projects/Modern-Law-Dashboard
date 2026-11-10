import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, IntakeStep } from "@/types/database"
import { logStep } from "@/lib/intake-step-log"

// A safety hold: staff turn it on from the lead page when the client must not be
// contacted (a safety concern, say). While it's on, nothing automated runs for the
// lead: no Clio contact or matter, portal invite, confirmation text, calendar
// invite, Acuity form update, Slack post or Grow card from the dashboard or the
// bot, and the portal button on the lead page refuses. The one job that still
// runs is pausing the client's Lexi follow-ups, because that stops contact.
//
// Stored as an intake_steps row (step_key "safety_hold", so no new column):
// state "done" while the hold is on, "skipped" once someone releases it. Only a
// person releases it; nothing automated ever turns it off.

export const SAFETY_HOLD = "safety_hold"

export type SafetyHold = { by: string; reason: string | null; at: string }

type Db = SupabaseClient<Database>

/** The lead's hold, when it's on, from its steps. */
export function safetyHold(steps: Pick<IntakeStep, "step_key" | "state" | "detail">[]): SafetyHold | null {
  const s = steps.find((x) => x.step_key === SAFETY_HOLD && x.state === "done")
  if (!s) return null
  const d = (s.detail ?? {}) as Partial<SafetyHold>
  return { by: d.by ?? "Staff", reason: d.reason ?? null, at: d.at ?? "" }
}

/**
 * Whether the lead is on hold, read fresh. A read that fails counts as on hold,
 * so an error never lets a message through.
 */
export async function onSafetyHold(db: Db, leadId: string): Promise<boolean> {
  const { data, error } = await db
    .from("intake_steps")
    .select("step_key, state, detail")
    .eq("lead_id", leadId)
    .eq("step_key", SAFETY_HOLD)
  if (error) return true
  return Boolean(safetyHold(data ?? []))
}

/** The leads on hold among these, for lists. */
export async function leadsOnHold(db: Db, leadIds: string[]): Promise<Set<string>> {
  if (!leadIds.length) return new Set()
  const { data } = await db
    .from("intake_steps")
    .select("lead_id")
    .eq("step_key", SAFETY_HOLD)
    .eq("state", "done")
    .in("lead_id", leadIds)
  return new Set((data ?? []).map((r) => r.lead_id as string))
}

// ── From the booking ─────────────────────────────────────────────────────────
// Staff who know about a concern when they book answer the safety question on
// Acuity's internal staff form, and the hold is on before any automation runs
// (the intake webhook calls holdFromAcuity first). The question is found by its
// wording (anything with "safety" in it), so its id doesn't matter. Acuity can
// only turn a hold ON: it never releases one, and once a person has released a
// lead's hold, the form's answer doesn't put it back.

type AcuityForms = { forms?: { values?: { name?: string; value?: string | null }[] }[] } | null | undefined

/** Acuity's safety question on this booking is answered yes. */
export function acuitySafetyYes(appt: AcuityForms): boolean {
  for (const form of appt?.forms ?? []) {
    for (const v of form.values ?? []) {
      if (/safety/i.test(v.name ?? "") && /^\s*(yes|y|true|checked)\b/i.test(String(v.value ?? ""))) return true
    }
  }
  return false
}

/** Put the lead on hold when the booking's safety answer is yes and nobody has decided yet. Returns true when it did. */
export async function holdFromAcuity(db: Db, leadId: string, appt: AcuityForms): Promise<boolean> {
  if (!acuitySafetyYes(appt)) return false
  const { data } = await db.from("intake_steps").select("id").eq("lead_id", leadId).eq("step_key", SAFETY_HOLD).limit(1)
  // On already, or released by a person: leave it.
  if (data?.length) return false
  const { error } = await logStep(db, {
    lead_id: leadId,
    step_key: SAFETY_HOLD,
    state: "done",
    detail: { by: "Acuity booking form", reason: "Safety concern answered Yes when booking", at: new Date().toISOString() },
  })
  return !error
}

/**
 * Where a held client's Acuity reminders go instead (lib/acuity-hold-contact.ts).
 * Acuity has no per-appointment reminder switch, so the appointment's email is
 * swapped for this one and its phone cleared while the hold is on.
 */
export const holdEmail = () => (process.env.SAFETY_HOLD_EMAIL?.trim() || "sales@mymodernlaw.com").toLowerCase()

export const SAFETY_HOLD_MESSAGE = "Safety hold is on: this client must not be contacted."

/**
 * Nothing automated contacts a client (calendar invite, portal invite, text) in
 * the first 10 minutes after the booking arrives, so staff have time to put a
 * safety hold on first. Staff's own buttons on the lead page don't wait.
 */
export const CONTACT_WAIT_MS = 10 * 60 * 1000

/** The booking arrived more than CONTACT_WAIT_MS ago. A missing or bad time waits. */
export function contactWaitOver(bookedAt: string | null | undefined, now = Date.now()) {
  const t = bookedAt ? Date.parse(bookedAt) : NaN
  return Number.isFinite(t) && now - t >= CONTACT_WAIT_MS
}
