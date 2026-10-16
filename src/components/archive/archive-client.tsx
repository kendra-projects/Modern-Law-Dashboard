"use client"

import * as React from "react"
import Link from "next/link"
import { toast } from "sonner"
import DOMPurify from "dompurify"
import {
  Search,
  Video,
  Upload,
  FileText,
  Eye,
  Copy,
  ExternalLink,
  Sparkles,
  ImageIcon,
  Loader2,
  Download,
  FileVideo,
  Scale,
} from "lucide-react"
import { getSignedMediaUrl, getArchiveDetail } from "@/app/actions/media"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/status-badge"
import { BlogVideo, stripVideoEmbed } from "@/components/blog-video"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  TimeRangeSelect,
  useCutoff,
  withinRange,
} from "@/components/time-range-select"
import { socialStatusMeta, lifecycleMeta, type StatusMeta } from "@/lib/status"
import { manualUploadMeta, manualUploadNote } from "@/lib/manual-upload"
import { shortDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import type {
  IntakeSourceType,
  SocialStatus,
  WordpressStatus,
} from "@/types/database"

export interface ArchiveRow {
  id: string
  kind: "episode" | "consultation"
  title: string
  subtitle: string
  sourceLabel: string
  sourceType: IntakeSourceType
  date: string
  status: StatusMeta
  confidence: number | null
  mediaPath: string | null
  mediaName: string | null
  rawTranscript: string | null
  cleanTranscript: string | null
  episode?: {
    intakeId: string
    description: string | null
    blogHtml: string
    seoKeywords: string[] | null
    imageUrl: string | null
    bannerUrl: string | null
    wordpressStatus: WordpressStatus
    instagramStatus: SocialStatus
    facebookStatus: SocialStatus
    youtubeStatus: SocialStatus
    wordpressPostId: string | null
    wordpressUrl: string | null
    instagramUrl: string | null
    facebookUrl: string | null
    youtubeUrl: string | null
    retriesExhausted: boolean
    /** Platforms (lowercase: "facebook", "youtube"…) whose recovery retries are
     * exhausted — shown as Failed even if their stored status is still stale. */
    failedPlatforms: string[]
    /** Platforms staff upload by hand (lib/manual-upload.ts), e.g. a Facebook
     * video over the Reel limit. */
    manualPlatforms: string[]
  }
  consult?: {
    summary: string | null
    clientName: string | null
    clioMatterId: string | null
  }
}

function copy(text: string, label: string) {
  navigator.clipboard.writeText(text)
  toast.success(`${label} copied`)
}

// Make's WordPress "Create a post" module returns only the post ID (no URL), so
// wordpress_url is usually empty. The posts are created as DRAFTS for attorney
// review, and a public `/?p=<id>` link 404s for anyone not logged in — so we
// build the WordPress admin EDIT link instead, which opens the draft straight in
// the editor for the (logged-in) reviewer. If a real published URL ever lands in
// wordpress_url, that takes precedence.
function wordpressLink(
  show: string,
  postId: string | null,
  existing: string | null
): string | null {
  if (existing) return existing
  if (!postId || !/^\d+$/.test(postId)) return null // skip non-numeric/test ids
  const s = show.toLowerCase()
  const base = s.includes("business of law")
    ? "https://billietarascio.com"
    : s.includes("modern")
      ? "https://mymodernlaw.com"
      : null
  return base ? `${base}/wp-admin/post.php?post=${postId}&action=edit` : null
}

// The stored wordpress_status is hardcoded "published" by the workflow even
// though the post is a DRAFT. Show the truthful state:
//   • live URL present            → Published
//   • draft post created (post id) → Drafted (awaiting human publish)
//   • retries used up / failed     → Failed
//   • otherwise (not created yet)  → Processing (still being made / retried)
// The raw "draft" default never surfaces as a bare "Draft" — that read as a
// dead-end; while WordPress hasn't been created it is really still in progress.
function wordpressRowMeta(
  status: WordpressStatus,
  postId: string | null,
  url: string | null,
  retriesExhausted: boolean
): StatusMeta {
  if (url?.trim()) return lifecycleMeta.published
  if (postId?.trim()) return lifecycleMeta.drafted
  if (status === "failed" || retriesExhausted) return lifecycleMeta.failed
  return lifecycleMeta.processing
}

// Sanitize AI-generated blog HTML in the browser (DOMPurify) right before it is
// injected — strips scripts/handlers/iframes while keeping safe blog formatting.
function sanitizeBlog(dirty: string): string {
  if (!dirty || typeof window === "undefined") return ""
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      "h1", "h2", "h3", "h4", "h5", "h6", "p", "a", "ul", "ol", "li",
      "blockquote", "strong", "em", "b", "i", "u", "br", "hr", "code",
      "pre", "span", "table", "thead", "tbody", "tr", "th", "td",
      "figure", "figcaption", "img",
    ],
    ALLOWED_ATTR: ["href", "title", "target", "rel", "src", "alt", "class"],
    FORBID_TAGS: ["script", "style", "iframe", "form", "input", "object", "embed"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "style"],
  })
}

