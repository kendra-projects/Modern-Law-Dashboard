import Link from "next/link"
import { Video, ArrowRight, Radio } from "lucide-react"
import { UploadDropzone } from "@/components/upload/upload-dropzone"
import { UploadPipeline } from "@/components/upload/upload-pipeline"
import { getOverviewData } from "@/lib/queries"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/status-badge"
import { deriveEpisodeStatus, lifecycleMeta } from "@/lib/status"
import { timeAgo } from "@/lib/format"

export const dynamic = "force-dynamic"

export default async function UploadPage() {
  const { intakes, episodes, exhausted } = await getOverviewData()
  const epByIntake = new Map(episodes.map((e) => [e.intake_id, e]))
  const recentUploads = intakes
    .filter((i) => i.source_type === "manual_upload")
    .slice(0, 6)
    .map((i) => {
      const ep = epByIntake.get(i.id)
      return {
        ...i,
        episodeId: ep?.id ?? null,
        hasBlog: !!ep?.wordpress_post_id,
        lifecycle: deriveEpisodeStatus({
          wordpressStatus: ep?.wordpress_status,
          youtubeStatus: ep?.youtube_status,
          instagramStatus: ep?.instagram_status,
          facebookStatus: ep?.facebook_status,
          intakeStatus: i.status,
          showName: ep?.show_name,
          wordpressPostId: ep?.wordpress_post_id,
          wordpressUrl: ep?.wordpress_url,
          retriesExhausted: ep ? exhausted.has(ep.id) : false,
        }),
      }
    })

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="font-serif text-xl">
            Direct Media Intake
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Drop a downloaded TikTok video to start the automation pipeline.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <UploadDropzone />

          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Radio className="h-3.5 w-3.5 text-primary" />
              Live pipeline — most recent upload
            </p>
            {recentUploads.length > 0 ? (
              <UploadPipeline
                fileName={recentUploads[0].file_name ?? "Uploaded file"}
                intakeStatus={recentUploads[0].status}
                lifecycle={recentUploads[0].lifecycle}
                hasEpisode={!!recentUploads[0].episodeId}
              />
            ) : (
              <p className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center text-xs text-muted-foreground">
                Upload a file above to see it move through Supabase → Make.com
                → Publishing here, live.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Recent Uploads</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {recentUploads.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No manual uploads yet.
            </p>
          )}
          {recentUploads.map((u) => (
            <div
              key={u.id}
              className="rounded-lg border border-border bg-card/60 p-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Video className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {u.file_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {timeAgo(u.created_at)}
                  </p>
                </div>
                <StatusBadge meta={lifecycleMeta[u.lifecycle]} />
              </div>
              {u.episodeId && (
                <div className="mt-2 flex items-center gap-3 border-t border-border/60 pt-2 text-xs">
                  <Link
                    href={`/archive?open=${u.episodeId}&tab=publish`}
                    className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
                  >
                    View status <ArrowRight className="h-3 w-3" />
                  </Link>
                  {u.hasBlog && (
                    <Link
                      href={`/blogs?open=${u.episodeId}`}
                      className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
                    >
                      View blog <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
