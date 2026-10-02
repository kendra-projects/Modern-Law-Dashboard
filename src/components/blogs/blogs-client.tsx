"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import DOMPurify from "dompurify"
import {
  Search,
  FileText,
  ImageIcon,
  Loader2,
  ExternalLink,
  CheckCircle2,
  Sparkles,
  Eye,
  FileDown,
} from "lucide-react"
import { getArchiveDetail } from "@/app/actions/media"
import { markBlogPublished } from "@/app/actions/blog"
import { lifecycleMeta, type LifecycleStatus } from "@/lib/status"
import {
  TimeRangeSelect,
  useCutoff,
  withinRange,
} from "@/components/time-range-select"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/status-badge"
import { BlogVideo, stripVideoEmbed } from "@/components/blog-video"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { shortDate } from "@/lib/format"

export interface BlogRow {
  id: string
  title: string
  showName: string
  status: LifecycleStatus
  isPublished: boolean
  date: string
  imageUrl: string | null
  description: string | null
  seoKeywords: string[] | null
  wordpressPostId: string | null
  wordpressUrl: string | null
  wpAdminUrl: string | null
}

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

export function BlogsClient({
  rows,
  initialOpenId,
}: {
  rows: BlogRow[]
  initialOpenId?: string
}) {
  const [q, setQ] = React.useState("")
  const [filter, setFilter] = React.useState<string>("all")
  /** Days to look back; "all" keeps everything. */
  const [range, setRange] = React.useState<string>("all")
  const [active, setActive] = React.useState<BlogRow | null>(null)

  // Deep link from the upload page (/blogs?open=<episodeId>) opens that blog.
  React.useEffect(() => {
    if (!initialOpenId) return
    const match = rows.find((r) => r.id === initialOpenId)
    if (match) setActive(match)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpenId])

  const cutoff = useCutoff(range)

  const filtered = rows.filter((r) => {
    if (!withinRange(r.date, cutoff)) return false
    if (filter === "drafted" && r.status !== "drafted") return false
    if (filter === "published" && !r.isPublished) return false
    if (q && !`${r.title} ${r.showName}`.toLowerCase().includes(q.toLowerCase()))
      return false
    return true
  })

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search blogs…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <TimeRangeSelect
            value={range}
            onChange={setRange}
            className="md:w-44"
          />
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-full md:w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All blogs</SelectItem>
              <SelectItem value="drafted">Drafted</SelectItem>
              <SelectItem value="published">Published</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <p className="py-16 text-center text-sm text-muted-foreground">
            {rows.length === 0
              ? "No blog drafts yet — they appear here once the workflow creates a WordPress draft."
              : "No blogs match your filters."}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => (
            <button
              key={r.id}
              onClick={() => setActive(r)}
              className="card-hover group flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left"
            >
              <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-primary/15 to-accent/15">
                {r.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={r.imageUrl}
                    alt={r.title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <ImageIcon className="h-7 w-7 text-muted-foreground" />
                  </div>
                )}
                <div className="absolute right-2 top-2">
                  <StatusBadge meta={lifecycleMeta[r.status]} />
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-2 p-4">
                <p className="line-clamp-2 text-sm font-semibold text-foreground">
                  {r.title}
                </p>
                <div className="mt-auto flex items-center justify-between">
                  <Badge variant="muted">{r.showName}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {shortDate(r.date)}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <BlogDrawer row={active} onClose={() => setActive(null)} />
    </div>
  )
}

function BlogDrawer({
  row,
  onClose,
}: {
  row: BlogRow | null
  onClose: () => void
}) {
  const router = useRouter()
  const [blogHtml, setBlogHtml] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [publishing, startPublish] = React.useTransition()
  const [downloading, setDownloading] = React.useState(false)

  async function downloadDocx() {
    if (!row) return
    setDownloading(true)
    try {
      const res = await fetch(`/api/blogs/${row.id}/docx`)
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const safe =
        row.title.replace(/[^\w.\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 80) ||
        "blog"
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${safe}.docx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.success("Word file downloaded", {
        description: "The blog was exported as a .docx with images and formatting.",
      })
    } catch {
      toast.error("Download failed", {
        description: "Could not generate the Word file. Please try again.",
      })
    } finally {
      setDownloading(false)
    }
  }

  React.useEffect(() => {
    let cancelled = false
    setBlogHtml(null)
    if (!row) return
    setLoading(true)
    getArchiveDetail("episode", row.id)
      .then((d) => {
        if (!cancelled) setBlogHtml(d.blogHtml)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [row])

  function publish() {
    if (!row) return
    startPublish(async () => {
      const res = await markBlogPublished(row.id)
      if (res.ok) {
        toast.success("Marked as published", { description: res.message })
        onClose()
        router.refresh()
      } else {
        toast.error(res.message)
      }
    })
  }

  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-2xl">
        {row && (
          <>
            <SheetHeader className="border-b border-border p-5">
              <div className="flex items-center gap-2">
                <Badge variant="muted">{row.showName}</Badge>
                <StatusBadge meta={lifecycleMeta[row.status]} />
              </div>
              <SheetTitle className="font-serif text-xl">{row.title}</SheetTitle>
            </SheetHeader>

            <div className="space-y-5 p-5">
              {/* Featured image */}
              <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
                {row.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={row.imageUrl}
                    alt={row.title}
                    className="w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
              </div>

              {row.description && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm leading-relaxed text-muted-foreground">
                  {row.description}
                </div>
              )}

              {row.seoKeywords && row.seoKeywords.length > 0 && (
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5" /> SEO keywords
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {row.seoKeywords.map((k) => (
                      <Badge key={k} variant="secondary">
                        {k}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Blog body */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">
                    Blog preview
                  </p>
                  <span className="flex items-center gap-1 text-xs text-success">
                    <FileText className="h-3.5 w-3.5" /> Sanitized HTML
                  </span>
                </div>
                {loading && !blogHtml ? (
                  <div className="flex h-40 items-center justify-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : blogHtml ? (
                  <ScrollArea className="h-[360px] rounded-lg border border-border bg-card p-4">
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
                    No blog content found.
                  </p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="sticky bottom-0 space-y-2 border-t border-border bg-background/95 p-5 backdrop-blur">
              {/* Word export — for sharing the blog with reviewers offline. */}
              <Button
                variant="outline"
                className="w-full"
                disabled={downloading || loading}
                onClick={downloadDocx}
              >
                {downloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4" />
                )}
                Download as Word (.docx)
              </Button>

              {row.isPublished ? (
                <a
                  href={row.wordpressUrl ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-success/12 py-2.5 text-sm font-semibold text-success hover:bg-success/20"
                >
                  <Eye className="h-4 w-4" /> View live post
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Step 1 — open the draft in WordPress and click Publish there.
                    Step 2 — come back and mark it published here.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    {row.wpAdminUrl && (
                      <a
                        href={row.wpAdminUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card py-2.5 text-sm font-semibold text-foreground hover:bg-muted/50"
                      >
                        <FileText className="h-4 w-4" /> Publish in WordPress
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <Button
                      className="flex-1"
                      disabled={publishing}
                      onClick={publish}
                    >
                      {publishing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4" />
                      )}
                      Mark as published
                    </Button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