export function ArchiveClient({
  rows,
  initialOpenId,
  initialTab,
}: {
  rows: ArchiveRow[]
  initialOpenId?: string
  initialTab?: string
}) {
  const [q, setQ] = React.useState("")
  const [source, setSource] = React.useState<string>("all")
  const [show, setShow] = React.useState<string>("all")
  /** Days to look back; "all" keeps everything. */
  const [range, setRange] = React.useState<string>("all")
  const [active, setActive] = React.useState<ArchiveRow | null>(null)
  const [openTab, setOpenTab] = React.useState(initialTab ?? "overview")

  // Deep link from the upload page (/archive?open=<episodeId>&tab=publish)
  // opens that record straight on the Publishing tab.
  React.useEffect(() => {
    if (!initialOpenId) return
    const match = rows.find((r) => r.id === initialOpenId)
    if (match) {
      setActive(match)
      setOpenTab(initialTab ?? "overview")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpenId])

  const cutoff = useCutoff(range)

  const filtered = rows.filter((r) => {
    if (show === "consultation") {
      if (r.kind !== "consultation") return false
    } else if (show !== "all") {
      // The show names only apply to produced content; a consultation has no
      // show, so matching it against one would silently drop every episode.
      if (r.kind !== "episode") return false
      if (!r.sourceLabel.toLowerCase().includes(show.toLowerCase())) return false
    }
    if (source !== "all" && r.sourceType !== source) return false
    if (!withinRange(r.date, cutoff)) return false
    if (q) {
      const hay = `${r.title} ${r.subtitle} ${r.cleanTranscript ?? ""}`.toLowerCase()
      if (!hay.includes(q.toLowerCase())) return false
    }
    return true
  })

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        {/* Search on its own row until there is room for everything in one:
            three selects beside a search box wrap into a mess below ~1000px. */}
        <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
          <div className="relative lg:flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search titles, transcripts…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:flex lg:shrink-0">
            <TimeRangeSelect
              value={range}
              onChange={setRange}
              className="lg:w-44"
            />
            <Select value={show} onValueChange={setShow}>
              <SelectTrigger className="w-full lg:w-44">
                <SelectValue placeholder="Content" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All content</SelectItem>
                <SelectItem value="Modern Law">Modern Law</SelectItem>
                <SelectItem value="Business of Law">Business of Law</SelectItem>
                <SelectItem value="consultation">Clio consultations</SelectItem>
              </SelectContent>
            </Select>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="w-full lg:w-44">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="manual_upload">Manual upload</SelectItem>
                <SelectItem value="zoom_webhook">Zoom consultation</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead className="hidden md:table-cell">Source</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">Date</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => {
              const Icon =
                r.sourceType === "zoom_webhook" ? Video : Upload
              return (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => {
                    setActive(r)
                    setOpenTab("overview")
                  }}
                >
                  {/* w-full + max-w-0 is the idiom that makes truncate work in
                      a table: without it the cell sizes to its content, and a
                      title like "Colton Keeling: Initial Consultation with…"
                      pushed the table to 1031px inside a 341px phone. */}
                  <TableCell className="w-full max-w-0">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {r.title}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {r.subtitle}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="muted">{r.sourceLabel}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <StatusBadge meta={r.status} />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                    {shortDate(r.date)}
                  </TableCell>
                  <TableCell className="hidden text-right sm:table-cell">
                    <Button variant="ghost" size="icon">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-14 text-center text-sm text-muted-foreground">
                  No records match your filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <DetailDrawer
        row={active}
        tab={openTab}
        onTabChange={setOpenTab}
        onClose={() => setActive(null)}
      />
    </div>
  )
}

