import { createClient } from "@/lib/supabase/server"
import { IntakeClient } from "@/components/intake/intake-client"
import type { IntakeLead } from "@/types/database"

export const dynamic = "force-dynamic"

export default async function IntakePage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("intake_leads")
    .select("id, status, source, client_first, client_last, email, phone, matter_type, method, office, consult_datetime, consult_type, consulting_attorney, priority_score, conflict_status, assigned_advocate, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(200)

  return <IntakeClient leads={(data ?? []) as unknown as IntakeLead[]} />
}
