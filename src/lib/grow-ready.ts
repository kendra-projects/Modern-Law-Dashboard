import type { IntakeLead } from "@/types/database"

// Every consult's matter is made in Clio Grow and pushed to Manage with
// "Convert to Clio Manage", so Grow and Manage stay linked (Kendra, 20 Oct
// 2026). Once the conflict check is clear, an open lead with no Manage matter
// waits on the advocate: "grow" while Grow has no matter for it (make one
// there), "convert" once the dashboard has found the Grow matter (convert it).
// The dashboard picks the Manage matter up on its own after the convert. A
// consult more than a day past is left out: an old lead without a matter is a
// no-show or was handled outside the dashboard, not work for today.

export type GrowNext = "grow" | "convert"

const CLOSED: IntakeLead["status"][] = ["canceled", "stopped", "failed", "done"]
const DAY = 24 * 60 * 60 * 1000

export function growNext(
  lead: Pick<IntakeLead, "status" | "conflict_status" | "clio_matter_id" | "consult_datetime">,
  hasGrowMatter: boolean
): GrowNext | null {
  if (CLOSED.includes(lead.status) || lead.conflict_status !== "clear" || lead.clio_matter_id) return null
  if (lead.consult_datetime && new Date(lead.consult_datetime).getTime() < Date.now() - DAY) return null
  return hasGrowMatter ? "convert" : "grow"
}

export const GROW_NEXT_LABEL: Record<GrowNext, string> = {
  grow: "Make Grow matter",
  convert: "Convert in Grow",
}
