"use client"

import * as React from "react"
import {
  Search,
  Info,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  Upload,
  Scale,
  FileText,
  Send,
  LifeBuoy,
  Server,
  type LucideIcon,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { StatTile } from "@/components/stat-tile"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { dateTime, timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"
import type {
  ActivityEvent,
  ActivityCategory,
  ActivityLevel,
} from "@/lib/queries"

const CATEGORY: Record<
  ActivityCategory,
  { label: string; icon: LucideIcon }
> = {
  upload: { label: "Upload", icon: Upload },
  consultation: { label: "Consultation", icon: Scale },
  content: { label: "Content", icon: FileText },
  publish: { label: "Publish", icon: Send },
  recovery: { label: "Recovery", icon: LifeBuoy },
  system: { label: "System", icon: Server },
}

const LEVEL_TONE: Record<ActivityLevel, string> = {
  info: "text-muted-foreground bg-muted",
  success: "text-success bg-success/12",
  warning: "text-warning bg-warning/12",
  error: "text-destructive bg-destructive/12",
}

const LEVEL_ICON: Record<ActivityLevel, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
}

function Row({ e }: { e: ActivityEvent }) {
  const cat = CATEGORY[e.category]
  const Icon = LEVEL_ICON[e.level]
  return (
    <div className="flex items-start gap-3 border-b border-border/60 p-4 last:border-0">
      <div
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          LEVEL_TONE[e.level]
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">
            {e.title}
          </span>
          <Badge variant="muted" className="gap-1">
            <cat.icon className="h-3 w-3" />
            {cat.label}
          </Badge>
        </div>
        {e.detail && (
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
            {e.detail}
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground" title={dateTime(e.at)}>
          {timeAgo(e.at)}
          {e.source && (
            <>
              {" · from "}
              <span className="font-medium text-foreground/80">{e.source}</span>
            </>
          )}
        </p>
      </div>
    </div>
  )
}

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

export function LogsClient({ events }: { events: ActivityEvent[] }) {
  const [q, setQ] = React.useState("")
  const [category, setCategory] = React.useState("all")
  const [level, setLevel] = React.useState("all")
  const [timeRange, setTimeRange] = React.useState("all")

  // Filter by time range first so stats and event list stay synchronized
  const timeFiltered = events.filter((e) => matchesTimeRange(e.at, timeRange))

  const filtered = timeFiltered.filter((e) => {
    if (category !== "all" && e.category !== category) return false
    if (level !== "all" && e.level !== level) return false
    if (q) {
      const hay =
        `${e.title} ${e.detail} ${e.platform ?? ""} ${e.source ?? ""}`.toLowerCase()
      if (!hay.includes(q.toLowerCase())) return false
    }
    return true
  })

  const counts = {
    published: timeFiltered.filter((e) => e.category === "publish" && e.level === "success").length,
    errors: timeFiltered.filter((e) => e.level === "error").length,
    warnings: timeFiltered.filter((e) => e.level === "warning").length,
    total: timeFiltered.length,
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
        <StatTile label="Total events" value={counts.total} tone="primary" />
        <StatTile label="Published" value={counts.published} tone="success" />
        <StatTile label="Warnings" value={counts.warnings} tone="warning" />
        <StatTile label="Errors" value={counts.errors} tone="destructive" />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2.5 sm:gap-3 p-3 sm:p-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search events…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 h-9 text-xs sm:text-sm"
            />
          </div>
          <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:gap-3 w-full md:w-auto">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-full md:w-36 h-9 text-xs">
                <SelectValue placeholder="Time range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="1h">Past 1 hour</SelectItem>
                <SelectItem value="24h">Past 24 hours</SelectItem>
                <SelectItem value="3d">Past 3 days</SelectItem>
                <SelectItem value="7d">Past 7 days</SelectItem>
                <SelectItem value="30d">Past 30 days</SelectItem>
              </SelectContent>
            </Select>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full md:w-36 h-9 text-xs">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="upload">Uploads</SelectItem>
                <SelectItem value="consultation">Consultations</SelectItem>
                <SelectItem value="content">Content</SelectItem>
                <SelectItem value="publish">Publishing</SelectItem>
                <SelectItem value="recovery">Recovery</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger className="w-full md:w-32 h-9 text-xs">
                <SelectValue placeholder="Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All levels</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <p className="py-14 text-center text-sm text-muted-foreground">
            {events.length === 0
              ? "No activity yet."
              : "No events match your filters."}
          </p>
        ) : (
          filtered.map((e) => <Row key={e.id} e={e} />)
        )}
      </Card>
    </div>
  )
}

