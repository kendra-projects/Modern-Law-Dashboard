import { getRole, getCurrentUser } from "@/lib/role"
import { ClioSyncPing } from "@/components/intake/clio-sync-ping"
import { getWorkspace } from "@/lib/workspace"
import { WorkspaceChooser } from "@/components/shell/workspace-chooser"
import { createClient } from "@/lib/supabase/server"
import { IntakeOverview, type OverviewAppt } from "@/components/intake/intake-overview"
import type { IntakeLead } from "@/types/database"
import { getOverviewData } from "@/lib/queries"
import { growMatterLeads } from "@/lib/grow-ready-server"
import {
  buildDaySeries,
  computeKpis,
  platformDistribution,
  sparkFromSeries,
} from "@/lib/kpis"
import { deriveEpisodeStatus, type LifecycleStatus } from "@/lib/status"
import {
  OverviewClient,
  type OverviewData,
} from "@/components/overview/overview-client"
import type { StreamItem } from "@/components/overview/recent-stream"
import type { StageCounts } from "@/components/overview/pipeline-breakdown"

export const dynamic = "force-dynamic"

export default async function OverviewPage() {
  // The intake login gets its own home — consultation-lead numbers, not the
  // content pipeline. Everyone else (content, admin) gets the content Overview.
  // Admin sees both, one workspace at a time: the picker until it chooses,
  // then that workspace's Overview.
  const role = await getRole()
  if (role === "intake") return <IntakeOverviewSection />
  if (role === "admin") {
    const ws = getWorkspace()
    if (!ws) return <WorkspaceChooser email={(await getCurrentUser())?.email ?? ""} />
    if (ws === "intake") return <IntakeOverviewSection />
  }
  return <ContentOverviewSection />
}

async function IntakeOverviewSection() {
  const supabase = await createClient()
  const day = 24 * 60 * 60 * 1000
  const from = new Date(Date.now() - 14 * day).toISOString()
  const to = new Date(Date.now() + 15 * day).toISOString()
  // Leads and the mirrored Acuity schedule (two weeks either side), together.
  const [{ data: leads }, { data: appts }] = await Promise.all([
    supabase
      .from("intake_leads")
      .select("id, status, source, client_first, client_last, email, phone, matter_type, method, office, consult_datetime, consult_type, consulting_attorney, priority_score, conflict_status, assigned_advocate, clio_matter_id, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("appointments")
      .select("id, datetime, attorney, type, is_consult, canceled, client_first, client_last, location, lead_id")
      .gte("datetime", from)
      .lt("datetime", to)
      .order("datetime", { ascending: true })
      .limit(1000),
  ])
  const rows = (leads ?? []) as unknown as IntakeLead[]
  return (
    <>
      <ClioSyncPing />
      <IntakeOverview
        leads={rows}
        appts={(appts ?? []) as unknown as OverviewAppt[]}
        growMatter={await growMatterLeads(supabase, rows)}
      />
    </>
  )
}

async function ContentOverviewSection() {
  const { intakes, episodes, summaries, logs, exhausted, retryJobs } =
    await getOverviewData()

  const series = buildDaySeries(intakes, episodes, summaries, 14)

  // Map intake → its episode so the stream shows ONE canonical lifecycle status
  // (the same value the archive shows), instead of the raw intake row status.
  const epByIntake = new Map(episodes.map((e) => [e.intake_id, e]))

  // A Zoom consultation does not flow through the content pipeline, so the
  // content lifecycle ("Processing", "Drafted"…) is wrong for it — it is waiting
  // on an attorney. Reflect its review state from the summary instead.
  const summaryByIntake = new Map(summaries.map((s) => [s.intake_id, s]))

  // Derive the canonical lifecycle once per intake: the stream shows the newest
  // dozen, the stage breakdown counts them all.
  const withStatus = intakes.map((i) => {
    const ep = epByIntake.get(i.id)
    let status: LifecycleStatus
    if (i.source_type === "zoom_webhook") {
      const sm = summaryByIntake.get(i.id)
      // Filed to Clio = done; otherwise it is awaiting attorney review.
      status = sm?.filed_to_clio ? "published" : "pending"
    } else {
      status = deriveEpisodeStatus({
        wordpressStatus: ep?.wordpress_status,
        youtubeStatus: ep?.youtube_status,
        instagramStatus: ep?.instagram_status,
        facebookStatus: ep?.facebook_status,
        intakeStatus: i.status,
        showName: ep?.show_name,
        wordpressPostId: ep?.wordpress_post_id,
        wordpressUrl: ep?.wordpress_url,
        retriesExhausted: ep ? exhausted.has(ep.id) : false,
      })
    }
    return { intake: i, status }
  })

  // Each row opens its own record: a consultation's review panel on Meeting
  // Resolution, an upload's episode in the Archive (or the Upload page while it
  // has no episode yet).
  const hrefFor = (intakeId: string, source: string) => {
    if (source === "zoom_webhook") {
      const sm = summaryByIntake.get(intakeId)
      return sm ? `/meetings?open=${sm.id}` : "/meetings"
    }
    const ep = epByIntake.get(intakeId)
    return ep ? `/archive?open=${ep.id}` : "/upload"
  }

  const stream: StreamItem[] = withStatus.slice(0, 12).map(({ intake, status }) => ({
    id: intake.id,
    title: intake.file_name ?? intake.meeting_uuid ?? "Untitled intake",
    source_type: intake.source_type,
    created_at: intake.created_at,
    status,
    href: hrefFor(intake.id, intake.source_type),
  }))

  const stageCounts: StageCounts = {
    pending: 0,
    processing: 0,
    drafted: 0,
    published: 0,
    failed: 0,
  }
  for (const { status } of withStatus) stageCounts[status] += 1

  // Health is computed from the same lifecycle values the breakdown shows, so
  // the radial can never claim 100% while a row reads "Failed" beside it.
  const kpis = computeKpis(
    intakes,
    episodes,
    summaries,
    logs,
    withStatus.map((w) => w.status),
    retryJobs
  )

  const data: OverviewData = {
    kpis,
    series,
    platform: platformDistribution(episodes, summaries),
    stream,
    stageCounts,
    sparks: {
      ingestions: sparkFromSeries(series, "uploads"),
      processed: sparkFromSeries(series, "processed"),
    },
  }

  return <OverviewClient data={data} />
}
