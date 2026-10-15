import "server-only"

import { autoSignoff } from "@/lib/auto-intake"
import { logStep } from "@/lib/intake-step-log"
import { createAdminClient } from "@/lib/supabase/admin"
import type { IntakeLead } from "@/types/database"

// A consult booked through Lexi's own link carries LexiDesk's hidden Acuity
// form (client, conversation and offer ids). LexiDesk reads it back, marks the
// conversation converted and stops the follow-up texts and emails itself
// (confirmed with LexiDesk support and on the conversations, Oct 2026: they
// end "Completed" part-way through). So the Lexi step is done for those
// bookings without anyone pausing anything. Bookings made any other way carry
// no ids, and their follow-ups keep going until paused (lib/bot.ts).

const CLOSED: IntakeLead["status"][] = ["canceled", "stopped", "failed", "done"]

export const lexiConversationUrl = (lead: Pick<IntakeLead, "raw_payload">) =>
  (lead.raw_payload as { extras?: { lexidesk_conversation_url?: string } } | null)?.extras?.lexidesk_conversation_url ?? null

/** Record the Lexi step for open leads Lexi booked (one lead, or all open ones). Returns how many. */
export async function markLexiBooked(leadId?: string): Promise<number> {
  const admin = createAdminClient()
  if (!admin) return 0
  let q = admin
    .from("intake_leads")
    .select("id, raw_payload")
    .not("status", "in", `(${CLOSED.join(",")})`)
    .not("raw_payload->extras->>lexidesk_conversation_url", "is", null)
  if (leadId) q = q.eq("id", leadId)
  const { data: leads } = await q.limit(200)
  if (!leads?.length) return 0
  const { data: done } = await admin
    .from("intake_steps")
    .select("lead_id")
    .eq("step_key", "lexi_followups")
    .eq("state", "done")
    .in("lead_id", leads.map((l) => l.id))
  const have = new Set((done ?? []).map((d) => d.lead_id))
  let n = 0
  for (const lead of leads) {
    if (have.has(lead.id)) continue
    await logStep(admin, {
      lead_id: lead.id,
      step_key: "lexi_followups",
      state: "done",
      detail: { by: "LexiDesk", result: "auto", conversation_url: lexiConversationUrl(lead) },
    })
    await autoSignoff(lead.id).catch(() => false)
    n++
  }
  return n
}
