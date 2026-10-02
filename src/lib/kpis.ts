import type {
  IntakeTranscript,
  EpisodeContent,
  SummaryMatter,
  SystemLog,
} from "@/types/database"
import { type LifecycleStatus } from "@/lib/status"

export interface DayPoint {
  date: string // ISO day
  label: string // "Aug 25"
  uploads: number
  processed: number
}

function dayKey(iso: string) {
  return iso.slice(0, 10)
}

/** Build an inclusive series of the last `days` days. `uploads` = intakes taken
 * in that day; `processed` = work actually finished that day — episodes (blog
 * content) generated PLUS Zoom consultations approved & filed to Clio. Clio
 * consultations never become episodes, so counting only episodes hid all the
 * consultation work from the second line. */
export function buildDaySeries(
  intakes: IntakeTranscript[],
  episodes: EpisodeContent[] = [],
  summaries: SummaryMatter[] = [],
  days = 14
): DayPoint[] {
  const today = new Date()
  const buckets = new Map<string, DayPoint>()

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    buckets.set(key, {
      date: key,
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      uploads: 0,
      processed: 0,
    })
  }

  for (const it of intakes) {
    const bucket = buckets.get(dayKey(it.created_at))
    if (bucket) bucket.uploads += 1
  }
  for (const ep of episodes) {
    const bucket = buckets.get(dayKey(ep.created_at))
    if (bucket) bucket.processed += 1
  }
  // Clio consultations that were approved & filed are finished work too.
  for (const s of summaries) {
    if (!s.filed_to_clio) continue
    const bucket = buckets.get(dayKey(s.created_at))
    if (bucket) bucket.processed += 1
  }

  return Array.from(buckets.values())
}

export function sparkFromSeries(series: DayPoint[], key: "uploads" | "processed") {
  return series.slice(-7).map((p) => ({ v: p[key] }))
}

export interface PlatformSlice {
  name: string
  value: number
  key: string
}

export function platformDistribution(
  episodes: EpisodeContent[],
  summaries: SummaryMatter[]
): PlatformSlice[] {
  const wp = episodes.filter((e) => e.wordpress_status === "published").length
  const ig = episodes.filter((e) => e.instagram_status === "published").length
  const fb = episodes.filter((e) => e.facebook_status === "published").length
  const yt = episodes.filter((e) => e.youtube_status === "published").length
  const clio = summaries.filter((s) => s.filed_to_clio).length
  return [
    { name: "WordPress", key: "wordpress", value: wp },
    { name: "Instagram", key: "instagram", value: ig },
    { name: "Facebook", key: "facebook", value: fb },
    { name: "YouTube", key: "youtube", value: yt },
    { name: "Clio", key: "clio", value: clio },
  ].filter((s) => s.value > 0)
}

export interface ConfidenceBar {
  name: string
  confidence: number
  show: string | null
}

export function confidenceBars(episodes: EpisodeContent[]): ConfidenceBar[] {
  return episodes
    .filter((e) => e.confidence_score != null)
    .sort((a, b) => (b.confidence_score ?? 0) - (a.confidence_score ?? 0))
    .map((e) => ({
      name: (e.title ?? "Untitled").slice(0, 28),
      confidence: e.confidence_score ?? 0,
      show: e.show_name,
    }))
}

export interface Kpis {
  totalIngestions: number
  liveProcessing: number
  publishedPosts: number
  pendingClio: number
  successRate: number
  retries: number
  errors: number
}

/** System Health used to be derived from `system_logs` alone. That table only
 * ever receives ingest events, so failures were invisible: it always reported
 * 100% success / 0 errors even with a dead WordPress job in the recovery queue.
 * Health is now derived from the same canonical lifecycle the rest of the UI
 * shows, plus the real recovery rows — so the numbers agree with the pipeline
 * breakdown instead of contradicting it. */
export function computeKpis(
  intakes: IntakeTranscript[],
  episodes: EpisodeContent[],
  summaries: SummaryMatter[],
  logs: SystemLog[],
  statuses: LifecycleStatus[],
  retryJobs: { status?: string | null; attempts?: number | null }[] = []
): Kpis {
  // Raw intake.status never reaches "completed" (nothing writes it back), so
  // counting it here reported every upload as "in queue now" forever.
  const liveProcessing = statuses.filter(
    (s) => s === "processing" || s === "pending"
  ).length

  const publishedPosts = episodes.filter(
    (e) => e.wordpress_status === "published"
  ).length

  const pendingClio = summaries.filter(
    (s) => s.attorney_status === "pending_review"
  ).length

  const failed = statuses.filter((s) => s === "failed").length
  const errorLogs = logs.filter((l) => l.event_type === "error").length
  const retries = retryJobs.reduce((sum, r) => sum + (r.attempts || 0), 0)

  // Share of intakes that did NOT end in a failed state — the complement of the
  // "Failed" slice in the pipeline breakdown.
  const successRate = statuses.length
    ? Math.round(((statuses.length - failed) / statuses.length) * 100)
    : 100

  return {
    totalIngestions: intakes.length,
    liveProcessing,
    publishedPosts,
    pendingClio,
    successRate,
    retries,
    errors: failed + errorLogs,
  }
}

export interface PipelineStage {
  key: string
  label: string
  count: number
  active: boolean
}

export function pipelineStages(
  intakes: IntakeTranscript[],
  episodes: EpisodeContent[],
  summaries: SummaryMatter[]
): PipelineStage[] {
  const inIntake = intakes.filter((i) => i.status === "pending").length
  const inStorage = intakes.length
  const inAi = intakes.filter((i) => i.status === "processing").length
  const publishing =
    episodes.filter((e) =>
      [e.instagram_status, e.facebook_status, e.youtube_status].includes(
        "pending"
      )
    ).length +
    summaries.filter((s) => s.attorney_status === "pending_review").length

  return [
    { key: "intake", label: "Intake", count: inIntake, active: inIntake > 0 },
    { key: "storage", label: "Supabase", count: inStorage, active: true },
    { key: "ai", label: "AI Engine", count: inAi, active: inAi > 0 },
    {
      key: "publish",
      label: "Publishing",
      count: publishing,
      active: publishing > 0,
    },
  ]
}

export function unfiledSummaries(
  summaries: (SummaryMatter & { intake_transcripts?: unknown })[]
) {
  // A consultation needs an attorney while it is still awaiting review, or while
  // no Clio matter has been settled on. There is no confidence score to weigh:
  // the Clio lookup asks for a single matter and cannot see what else was
  // plausible, so it never produced one.
  return summaries.filter(
    (s) => s.attorney_status === "pending_review" || !s.clio_matter_id
  )
}
