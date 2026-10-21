import "server-only"

import { growNext } from "@/lib/grow-ready"
import type { createClient } from "@/lib/supabase/server"
import type { IntakeLead } from "@/types/database"

type Supabase = Awaited<ReturnType<typeof createClient>>

/**
 * Of the leads waiting on their Grow matter (lib/grow-ready.ts), the ids the
 * dashboard has already found a Grow matter for: its booking note is on it.
 */
export async function growMatterLeads(
  supabase: Supabase,
  leads: Pick<IntakeLead, "id" | "status" | "conflict_status" | "clio_matter_id">[]
): Promise<string[]> {
  const ids = leads.filter((l) => growNext(l, false)).map((l) => l.id)
  if (!ids.length) return []
  const { data } = await supabase
    .from("intake_steps")
    .select("lead_id")
    .eq("step_key", "grow_note")
    .eq("state", "done")
    .in("lead_id", ids)
  return Array.from(new Set((data ?? []).map((s) => s.lead_id)))
}