function DetailDrawer({
  row,
  tab,
  onTabChange,
  onClose,
}: {
  row: ArchiveRow | null
  tab: string
  onTabChange: (tab: string) => void
  onClose: () => void
}) {
  const ep = row?.episode
  // Business of Law only publishes to YouTube + WordPress — hide the Instagram
  // and Facebook rows for it (Modern Law shows all four).
  const businessOfLaw = `${row?.sourceLabel ?? ""} ${row?.subtitle ?? ""}`
    .toLowerCase()
    .includes("business of law")

  // Heavy fields (blog HTML, transcripts, full summary) are fetched only when
  // the drawer opens, so the list stays light and snappy.
  const [detail, setDetail] = React.useState<{
    blogHtml: string | null
    rawTranscript: string | null
    cleanTranscript: string | null
    summaryText?: string | null
  } | null>(null)
  const [detailLoading, setDetailLoading] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    setDetail(null)
    if (!row) return
    setDetailLoading(true)
    getArchiveDetail(row.kind, row.id)
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [row])

  const blogHtml = detail?.blogHtml ?? ep?.blogHtml ?? ""
  const rawTranscript = detail?.rawTranscript ?? row?.rawTranscript ?? null
  const cleanTranscript =
    detail?.cleanTranscript ?? row?.cleanTranscript ?? null
  const summary = detail?.summaryText ?? row?.consult?.summary ?? null

  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-xl">
        {row && (
          <>
            <SheetHeader className="border-b border-border p-5">
              <div className="flex items-center gap-2">
                <Badge variant="muted">{row.sourceLabel}</Badge>
                <StatusBadge meta={row.status} />
              </div>
              <SheetTitle className="font-serif text-xl">{row.title}</SheetTitle>
              <p className="text-sm text-muted-foreground">{row.subtitle}</p>
            </SheetHeader>

            <div className="p-5">
              <Tabs value={tab} onValueChange={onTabChange}>
                <TabsList className="w-full">
                  <TabsTrigger value="overview" className="flex-1">
                    Overview
                  </TabsTrigger>
                  <TabsTrigger value="transcripts" className="flex-1">
                    Transcripts
                  </TabsTrigger>
                  {ep && (
                    <TabsTrigger value="blog" className="flex-1">
                      Blog
                    </TabsTrigger>
                  )}
                  {ep && (
                    <TabsTrigger value="publish" className="flex-1">
                      Publishing
                    </TabsTrigger>
                  )}
                </TabsList>

                {/* OVERVIEW */}
                <TabsContent value="overview" className="space-y-4">
                  {/* A Zoom consultation has no uploaded media file — the video
                      lives in Zoom and the source URL 404s — so the player only
                      belongs on produced episodes. For consultations the useful
                      artefacts are the client, the matter, the summary and the
                      transcript (own tab). */}
                  {!row.consult && (
                    <MediaPlayer
                      path={row.mediaPath}
                      name={row.mediaName}
                      open={!!row}
                    />
                  )}
                  {row.consult && (
                    <div className="space-y-3">
                      <Field label="Client">{row.consult.clientName ?? "—"}</Field>
                      <Field label="Clio Matter">
                        {row.consult.clioMatterId ?? "Unassigned"}
                      </Field>
                      {summary?.trim() ? (
                        <div className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 text-sm leading-relaxed text-muted-foreground">
                          {summary}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Zoom returned no summary. The full transcript is under
                          the Transcripts tab.
                        </p>
                      )}
                      <Link
                        href={`/meetings?open=${row.id}`}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
                      >
                        <Scale className="h-4 w-4" />
                        Open in Meeting Resolution
                      </Link>
                    </div>
                  )}
                  {ep && (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm leading-relaxed text-muted-foreground">
                        {ep.description ?? "No description."}
                      </div>
                      {ep.seoKeywords && ep.seoKeywords.length > 0 && (
                        <div>
                          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <Sparkles className="h-3.5 w-3.5" /> SEO keywords
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {ep.seoKeywords.map((k) => (
                              <Badge key={k} variant="secondary">
                                {k}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <ImageCard label="Header image" url={ep.imageUrl} />
                        <ImageCard label="Banner render" url={ep.bannerUrl} />
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* TRANSCRIPTS */}
                <TabsContent value="transcripts" className="space-y-4">
                  {detailLoading && !detail ? (
                    <div className="flex h-24 items-center justify-center text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : row.consult && !rawTranscript && !cleanTranscript ? (
                    // Zoom's AI summary comes for every meeting; the transcript
                    // only when the meeting was recorded to the cloud.
                    <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm leading-relaxed text-muted-foreground">
                      <p className="font-medium text-foreground">No transcript from Zoom</p>
                      <p className="mt-1">
                        {"Zoom only sends a transcript when the meeting is recorded to the cloud, usually within an hour of the summary. This one wasn't, or it hasn't arrived yet. The summary on the Overview tab comes either way."}
                      </p>
                    </div>
                  ) : (
                    <>
                      <TranscriptBlock
                        label="Raw transcript"
                        text={rawTranscript}
                      />
                      <TranscriptBlock
                        label="AI-cleaned transcript"
                        text={cleanTranscript}
                        highlight
                      />
                    </>
                  )}
                </TabsContent>

                {/* BLOG */}
                {ep && (
                  <TabsContent value="blog" className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">
                        SEO blog preview
                      </p>
                      <span className="flex items-center gap-1 text-xs text-success">
                        <FileText className="h-3.5 w-3.5" /> Sanitized HTML
                      </span>
                    </div>
                    {detailLoading && !detail ? (
                      <div className="flex h-24 items-center justify-center text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </div>
                    ) : blogHtml ? (
                      <ScrollArea className="h-[340px] rounded-lg border border-border bg-card p-4">
                        <div className="space-y-3">
                          <BlogVideo html={blogHtml} />
                          <div
                            className="prose-blog"
                            dangerouslySetInnerHTML={{
                              __html: sanitizeBlog(stripVideoEmbed(blogHtml)),
                            }}
                          />
                        </div>
                      </ScrollArea>
                    ) : (
                      <p className="py-10 text-center text-sm text-muted-foreground">
                        No blog generated yet.
                      </p>
                    )}
                  </TabsContent>
                )}

                {/* PUBLISHING */}
                {ep && (
                  <TabsContent value="publish" className="space-y-3">
                    {(() => {
                      // A platform whose recovery retries are exhausted reads as
                      // Failed, overriding its stale stored status (e.g. Facebook
                      // stuck on "pending" after the reel upload actually failed).
                      const failed = new Set(ep.failedPlatforms)
                      // Marked "upload by hand" and not posted yet: say so instead.
                      const manual = (p: string, s: SocialStatus) => s !== "published" && ep.manualPlatforms.includes(p)
                      const socialMeta = (p: string, s: SocialStatus) =>
                        failed.has(p) ? lifecycleMeta.failed : manual(p, s) ? manualUploadMeta : socialStatusMeta[s]
                      return (
                        <>
                          <PublishRow
                            label="WordPress"
                            meta={wordpressRowMeta(
                              ep.wordpressStatus,
                              ep.wordpressPostId,
                              ep.wordpressUrl,
                              failed.has("wordpress")
                            )}
                            url={wordpressLink(
                              `${row.sourceLabel} ${row.subtitle}`,
                              ep.wordpressPostId,
                              ep.wordpressUrl
                            )}
                          />
                          <PublishRow
                            label="YouTube"
                            meta={socialMeta("youtube", ep.youtubeStatus)}
                            url={ep.youtubeUrl}
                          />
                          {!businessOfLaw && (
                            <>
                              <PublishRow
                                label="Instagram"
                                meta={socialMeta("instagram", ep.instagramStatus)}
                                url={ep.instagramUrl}
                              />
                              <PublishRow
                                label="Facebook"
                                meta={socialMeta("facebook", ep.facebookStatus)}
                                url={ep.facebookUrl}
                                note={manual("facebook", ep.facebookStatus) ? manualUploadNote("facebook") : undefined}
                              />
                            </>
                          )}
                        </>
                      )
                    })()}
                  </TabsContent>
                )}
              </Tabs>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{children}</span>
    </div>
  )
}

function TranscriptBlock({
  label,
  text,
  highlight,
}: {
  label: string
  text: string | null
  highlight?: boolean
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {text && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-xs"
            onClick={() => copy(text, label)}
          >
            <Copy className="h-3 w-3" /> Copy
          </Button>
        )}
      </div>
      <div
        className={cn(
          "max-h-40 overflow-y-auto rounded-lg border p-3 text-sm leading-relaxed",
          highlight
            ? "border-primary/30 bg-primary/5 text-foreground"
            : "border-border bg-muted/30 text-muted-foreground"
        )}
      >
        {text || "Not available."}
      </div>
    </div>
  )
}

const VIDEO_EXT = ["mp4", "mov", "webm", "m4v", "ogv"]
const AUDIO_EXT = ["mp3", "wav", "m4a", "aac", "ogg", "oga"]

// Plays the ORIGINAL uploaded media (the file the user dropped) inside the
// dashboard. The `media` bucket is private, so we mint a short-lived signed URL
// on open via a server action — the object is never made public.
function MediaPlayer({
  path,
  name,
  open,
}: {
  path: string | null
  name: string | null
  open: boolean
}) {
  const [url, setUrl] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    setUrl(null)
    if (!open || !path) return
    setLoading(true)
    getSignedMediaUrl(path)
      .then((r) => {
        if (!cancelled) setUrl(r.url)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [path, open])

  if (!path) return null

  const ext = (name ?? path).split(".").pop()?.toLowerCase() ?? ""
  const isVideo = VIDEO_EXT.includes(ext)
  const isAudio = AUDIO_EXT.includes(ext)

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <FileVideo className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium text-foreground">Source media</span>
        <span className="ml-auto truncate text-xs text-muted-foreground">
          {name ?? "Uploaded file"}
        </span>
      </div>
      <div className="p-3">
        {loading ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : url && isVideo ? (
          <video
            controls
            preload="metadata"
            className="max-h-[360px] w-full rounded-md bg-black"
            src={url}
          />
        ) : url && isAudio ? (
          <audio controls className="w-full" src={url} />
        ) : url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-md border border-border bg-card py-6 text-sm font-medium text-primary hover:bg-muted/50"
          >
            {url.includes("zoom.us") ? (
              <>
                <ExternalLink className="h-4 w-4" /> Open Zoom Document / Recording
              </>
            ) : (
              <>
                <Download className="h-4 w-4" /> Open uploaded file
              </>
            )}
          </a>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Media unavailable.
          </p>
        )}
      </div>
    </div>
  )
}

function ImageCard({ label, url }: { label: string; url: string | null }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="mb-2 overflow-hidden rounded-md bg-gradient-to-br from-primary/15 to-accent/15">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="block">
            {/* Cloudinary/Supabase remote asset — plain <img> avoids next/image
               remote-domain config and renders the moment a URL is written, even
               if the rest of the pipeline hasn't finished. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={label}
              loading="lazy"
              className="aspect-video w-full object-cover"
            />
          </a>
        ) : (
          <div className="flex aspect-video items-center justify-center">
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
      </div>
      <p className="text-xs font-medium text-foreground">{label}</p>
      <p className="truncate text-xs text-muted-foreground">
        {url ? "Generated" : "Not generated yet"}
      </p>
    </div>
  )
}

function PublishRow({
  label,
  meta,
  url,
  note,
}: {
  label: string
  meta: StatusMeta
  url: string | null
  /** A line under the label, e.g. why it must be uploaded by hand. */
  note?: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 p-3">
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {note && <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>}
      </div>
      <StatusBadge meta={meta} />
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Open <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      )}
    </div>
  )
}
