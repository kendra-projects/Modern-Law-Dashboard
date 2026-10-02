import "server-only"

import { createClient } from "@/lib/supabase/server"
import type {
  IntakeTranscript,
  EpisodeContent,
  SummaryMatter,
  SystemLog,
  SummaryWithIntake,
  EpisodeWithIntake,
  RetryQueueJob,
} from "@/types/database"

// Column sets deliberately EXCLUDE the heavy text fields (blog_html,
// raw/clean transcript, summary_text, log details) — the overview + upload
// pages never render them, and pulling them on every request is what made the
// dashboard slow under load. Detail-heavy fields are fetched only in getArchive.
const INTAKE_COLS =
  "id, meeting_uuid, source_type, file_name, status, created_at"
const EPISODE_COLS =
  "id, intake_id, title, show_name, confidence_score, created_at, wordpress_status, instagram_status, facebook_status, youtube_status, wordpress_post_id, wordpress_url, instagram_url, facebook_url, youtube_url"
const SUMMARY_COLS =
  "id, intake_id, client_name, clio_matter_id, attorney_status, filed_to_clio, created_at"
const LOG_COLS = "id, scenario_name, event_type, status, retry_count, created_at"

// A retry_queue row is "exhausted" (permanent failure) when it is explicitly
// needs_attention, OR every attempt is used up while still not resolved (the
// recovery drainer may not have flipped the status yet). Episodes matching these
// entity_ids read as Failed in the UI.
type RetryFlag = {
  entity_id: string | null
  platform?: string | null
  status: string
  attempts: number
  max_attempts: number
}
function isExhausted(r: RetryFlag): boolean {
  return (
    r.status === "needs_attention" ||
    (r.status !== "resolved" && (r.attempts ?? 0) >= (r.max_attempts ?? 5))
  )
}
function exhaustedSet(rows: RetryFlag[] | null): Set<string> {
  return new Set(
    (rows ?? [])
      .filter(isExhausted)
      .map((r) => r.entity_id)
      .filter(Boolean) as string[]
  )
}
// entity_id → set of platforms whose recovery retries are exhausted. Lets the
// Publishing tab mark the exact failed platform (e.g. Facebook) as Failed instead
// of showing its stale "pending" column value.
function failedPlatformsMap(rows: RetryFlag[] | null): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>()
  for (const r of rows ?? []) {
    if (!isExhausted(r) || !r.entity_id || !r.platform) continue
    if (!m.has(r.entity_id)) m.set(r.entity_id, new Set())
    m.get(r.entity_id)!.add(r.platform.toLowerCase())
  }
  return m
}
const RETRY_FLAG_COLS = "entity_id, platform, status, attempts, max_attempts"

export async function getOverviewData() {
  const supabase = await createClient()

  const [intakesRes, episodesRes, summariesRes, logsRes, naRes] =
    await Promise.all([
      supabase
        .from("intake_transcripts")
        .select(INTAKE_COLS)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("episodes_content").select(EPISODE_COLS).limit(500),
      supabase.from("summaries_matters").select(SUMMARY_COLS).limit(500),
      supabase
        .from("system_logs")
        .select(LOG_COLS)
        .order("created_at", { ascending: false })
        .limit(500),
      // episodes whose recovery retries are exhausted → shown as Failed
      supabase.from("retry_queue").select(RETRY_FLAG_COLS).limit(1000),
    ])

  return {
    intakes: (intakesRes.data ?? []) as unknown as IntakeTranscript[],
    episodes: (episodesRes.data ?? []) as unknown as EpisodeContent[],
    summaries: (summariesRes.data ?? []) as unknown as SummaryMatter[],
    logs: (logsRes.data ?? []) as unknown as SystemLog[],
    exhausted: exhaustedSet(naRes.data as RetryFlag[] | null),
    // Raw recovery rows — System Health needs the attempt counts, not just the
    // "which episodes are dead" set.
    retryJobs: (naRes.data ?? []) as RetryFlag[],
  }
}

export async function getConsultations() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("summaries_matters")
    .select("*, intake_transcripts(*)")
    .order("created_at", { ascending: false })
  return (data ?? []) as SummaryWithIntake[]
}

// The archive LIST deliberately omits the heavy fields (blog_html, raw/clean
// transcript, summary_text). They are large, never shown in the table, and
// shipping them for 200+200 rows made the page slow to hydrate and laggy to
// click. The detail drawer fetches them on demand via getArchiveDetail().
const ARCHIVE_EPISODE_COLS =
  "id, intake_id, title, description, show_name, confidence_score, seo_keywords, image_url, bannerbear_image_url, wordpress_post_id, wordpress_status, instagram_status, facebook_status, youtube_status, wordpress_url, instagram_url, facebook_url, youtube_url, created_at, intake_transcripts(id, source_type, file_name, file_url, status)"
const ARCHIVE_SUMMARY_COLS =
  "id, intake_id, client_name, clio_matter_id, attorney_status, filed_to_clio, created_at, summary_text, intake_transcripts(id, source_type, file_name, file_url, status)"

