import { getArchive } from "@/lib/queries"
import { attorneyStatusMeta, deriveEpisodeStatus, lifecycleMeta } from "@/lib/status"
import {
  ArchiveClient,
  type ArchiveRow,
} from "@/components/archive/archive-client"

export const dynamic = "force-dynamic"

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: { open?: string; tab?: string }
}) {
  const { episodes, summaries, exhausted, failedPlatforms } = await getArchive()

  const episodeRows: ArchiveRow[] = episodes.map((e) => ({
    id: e.id,
    kind: "episode",
    title: e.title ?? "Untitled episode",
    subtitle: e.show_name ?? "Podcast",
    sourceLabel: e.show_name ?? "Podcast",
    sourceType: e.intake_transcripts?.source_type ?? "manual_upload",
    date: e.created_at,
    status: lifecycleMeta[
      deriveEpisodeStatus({
        wordpressStatus: e.wordpress_status,
        youtubeStatus: e.youtube_status,
        instagramStatus: e.instagram_status,
        facebookStatus: e.facebook_status,
        intakeStatus: e.intake_transcripts?.status,
        showName: e.show_name,
        wordpressPostId: e.wordpress_post_id,
        wordpressUrl: e.wordpress_url,
        retriesExhausted: exhausted.has(e.id),
      })
    ],
    confidence: e.confidence_score,
    mediaPath: e.intake_transcripts?.file_url ?? null,
    mediaName: e.intake_transcripts?.file_name ?? null,
    rawTranscript: e.intake_transcripts?.raw_transcript ?? null,
    cleanTranscript: e.intake_transcripts?.clean_transcript ?? null,
    episode: {
      intakeId: e.intake_id ?? "",
      description: e.description,
      blogHtml: e.blog_html ?? "",
      seoKeywords: e.seo_keywords,
      imageUrl: e.image_url,
      bannerUrl: e.bannerbear_image_url,
      wordpressPostId: e.wordpress_post_id,
      wordpressStatus: e.wordpress_status,
      instagramStatus: e.instagram_status,
      facebookStatus: e.facebook_status,
      youtubeStatus: e.youtube_status,
      wordpressUrl: e.wordpress_url,
      instagramUrl: e.instagram_url,
      facebookUrl: e.facebook_url,
      youtubeUrl: e.youtube_url,
      retriesExhausted: exhausted.has(e.id),
      failedPlatforms: Array.from(failedPlatforms.get(e.id) ?? []),
    },
  }))

  const consultRows: ArchiveRow[] = summaries.map((s) => ({
    id: s.id,
    kind: "consultation",
    title: s.client_name ?? "Consultation",
    subtitle: s.intake_transcripts?.file_name ?? "Zoom consultation",
    sourceLabel: "Zoom consultation",
    sourceType: s.intake_transcripts?.source_type ?? "zoom_webhook",
    date: s.created_at,
    status: attorneyStatusMeta[s.attorney_status],
    // Episodes carry a real AI confidence score; consultations never had one.
    // The Clio lookup asks for a single matter and cannot see what else was
    // plausible, so there is nothing to report here.
    confidence: null,
    mediaPath: s.intake_transcripts?.file_url ?? null,
    mediaName: s.intake_transcripts?.file_name ?? null,
    rawTranscript: s.intake_transcripts?.raw_transcript ?? null,
    cleanTranscript: s.intake_transcripts?.clean_transcript ?? null,
    consult: {
      summary: s.summary_text,
      clientName: s.client_name,
      clioMatterId: s.clio_matter_id,
    },
  }))

  const rows = [...episodeRows, ...consultRows].sort(
    (a, b) => +new Date(b.date) - +new Date(a.date)
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight text-foreground">
          Historical Archive
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every intake, transcript, generated article, published record and
          filed Clio consultation — in one searchable studio.
        </p>
      </div>
      <ArchiveClient
        rows={rows}
        initialOpenId={searchParams.open}
        initialTab={searchParams.tab}
      />
    </div>
  )
}
