import { createClient } from "@/lib/supabase/server"
import {
  IntakeRecoveryClient,
  type RecoveryRow,
} from "@/components/intake/intake-recovery-client"

export const dynamic = "force-dynamic"

function nameOf(l: { client_first: string | null; client_last: string | null } | undefined) {
  if (!l) return "Unknown lead"
  return [l.client_first, l.client_last].filter(Boolean).join(" ") || "Unknown lead"
}

export default async function IntakeRecoveryPage() {
  const supabase = await createClient()

  const { data: steps } = await supabase
    .from("intake_steps")
    .select("id, lead_id, step_key, state, error, updated_at")
    .in("state", ["failed", "awaiting_human"])
    .order("updated_at", { ascending: false })
    .limit(200)

  const leadIds = Array.from(new Set((steps ?? []).map((s) => s.lead_id)))
  const { data: leads } = leadIds.length
    ? await supabase
        .from("intake_leads")
        .select("id, client_first, client_last")
        .in("id", leadIds)
    : { data: [] }

  const leadMap = new Map((leads ?? []).map((l) => [l.id, l]))

  const rows: RecoveryRow[] = (steps ?? []).map((s) => ({
    id: s.id,
    lead_id: s.lead_id,
    step_key: s.step_key,
    state: s.state as RecoveryRow["state"],
    error: s.error,
    updated_at: s.updated_at,
    leadName: nameOf(leadMap.get(s.lead_id)),
  }))

  return <IntakeRecoveryClient rows={rows} />
}
