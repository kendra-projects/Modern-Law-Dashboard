import "server-only"

import { createClient } from "@/lib/supabase/server"

/**
 * "Something new arrived here" markers for the sidebar.
 *
 * The dashboard refreshes itself every 25 seconds, so a failure can appear on
 * Activity & Logs, or a consultation on Meeting Resolution, while the client is
 * sitting on a different page — and until now there was nothing to tell them.
 * You had to go and look.
 *
 * Rather than store a per-user read receipt in the database (which would mean a
 * write on every page view, for a signal nobody needs to keep), this ships the
 * TIMESTAMPS of what exists and lets the browser decide what counts as new by
 * comparing them against what that browser has already seen. That keeps it
 * per-person and per-device, which is what "I've read this" actually means.
 *
 * Only the newest WINDOW rows per section are carried: the badge reads "40+"
 * past that, and nobody triages a backlog of forty from a sidebar dot.
 */

const WINDOW = 40

/** Epoch milliseconds, newest first. */
export type NavSignals = Record<string, number[]>

const toMs = (rows: Array<{ created_at: string | null }> | null): number[] =>
  (rows ?? [])
    .map((r) => (r.created_at ? new Date(r.created_at).getTime() : NaN))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a)
    .slice(0, WINDOW)

const merge = (...lists: number[][]): number[] =>
  lists
    .flat()
    .sort((a, b) => b - a)
    .slice(0, WINDOW)

export async function getNavSignals(): Promise<NavSignals> {
  const supabase = await createClient()

  const [intakesRes, episodesRes, gbpRes, summariesRes, retryRes, logsRes, leadsRes, apptsRes, stepsRes] =
    await Promise.all([
      supabase
        .from("intake_transcripts")
        .select("source_type, created_at")
        .order("created_at", { ascending: false })
        .limit(WINDOW * 2),
      supabase
        .from("episodes_content")
        .select("created_at, wordpress_status, wordpress_post_id")
        .order("created_at", { ascending: false })
        .limit(WINDOW),
      supabase
        .from("gbp_posts")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(WINDOW),
      // Only the ones that actually want a person. A consultation that filed
      // itself cleanly is not news.
      supabase
        .from("summaries_matters")
        .select("created_at, filed_to_clio")
        .eq("filed_to_clio", false)
        .order("created_at", { ascending: false })
        .limit(WINDOW),
      supabase
        .from("retry_queue")
        .select("created_at, status")
        .order("created_at", { ascending: false })
        .limit(WINDOW),
      // Errors and warnings only — an info line is not something to chase.
      supabase
        .from("system_logs")
        .select("created_at, event_type")
        .in("event_type", ["error", "warning"])
        .order("created_at", { ascending: false })
        .limit(WINDOW),
      // Consultation intake. A login that can't read these tables (content)
      // simply gets empty lists, so its sidebar is unaffected.
      supabase
        .from("intake_leads")
        .select("created_at")
        .neq("status", "canceled")
        .order("created_at", { ascending: false })
        .limit(WINDOW),
      supabase
        .from("appointments")
        .select("created_at")
        .eq("is_consult", true)
        .eq("canceled", false)
        .order("created_at", { ascending: false })
        .limit(WINDOW),
      // Steps that need a person: failed, or waiting on someone.
      supabase
        .from("intake_steps")
        .select("created_at, state")
        .in("state", ["failed", "awaiting_human"])
        .order("created_at", { ascending: false })
        .limit(WINDOW),
    ])

  type Row = {
    created_at: string | null
    source_type?: string | null
    wordpress_status?: string | null
    wordpress_post_id?: string | null
    filed_to_clio?: boolean | null
    status?: string | null
    state?: string | null
  }
  const intakes = (intakesRes.data ?? []) as Row[]
  const episodes = (episodesRes.data ?? []) as Row[]
  // gbp_posts is created by a later migration; a missing table must not take
  // the whole sidebar down with it.
  const gbp = gbpRes.error ? [] : toMs(gbpRes.data as Row[] | null)
  const summaries = (summariesRes.data ?? []) as Row[]
  const retries = (retryRes.data ?? []) as Row[]
  const problems = toMs(logsRes.data as Row[] | null)

  // 1. Intake & Upload: naya manual upload (amber)
  const uploads = toMs(intakes.filter((i) => i.source_type === "manual_upload"))

  // 2. Blogs: a blog only counts once its WordPress DRAFT actually exists (post
  // id set). wordpress_status defaults to "draft" the moment the episode row is
  // created — long before any blog is written — so keying on that lit the badge
  // before there was anything to review. The Blogs page itself lists only
  // post-id rows, so this keeps the badge and the page in agreement.
  const drafts = toMs(episodes.filter((e) => !!e.wordpress_post_id))

  // 3. GBP Local Posts: naye location posts (amber) -> gbp

  // 4. Meeting Resolution: consultation jo abhi Clio mein file nahi hui (amber)
  const consults = toMs(summaries.filter((s) => s.filed_to_clio === false))

  // 5. Recovery Queue: naya failed job (laal)
  const failedJobs = toMs(retries.filter((r) => r.status !== "resolved"))

  // 6. Historical Archive: one badge per real archive row. The Archive page
  // lists episodes (produced content) and consultations — NOT the raw intake
  // rows. A single upload creates both an intake AND an episode, so counting
  // intakes here double-counted every upload (showed 2 for one file). Count the
  // episode and the consultation only, so the badge matches the list.
  const allArchive = merge(toMs(episodes), toMs(summaries))

  // 7. Activity & Logs: sirf error / warning (info nahi) (laal) -> problems

  // Intake: new leads, new consult bookings, and steps that failed or wait on
  // a person (red on Recovery, and on Activity where only failures count, the
  // same way the content Activity & Logs badge counts only errors).
  const leads = toMs(leadsRes.data as Row[] | null)
  const bookings = toMs(apptsRes.data as Row[] | null)
  const stuck = toMs(stepsRes.data as Row[] | null)
  const failures = toMs(((stepsRes.data ?? []) as Row[]).filter((r) => r.state === "failed"))

  return {
    "/upload": uploads,
    "/blogs": drafts,
    "/gbp": gbp,
    "/meetings": consults,
    "/recovery": failedJobs,
    "/archive": allArchive,
    "/logs": problems,
    "/intake": leads,
    "/intake/appointments": bookings,
    "/intake/recovery": stuck,
    "/intake/activity": failures,
  }
}
