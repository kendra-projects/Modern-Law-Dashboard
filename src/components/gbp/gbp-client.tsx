"use client"

import * as React from "react"
import { toast } from "sonner"
import {
  MapPin,
  Search,
  Sparkles,
  Bot,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  Building2,
  Calendar,
  Clock,
  FileText,
} from "lucide-react"
import type { GbpPostRow } from "@/lib/queries"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { StatTile } from "@/components/stat-tile"
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
import { shortDate } from "@/lib/format"

// No per-city colour. Eight fixed hues (blue/purple/emerald/amber/cyan/rose/
// indigo/teal) were decorative only — the city name already identifies the
// location — and being raw Tailwind values they never responded to the theme,
// which is what made this page look like it came from a different product.
// One brand-token treatment instead, so it follows Light/Dark/Evening.
export const ARIZONA_LOCATIONS: Record<string, { name: string; city: string }> = {
  phoenix: { name: "Phoenix, AZ", city: "Phoenix" },
  scottsdale: { name: "Scottsdale, AZ", city: "Scottsdale" },
  mesa: { name: "Mesa, AZ", city: "Mesa" },
  tucson: { name: "Tucson, AZ", city: "Tucson" },
  peoria: { name: "Peoria, AZ", city: "Peoria" },
  yuma: { name: "Yuma, AZ", city: "Yuma" },
  arizona: { name: "Arizona Statewide", city: "Statewide" },
  mesa_mdn: { name: "Mesa (MDN)", city: "Mesa MDN" },
}

const TIME_RANGES = [
  { value: "all", label: "All time" },
  { value: "1h", label: "Past 1 hour" },
  { value: "24h", label: "Past 24 hours" },
  { value: "3d", label: "Past 3 days" },
  { value: "7d", label: "Past 7 days" },
  { value: "30d", label: "Past 30 days" },
]

function matchesTimeRange(at: string, range: string): boolean {
  if (range === "all") return true
  const eventTime = new Date(at).getTime()
  if (Number.isNaN(eventTime)) return true
  const now = Date.now()
  const diffMs = now - eventTime

  switch (range) {
    case "1h":
      return diffMs <= 1 * 60 * 60 * 1000
    case "24h":
      return diffMs <= 24 * 60 * 60 * 1000
    case "3d":
      return diffMs <= 3 * 24 * 60 * 60 * 1000
    case "7d":
      return diffMs <= 7 * 24 * 60 * 60 * 1000
    case "30d":
      return diffMs <= 30 * 24 * 60 * 60 * 1000
    default:
      return true
  }
}

interface BlogCampaign {
  title: string
  url: string | null
  imageUrl: string | null
  latestDate: string
  aiModel: string
  posts: GbpPostRow[]
}

interface GbpClientProps {
  initialPosts: GbpPostRow[]
}

