import { createClient } from "@/lib/supabase/server"
import { INTAKE_SCENARIOS } from "@/lib/log-workspace"
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

  // Failed runs of the Make scenarios that work for intake (the email sender),
  // pulled into system_logs by the Make health poller. They belong to no lead.
  const { data: makeLogs } = await supabase
    .from("system_logs")
    .select("id, scenario_name, event_type, message, created_at")
    .in("scenario_name", INTAKE_SCENARIOS)
    .in("event_type", ["error", "warning"])
    .order("created_at", { ascending: false })
    .limit(100)
  const makeRows: ActivityStep[] = (makeLogs ?? []).map((l) => ({
    id: `make-${l.id}`,
    lead_id: "",
    step_key: "make_error",
    state: l.event_type === "error" ? "failed" : "awaiting_human",
    detail: { scenario: l.scenario_name },
    error: l.message,
    created_at: l.created_at,
  }))
  const allSteps = [...((steps ?? []) as ActivityStep[]), ...makeRows].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))

  const leadIds = Array.from(new Set((steps ?? []).map((s) => s.lead_id)))
  const { data: leads } = leadIds.length
    ? await supabase.from("intake_leads").select("id, client_first, client_last, matter_type").in("id", leadIds)
    : { data: [] }

  const leadRows: ActivityLead[] = (leads ?? []).map((l) => ({
    id: l.id,
    name: [l.client_first, l.client_last].filter(Boolean).join(" ") || "Unknown lead",
    matter_type: l.matter_type,
  }))

  return <IntakeActivityClient steps={allSteps} leads={leadRows} />
}
