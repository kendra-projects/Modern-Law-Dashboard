"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "./logs"

export type ClioMatter = {
  id: string
  display_number: string
  description: string
  status: string
  client: string
}

/**
 * Search Clio's live matter book.
 *
 * The dashboard holds no Clio credentials, and giving it a second copy of an
 * integration Make already runs in production would mean two things to keep in
 * sync. So the lookup goes through the "Clio Matter Lookup" scenario, which
 * answers on its own webhook. Nothing is cached, so nothing can be stale.
 */
export async function searchClioMatters(query: string): Promise<ClioMatter[]> {
  // An empty query is legitimate: opening the picker sends one so the attorney
  // sees the most recent open matters rather than an empty box. Clio treats a
  // blank `query` as "no filter", and the scenario caps the result at 25.
  const q = query.trim()
  const url = process.env.CLIO_LOOKUP_WEBHOOK_URL
  if (!url) return []

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q }),
      // Clio is a third party behind a webhook; a picker that hangs is worse
      // than one that briefly shows nothing.
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    })
    if (!res.ok) return []
    const body = (await res.json()) as { matters?: ClioMatter[] }
    return Array.isArray(body?.matters) ? body.matters : []
  } catch {
    return []
  }
}

/**
 * Assign a Clio matter and hand the filing to Make.
 *
 * This deliberately does NOT set filed_to_clio. The note is created by the
 * "File Consultation to Clio" scenario, and only that scenario — via the
 * file_zoom_summary function — may record that it happened. Claiming it here
 * would move the consultation out of the review queue on the strength of a
 * request that had not been carried out yet, and nobody would look at it again.
 *
 * That same scenario also marks the Slack parking-lot record approved and
 * retires the Slack buttons, so a consultation filed from here cannot then be
 * filed a second time by an attorney clicking Approve in Slack.
 */
export async function fileConsultationToClio(
  summaryId: string,
  clioMatterId: string,
  wasOverride: boolean
): Promise<ActionResult> {
  const matter = clioMatterId.trim()
  if (!matter) return { ok: false, message: "A Clio Matter ID is required." }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: "Not authenticated." }

  const { error } = await supabase
    .from("summaries_matters")
    .update({
      clio_matter_id: matter,
      attorney_status: wasOverride ? "overridden" : "approved",
      updated_at: new Date().toISOString(),
      overridden_by: user.id,
    })
    .eq("id", summaryId)

  if (error) return { ok: false, message: "Could not save the matter." }

  const url = process.env.CLIO_FILE_WEBHOOK_URL
  if (!url) {
    return {
      ok: false,
      message:
        "Matter saved, but filing is not configured — set CLIO_FILE_WEBHOOK_URL.",
    }
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary_id: summaryId,
        matter_id: matter,
        overridden: wasOverride,
        filed_by: user.email ?? user.id,
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(String(res.status))
  } catch {
    await supabase.from("system_logs").insert({
      scenario_name: "clio_filing",
      event_type: "error",
      message: `Could not reach the Clio filing scenario for matter ${matter}.`,
      details: { summary_id: summaryId, clio_matter_id: matter },
      status: "logged",
    })
    return {
      ok: false,
      message: "Matter saved, but the filing could not be dispatched. Try again.",
    }
  }

  revalidatePath("/meetings")
  revalidatePath("/")
  revalidatePath("/archive")
  return {
    ok: true,
    message: `Sent to Clio · ${matter}. The row clears once Clio confirms.`,
  }
}
