import { NextResponse, type NextRequest } from "next/server"
import { getRole, canSeeIntake } from "@/lib/role"
import { createAdminClient } from "@/lib/supabase/admin"
import { syncLeadFromClio, syncOpenLeadsFromClio } from "@/lib/clio-sync"
import { syncOpenLeadsFromSlack, syncSlackPosts } from "@/lib/slack-sync"
import { syncGrowForLead, syncOpenLeadsFromGrow } from "@/lib/grow-sync"
import { runAutoIntake, runAutoIntakeForOpenLeads } from "@/lib/auto-intake"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Brings work staff did straight in Clio (contact, matter, portal, tasks) and
 * in Slack (the #initialconsultations post) back into the dashboard. Reads
 * both only. It also adds the booking note to the client's Clio Grow matter
 * once that matter exists (a note, never an edit), and, when AUTO_INTAKE is
 * on, retries the automatic intake steps (lib/auto-intake.ts).
 * `?lead=<id>` syncs one lead (the lead page
 * calls this when it opens); without it, the open leads are synced in a batch.
 *
 * /api/intake is a public route (the Acuity webhook lives there), so this
 * checks its own callers: a scheduler with CRON_SECRET, or a signed-in
 * intake/admin user.
 */
async function allowed(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get("authorization") ?? ""
  if (secret && auth === `Bearer ${secret}`) return true
  // No session reads as the "content" role, which can't see intake.
  return canSeeIntake(await getRole())
}

async function run(request: NextRequest) {
  if (!(await allowed(request))) return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 })

  const leadId = request.nextUrl.searchParams.get("lead")
  try {
    if (!leadId) {
      // One system's hiccup shouldn't hide what the others found.
      const [clio, slack, grow] = await Promise.all([
        syncOpenLeadsFromClio().catch(() => ({ checked: 0, changed: 0 })),
        syncOpenLeadsFromSlack().catch(() => ({ checked: 0, changed: 0 })),
        syncOpenLeadsFromGrow().catch(() => ({ checked: 0, changed: 0 })),
      ])
      // Then the automatic intake steps that couldn't run before (Clio down,
      // a Slack hiccup). After the sync, so they see what staff already did.
      const auto = await runAutoIntakeForOpenLeads().catch(() => ({ checked: 0, ran: 0 }))
      return NextResponse.json({
        ok: true,
        checked: clio.checked,
        changed: clio.changed + slack.changed + grow.changed + auto.ran,
        slack,
        grow,
        auto,
      })
    }

    const admin = createAdminClient()
    const { data: lead } = admin
      ? await admin
          .from("intake_leads")
          .select("id, client_first, client_last, email, phone, status, created_at, clio_client_contact_id, clio_matter_id, clio_portal_id")
          .eq("id", leadId)
          .maybeSingle()
      : { data: null }
    if (!lead || ["stopped", "failed"].includes(lead.status)) return NextResponse.json({ ok: true, changes: [] })
    // A canceled lead only needs its Grow cancellation note.
    if (lead.status === "canceled") {
      const grow = await syncGrowForLead(lead.id).catch(() => [])
      return NextResponse.json({ ok: true, changes: grow.length ? ["grow"] : [] })
    }
    const [clio, slack, grow] = await Promise.all([
      syncLeadFromClio(lead).catch(() => []),
      syncSlackPosts([lead]).catch(() => []),
      syncGrowForLead(lead.id).catch(() => []),
    ])
    const auto = await runAutoIntake(lead.id).catch(() => null)
    const autoChanged = Boolean(auto && auto.mode === "on" && (auto.done.length || auto.failed.length))
    return NextResponse.json({
      ok: true,
      changes: [...clio, ...(slack.length ? ["slack"] : []), ...(grow.length ? ["grow"] : []), ...(autoChanged ? ["auto"] : [])],
    })
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "Sync failed" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return run(request)
}

export async function POST(request: NextRequest) {
  return run(request)
}
