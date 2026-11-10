import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, IntakeStep } from "@/types/database"

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

export const SAFETY_HOLD_MESSAGE = "Safety hold is on: this client must not be contacted."
