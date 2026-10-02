import { createClient } from "@/lib/supabase/server"
import {
  IntakeActivityClient,
  type ActivityLead,
  type ActivityStep,
} from "@/components/intake/intake-activity-client"

export const dynamic = "force-dynamic"

export default async function IntakeActivityPage() {
  const supabase = await createClient()

  const { data: steps } = await supabase
    .from("intake_steps")
    .select("id, lead_id, step_key, state, detail, error, created_at")
    .order("created_at", { ascending: false })
    .limit(400)

  const leadIds = Array.from(new Set((steps ?? []).map((s) => s.lead_id)))
  const { data: leads } = leadIds.length
    ? await supabase.from("intake_leads").select("id, client_first, client_last, matter_type").in("id", leadIds)
    : { data: [] }

  const leadRows: ActivityLead[] = (leads ?? []).map((l) => ({
    id: l.id,
    name: [l.client_first, l.client_last].filter(Boolean).join(" ") || "Unknown lead",
    matter_type: l.matter_type,
  }))

  return <IntakeActivityClient steps={(steps ?? []) as ActivityStep[]} leads={leadRows} />
}