export async function getArchive() {
  const supabase = await createClient()
  const [episodesRes, summariesRes, naRes] = await Promise.all([
    supabase
      .from("episodes_content")
      .select(ARCHIVE_EPISODE_COLS)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("summaries_matters")
      .select(ARCHIVE_SUMMARY_COLS)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("retry_queue").select(RETRY_FLAG_COLS).limit(1000),
  ])
  return {
    episodes: (episodesRes.data ?? []) as EpisodeWithIntake[],
    summaries: (summariesRes.data ?? []) as SummaryWithIntake[],
    exhausted: exhaustedSet(naRes.data as RetryFlag[] | null),
    failedPlatforms: failedPlatformsMap(naRes.data as RetryFlag[] | null),
  }
}

// Blogs review page — episodes whose WordPress DRAFT has been created (post id
// set). These are the ones a reviewer opens, reads, and publishes. Heavy
// blog_html is fetched only when a blog is opened (getArchiveDetail).
const BLOG_COLS =
  "id, intake_id, title, description, show_name, seo_keywords, image_url, bannerbear_image_url, wordpress_post_id, wordpress_url, wordpress_status, youtube_status, instagram_status, facebook_status, youtube_url, created_at, intake_transcripts(status)"

export async function getBlogs() {
  const supabase = await createClient()
  const [episodesRes, naRes] = await Promise.all([
    supabase
      .from("episodes_content")
      .select(BLOG_COLS)
      .not("wordpress_post_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("retry_queue").select(RETRY_FLAG_COLS).limit(1000),
  ])
  return {
    episodes: (episodesRes.data ?? []) as unknown as EpisodeWithIntake[],
    exhausted: exhaustedSet(naRes.data as RetryFlag[] | null),
  }
}

export async function getLogs() {
  const supabase = await createClient()
  const { data } = await supabase
    .from("system_logs")
    .select("*")
    .order("created_at", { ascending: false })
  return (data ?? []) as SystemLog[]
}

// ── Unified activity feed ────────────────────────────────────────────────────
// A single human-readable timeline of EVERYTHING that happened: media uploaded,
// content generated, each platform publish, every recovery attempt (fail /
// retry / recovered / needs-attention), plus raw system_logs. Synthesized from
// the real tables so the page is rich even though the workflow writes few
// explicit logs.
export type ActivityCategory =
  | "upload"
  | "consultation"
  | "content"
  | "publish"
  | "recovery"
  | "system"
export type ActivityLevel = "info" | "success" | "warning" | "error"

export interface ActivityEvent {
  id: string
  category: ActivityCategory
  level: ActivityLevel
  title: string
  detail: string
  at: string
  platform?: string | null
  /** Originating upload file name. Content/publish events are titled with the
   * AI-generated blog title, which reads nothing like the file that produced
   * it — without this you cannot tell that "Arizona Mom Moved to Phoenix…" is
   * the episode from "Modern Law test.mp4". */
  source?: string | null
}

function cap(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

export async function getActivityFeed(): Promise<ActivityEvent[]> {
  const supabase = await createClient()
  const [intakesRes, episodesRes, retryRes, logsRes] = await Promise.all([
    supabase
      .from("intake_transcripts")
      .select("id, file_name, meeting_uuid, source_type, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("episodes_content")
      .select(
        "id, intake_id, title, created_at, wordpress_status, wordpress_post_id, wordpress_url, youtube_status, youtube_url, instagram_status, facebook_status"
      )
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("retry_queue")
      .select(
        "id, platform, status, attempts, max_attempts, last_error, created_at, updated_at, resolved_by"
      )
      .order("updated_at", { ascending: false })
      .limit(300),
    supabase
      .from("system_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300),
  ])

  const events: ActivityEvent[] = []

  // intake id → the file the client actually uploaded, so every downstream
  // content/publish event can name its origin.
  const fileByIntake = new Map<string, string>()
  for (const i of (intakesRes.data ?? []) as Array<Record<string, string>>) {
    const name = i.file_name ?? i.meeting_uuid ?? "Untitled intake"
    fileByIntake.set(i.id, name)
    const isZoom = i.source_type === "zoom_webhook"
    events.push({
      id: `up-${i.id}`,
      category: isZoom ? "consultation" : "upload",
      level: "info",
      title: isZoom ? "Consultation recording received" : "Media uploaded",
      detail: name,
      at: i.created_at,
    })
  }

  for (const e of (episodesRes.data ?? []) as Array<
    Record<string, string | null>
  >) {
    const t = e.title ?? "Untitled episode"
    const at = e.created_at as string
    const src = e.intake_id ? (fileByIntake.get(e.intake_id) ?? null) : null
    events.push({
      id: `ct-${e.id}`,
      category: "content",
      level: "info",
      title: "Content generated (transcript, blog, image)",
      detail: t,
      at,
      source: src,
    })
    // A social platform lands as either a publish or a failure — a timeline
    // that only ever logs successes hides exactly the events someone opens this
    // page to find.
    const socials: Array<[string, string, string | null]> = [
      ["yt", "YouTube", e.youtube_status],
      ["ig", "Instagram", e.instagram_status],
      ["fb", "Facebook", e.facebook_status],
    ]
    for (const [key, name, status] of socials) {
      const published =
        status === "published" || (key === "yt" && !!e.youtube_url)
      if (published)
        events.push({ id: `${key}-${e.id}`, category: "publish", level: "success", title: `Published to ${name}`, detail: t, at, platform: name.toLowerCase(), source: src })
      else if (status === "failed")
        events.push({ id: `${key}f-${e.id}`, category: "publish", level: "error", title: `${name} publish failed`, detail: t, at, platform: name.toLowerCase(), source: src })
    }

    // WordPress "live" means a real post URL was written back (see
    // `deriveEpisodeStatus` — same `.trim()` test, so the timeline and the
    // status badges can never disagree). A post id alone is only a draft.
    if ((e.wordpress_url ?? "").trim())
      events.push({ id: `wp-${e.id}`, category: "publish", level: "success", title: "Blog published to WordPress", detail: t, at, platform: "wordpress", source: src })
    else if (e.wordpress_status === "failed")
      events.push({ id: `wpf-${e.id}`, category: "publish", level: "error", title: "WordPress publish failed", detail: t, at, platform: "wordpress", source: src })
    else if ((e.wordpress_post_id ?? "").trim())
      events.push({ id: `wpd-${e.id}`, category: "publish", level: "info", title: "Blog draft created — pending review", detail: t, at, platform: "wordpress", source: src })
  }

  for (const r of (retryRes.data ?? []) as Array<Record<string, string | number | null>>) {
    const plat = cap(String(r.platform ?? "platform"))
    const attempts = Number(r.attempts ?? 0)
    const max = Number(r.max_attempts ?? 5)
    const at = (r.updated_at ?? r.created_at) as string
    const exhausted = r.status !== "resolved" && attempts >= max
    if (r.status === "resolved")
      events.push({ id: `rq-${r.id}`, category: "recovery", level: "success", title: `${plat} recovered`, detail: r.resolved_by === "auto" ? "Auto-retried successfully" : "Resolved manually", at, platform: String(r.platform ?? "") })
    else if (exhausted || r.status === "needs_attention")
      events.push({ id: `rq-${r.id}`, category: "recovery", level: "error", title: `${plat} needs attention`, detail: String(r.last_error ?? `All ${max} retry attempts used`), at, platform: String(r.platform ?? "") })
    else if (r.status === "retrying")
      events.push({ id: `rq-${r.id}`, category: "recovery", level: "warning", title: `Retrying ${plat} (attempt ${attempts}/${max})`, detail: String(r.last_error ?? "retry attempt failed"), at, platform: String(r.platform ?? "") })
    else
      events.push({ id: `rq-${r.id}`, category: "recovery", level: "error", title: `${plat} upload failed`, detail: String(r.last_error ?? "failed"), at, platform: String(r.platform ?? "") })
  }

  for (const l of (logsRes.data ?? []) as SystemLog[]) {
    events.push({
      id: `sys-${l.id}`,
      category: "system",
      level:
        l.event_type === "error"
          ? "error"
          : l.event_type === "warning"
            ? "warning"
            : "info",
      title: l.scenario_name ?? "System",
      detail: l.message ?? "",
      at: l.created_at,
    })
  }

  events.sort((a, b) => +new Date(b.at) - +new Date(a.at))
  return events.slice(0, 250)
}

export type RetryQueueJobEnriched = RetryQueueJob & {
  show_name: string | null
  episode_title: string | null
}

export async function getRetryQueue(): Promise<RetryQueueJobEnriched[]> {
  const supabase = await createClient()
  const [jobsRes, epsRes] = await Promise.all([
    supabase
      .from("retry_queue")
      .select("*")
      .order("updated_at", { ascending: false }),
    // retry_queue.entity_id = episodes_content.id — map it so the queue can show
    // WHICH show (Modern Law vs Business of Law) and which episode each job is.
    supabase.from("episodes_content").select("id, show_name, title"),
  ])
  const epMap = new Map(
    ((epsRes.data ?? []) as Array<{ id: string; show_name: string | null; title: string | null }>).map(
      (e) => [e.id, e]
    )
  )
  return ((jobsRes.data ?? []) as RetryQueueJob[]).map((j) => {
    const ep = j.entity_id ? epMap.get(j.entity_id) : undefined
    return {
      ...j,
      show_name: ep?.show_name ?? null,
      episode_title: ep?.title ?? null,
    }
  })
}

export type GbpPostRow = {
  id: string
  blog_title: string
  blog_url: string | null
  location_key: string
  location_name: string
  content: string
  ai_model: string
  status: string
  error_message: string | null
  character_count: number | null
  post_date: string
  created_at: string
  /** The live Google Business Profile post's own URL (createAPost.searchUrl),
   * saved per location once the post publishes. Older posts predate this. */
  post_url: string | null
  metadata: Record<string, unknown> | null
}

export async function getGbpPosts(): Promise<GbpPostRow[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("gbp_posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300)

  if (error) {
    // If the table hasn't been created yet, return empty list gracefully
    console.warn("Notice: gbp_posts query returned:", error.message)
    return []
  }

  return (data ?? []) as unknown as GbpPostRow[]
}

