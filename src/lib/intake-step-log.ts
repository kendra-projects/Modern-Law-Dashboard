import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, IntakeStep, Json } from "@/types/database"

// intake_steps keeps one row per lead and step (a unique index on lead_id,
// step_key), so a plain insert of a step that is already there fails without
// a word. Writing a step through here replaces that row instead: a step that
// failed and then worked shows as done, a changed advocate shows the new name,
// and the row's time is the latest attempt.

type Db = SupabaseClient<Database>

export function logStep(
  db: Db,
  row: { lead_id: string; step_key: string; state: IntakeStep["state"]; detail?: Record<string, unknown>; error?: string | null }
) {
  const now = new Date().toISOString()
  return db.from("intake_steps").upsert(
    {
      lead_id: row.lead_id,
      step_key: row.step_key,
      state: row.state,
      detail: (row.detail ?? null) as Json,
      error: row.error ?? null,
      created_at: now,
      updated_at: now,
    },
    { onConflict: "lead_id,step_key" }
  )
}

/** Remove a step's failure row once the step has worked, so Recovery stops listing it. */
export function clearFailure(db: Db, leadId: string, stepKey: string) {
  return db.from("intake_steps").delete().eq("lead_id", leadId).eq("step_key", stepKey).eq("state", "failed")
}