export function GbpClient({ initialPosts }: GbpClientProps) {
  const [posts] = React.useState<GbpPostRow[]>(initialPosts)
  const [searchQuery, setSearchQuery] = React.useState<string>("")
  const [selectedModel, setSelectedModel] = React.useState<string>("all")
  const [timeRange, setTimeRange] = React.useState<string>("all")
  const [selectedCampaign, setSelectedCampaign] = React.useState<BlogCampaign | null>(null)
  const [copiedId, setCopiedId] = React.useState<string | null>(null)
  const [copiedAllTitle, setCopiedAllTitle] = React.useState<string | null>(null)

  // Group posts by blog title
  const blogCampaigns = React.useMemo(() => {
    const groups: Record<string, BlogCampaign> = {}

    for (const post of posts) {
      const key = post.blog_title || "Untitled Blog"
      const meta = (post.metadata || {}) as Record<string, unknown>
      const rawImg =
        meta.image_url ||
        meta.featured_image ||
        (post as Record<string, unknown>).image_url ||
        null
      const imgUrl = typeof rawImg === "string" && rawImg.trim().length > 0 ? rawImg.trim() : null

      if (!groups[key]) {
        groups[key] = {
          title: key,
          url: post.blog_url || null,
          imageUrl: imgUrl,
          latestDate: post.post_date || post.created_at,
          aiModel: post.ai_model,
          posts: [],
        }
      } else {
        if (!groups[key].imageUrl && imgUrl) {
          groups[key].imageUrl = imgUrl
        }
        if (!groups[key].url && post.blog_url) {
          groups[key].url = post.blog_url
        }
      }
      groups[key].posts.push(post)
      // Keep most recent date
      if (new Date(post.created_at) > new Date(groups[key].latestDate)) {
        groups[key].latestDate = post.created_at
        groups[key].aiModel = post.ai_model
      }
    }

    return Object.values(groups).sort(
      (a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime()
    )
  }, [posts])

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    toast.success("Copied post text to clipboard")
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleCopyAll = (campaign: BlogCampaign) => {
    const formatted = campaign.posts
      .map((p) => `--- ${p.location_name} ---\n${p.content}\n`)
      .join("\n")
    navigator.clipboard.writeText(formatted)
    setCopiedAllTitle(campaign.title)
    toast.success(`Copied all ${campaign.posts.length} localized posts`)
    setTimeout(() => setCopiedAllTitle(null), 2000)
  }

  // Filter campaigns by time range, search, and AI model
  const filteredCampaigns = React.useMemo(() => {
    return blogCampaigns.filter((campaign) => {
      // Time range filter
      if (!matchesTimeRange(campaign.latestDate, timeRange)) {
        return false
      }

      // AI Model filter
      if (selectedModel !== "all") {
        if (selectedModel === "gemini" && !campaign.aiModel.toLowerCase().includes("gemini")) {
          return false
        }
        if (selectedModel === "gpt" && !campaign.aiModel.toLowerCase().includes("gpt")) {
          return false
        }
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchTitle = campaign.title.toLowerCase().includes(q)
        const matchPosts = campaign.posts.some(
          (p) =>
            p.content.toLowerCase().includes(q) ||
            p.location_name.toLowerCase().includes(q) ||
            p.location_key.toLowerCase().includes(q)
        )
        if (!matchTitle && !matchPosts) {
          return false
        }
      }

      return true
    })
  }, [blogCampaigns, timeRange, selectedModel, searchQuery])

  // Aggregate Metrics
  const totalCampaigns = filteredCampaigns.length
  const totalPostsCount = filteredCampaigns.reduce((sum, c) => sum + c.posts.length, 0)
  const geminiCampaigns = filteredCampaigns.filter((c) =>
    c.aiModel.toLowerCase().includes("gemini")
  ).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Same heading treatment as every other page: serif, no icon, no
            decorative badge. The icon + "Live Pipeline" pill here were unique
            to this page and were a big part of why it looked bolted on. */}
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-foreground">
            Google Business Profile Posts
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Click any blog card to view all 8 localized Arizona office updates
            generated for it.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.reload()}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Same four-up stat row as Activity & Logs — shared StatTile, so the
          pages can never drift apart again. */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
        <StatTile label="Blog Campaigns" value={totalCampaigns} tone="primary" />
        <StatTile
          label="Local Posts Published"
          value={totalPostsCount}
          tone="success"
        />
        <StatTile label="Locations" value="8 Offices" tone="accent" />
        <StatTile
          label="Gemini 3.5 Flash"
          value={totalCampaigns > 0 ? `${geminiCampaigns} / ${totalCampaigns}` : "100%"}
          tone="primary"
        />
      </div>

      {/* Filter Bar: Search + Time Range + Model */}
      <Card className="border-border/60 bg-card/50">
        <CardContent className="p-3 sm:p-4 flex flex-col md:flex-row items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by blog title, location, or post content…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-background/60 border-border/60 text-xs sm:text-sm h-9"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            {/* Time Range Selector */}
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[145px] h-9 text-xs sm:text-sm bg-background/60 border-border/60 gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue placeholder="Time range" />
              </SelectTrigger>
              <SelectContent>
                {TIME_RANGES.map((r) => (
                  <SelectItem key={r.value} value={r.value} className="text-xs sm:text-sm">
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* AI Model Toggle */}
            <div className="flex items-center bg-muted/40 p-1 rounded-lg border border-border/60 text-xs">
              <button
                onClick={() => setSelectedModel("all")}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  selectedModel === "all" ? "bg-background shadow-xs text-foreground font-medium" : "text-muted-foreground"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setSelectedModel("gemini")}
                className={`px-2.5 py-1 rounded-md flex items-center gap-1 transition-colors ${
                  selectedModel === "gemini" ? "bg-background shadow-xs text-foreground font-medium" : "text-muted-foreground"
                }`}
              >
                <Sparkles className="h-3 w-3" />
                Gemini
              </button>
              <button
                onClick={() => setSelectedModel("gpt")}
                className={`px-2.5 py-1 rounded-md flex items-center gap-1 transition-colors ${
                  selectedModel === "gpt" ? "bg-background shadow-xs text-foreground font-medium" : "text-muted-foreground"
                }`}
              >
                <Bot className="h-3 w-3" />
                GPT
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grid of Blog Cards — Matches the clean aesthetic of the Blogs page */}
      {filteredCampaigns.length === 0 ? (
        <Card className="bg-card/30 border-dashed border-border/80 p-8 text-center">
          <div className="max-w-md mx-auto space-y-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center">
              <FileText className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold text-foreground">No Blog Posts Found</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {posts.length === 0
                ? "Once a blog post is published on WordPress, the modernized Gemini pipeline will automatically generate 8 localized versions and group them here."
                : "No blog posts match your selected time range or search filter."}
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredCampaigns.map((campaign) => {
            const isGemini = campaign.aiModel.toLowerCase().includes("gemini")

            return (
              <div
                key={campaign.title}
                onClick={() => setSelectedCampaign(campaign)}
                className="card-hover group flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left cursor-pointer transition-all hover:border-primary/40 hover:shadow-lg"
              >
                {/* Visual Thumbnail Banner */}
                <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-primary/15 via-background to-accent/20 flex items-center justify-center">
                  {campaign.imageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={campaign.imageUrl}
                      alt={campaign.title}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-muted-foreground/60 gap-1.5 transition-transform duration-300 group-hover:scale-105">
                      <MapPin className="h-8 w-8 text-primary/70" />
                      <span className="text-[11px] font-medium tracking-wide uppercase text-muted-foreground/80">
                        GBP Local Post Campaign
                      </span>
                    </div>
                  )}

                  {/* Overlaid Badges */}
                  <div className="absolute left-2.5 top-2.5">
                    <Badge
                      variant="outline"
                      className="bg-background/80 backdrop-blur-md border-border/80 text-foreground text-[11px] gap-1 shadow-xs"
                    >
                      <Building2 className="h-3 w-3 text-primary" />
                      {campaign.posts.length} Locations
                    </Badge>
                  </div>

                  <div className="absolute right-2.5 top-2.5">
                    {/* Same opaque chip as the Locations badge beside it. The
                        old `bg-emerald-500/20` + light-green text washed out to
                        nearly invisible over a bright thumbnail, and hardcoded
                        emerald-400 also read poorly on Executive Light — the
                        `success` token stays legible in all three themes. */}
                    <Badge
                      variant="outline"
                      className="bg-background/80 text-success border-success/40 backdrop-blur-md text-[11px] gap-1 shadow-xs"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                      Published
                    </Badge>
                  </div>
                </div>

                {/* Card Body */}
                <div className="flex flex-1 flex-col gap-2.5 p-4">
                  <h3 className="line-clamp-2 text-sm sm:text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                    {campaign.title}
                  </h3>

                  {/* Location Pills Preview */}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                    {campaign.posts.slice(0, 3).map((p) => (
                      <span
                        key={p.id}
                        className="text-[11px] bg-muted/60 px-2 py-0.5 rounded text-muted-foreground border border-border/40"
                      >
                        {p.location_name.split(",")[0]}
                      </span>
                    ))}
                    {campaign.posts.length > 3 && (
                      <span className="text-[11px] text-muted-foreground font-medium">
                        +{campaign.posts.length - 3} more
                      </span>
                    )}
                  </div>

                  {/* Card Footer */}
                  <div className="mt-auto pt-3 flex items-center justify-between border-t border-border/50 text-xs">
                    {isGemini ? (
                      <Badge
                        variant="accent"
                        className="text-[11px] gap-1"
                      >
                        <Sparkles className="h-3 w-3" />
                        Gemini 3.5 Flash
                      </Badge>
                    ) : (
                      <Badge
                        variant="default"
                        className="text-[11px] gap-1"
                      >
                        <Bot className="h-3 w-3" />
                        GPT-4o Fallback
                      </Badge>
                    )}

                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-muted-foreground/80" />
                      {shortDate(campaign.latestDate)}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Drawer: Opens when a blog card is clicked (Same pattern as Blogs page) */}
      <Sheet open={!!selectedCampaign} onOpenChange={(open) => !open && setSelectedCampaign(null)}>
        <SheetContent className="w-full overflow-y-auto p-0 sm:max-w-2xl bg-card border-l border-border">
          {selectedCampaign && (
            <div>
              {/* Drawer Header */}
              <SheetHeader className="border-b border-border p-5 space-y-3 sticky top-0 bg-card/95 backdrop-blur-md z-10">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="default" className="text-xs gap-1">
                    <Building2 className="h-3 w-3" />
                    {selectedCampaign.posts.length} Arizona Locations
                  </Badge>

                  {selectedCampaign.aiModel.toLowerCase().includes("gemini") ? (
                    <Badge variant="accent" className="text-xs gap-1">
                      <Sparkles className="h-3 w-3" />
                      Gemini 3.5 Flash
                    </Badge>
                  ) : (
                    <Badge variant="default" className="text-xs gap-1">
                      <Bot className="h-3 w-3" />
                      GPT-4o Fallback
                    </Badge>
                  )}

                  <Badge variant="success" className="text-xs">
                    Published
                  </Badge>
                </div>

                <SheetTitle className="font-serif text-xl sm:text-2xl text-foreground leading-snug">
                  {selectedCampaign.title}
                </SheetTitle>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground/80" />
                      {shortDate(selectedCampaign.latestDate)}
                    </span>

                    {selectedCampaign.url && (
                      <>
                        <span>•</span>
                        <a
                          href={selectedCampaign.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                        >
                          <span>Read Original Blog</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </>
                    )}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyAll(selectedCampaign)}
                    className="h-8 text-xs gap-1.5 self-start sm:self-auto"
                  >
                    {copiedAllTitle === selectedCampaign.title ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-success" />
                        <span className="text-success font-medium">Copied All 8 Posts</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy All 8 Posts</span>
                      </>
                    )}
                  </Button>
                </div>
              </SheetHeader>

              {/* Drawer Body: 8 Localized City Cards */}
              <div className="p-5 space-y-4">
                {selectedCampaign.imageUrl && (
                  <div className="overflow-hidden rounded-xl border border-border bg-muted/30 aspect-video relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selectedCampaign.imageUrl}
                      alt={selectedCampaign.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Localized Updates for Google Business Profile:</span>
                  <span>Showing {selectedCampaign.posts.length} of 8 Offices</span>
                </div>

                <div className="space-y-3.5">
                  {selectedCampaign.posts.map((post) => {
                    const locMeta = ARIZONA_LOCATIONS[post.location_key] || {
                      name: post.location_name,
                    }
                    const charCount = post.character_count || post.content.length

                    return (
                      <div
                        key={post.id}
                        className="p-4 rounded-xl bg-muted/20 border border-border/80 flex flex-col space-y-3 hover:border-border transition-all"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                          >
                            <MapPin className="h-3 w-3" />
                            {locMeta.name}
                          </span>

                          <span className="text-[11px] text-muted-foreground">
                            {charCount} / 1400 chars
                          </span>
                        </div>

                        <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed font-sans select-text whitespace-pre-line bg-background/60 p-3 rounded-lg border border-border/50">
                          {post.content}
                        </p>

                        <div className="flex items-center justify-between pt-1 border-t border-border/40 text-xs">
                          <span className="text-[11px] text-muted-foreground">
                            Status: <span className="text-success font-medium">Published</span>
                          </span>

                          <div className="flex items-center gap-1">
                            {/* Link straight to THIS location's live Google post.
                                Older posts (before the scenario saved searchUrl)
                                have no URL yet, so the link simply stays hidden
                                for them — the blog itself is linked up top. */}
                            {post.post_url?.trim() && (
                              <a
                                href={post.post_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                <span>View post</span>
                              </a>
                            )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopy(post.id, post.content)}
                            className="h-7 px-2.5 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                          >
                            {copiedId === post.id ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-success" />
                                <span className="text-success">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
                                <span>Copy Text</span>
                              </>
                            )}
                          </Button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
