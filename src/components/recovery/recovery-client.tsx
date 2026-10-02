"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Search,
  RotateCw,
  Loader2,
  Check,
  ExternalLink,
  Camera,
  Share2,
  Video,
  Globe,
  FileText,
  Wrench,
  ChevronDown,
  type LucideIcon,
} from "lucide-react"
import { forceRetryJob, resolveJob } from "@/app/actions/recovery"
import {
  TimeRangeSelect,
  useCutoff,
  withinRange,
} from "@/components/time-range-select"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover"
import { StatusBadge } from "@/components/status-badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { retryStatusMeta } from "@/lib/status"
import { dateTime, timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { RetryQueueJob } from "@/types/database"

type Job = RetryQueueJob & {
  show_name?: string | null
  episode_title?: string | null
}

const PLATFORM: Record<string, { label: string; icon: LucideIcon }> = {
  instagram: { label: "Instagram", icon: Camera },
  facebook: { label: "Facebook", icon: Share2 },
  youtube: { label: "YouTube", icon: Video },
  wordpress: { label: "WordPress", icon: Globe },
  blog: { label: "Blog", icon: FileText },
  prepare: { label: "Prepare", icon: Wrench },
}

function platformMeta(p: string) {
  return PLATFORM[p] ?? { label: p, icon: FileText }
}

function JobRow({ job }: { job: Job }) {
  const router = useRouter()
  const [pending, start] = React.useTransition()
  const meta = platformMeta(job.platform)
  const Icon = meta.icon
  const done = job.status === "resolved"
  const payloadObj =
    typeof job.payload === "object" && job.payload !== null
      ? (job.payload as Record<string, unknown>)
      : {}
  const manualAttempts =
    typeof payloadObj.manual_attempts === "number"
      ? payloadObj.manual_attempts
      : 0
  const autoAttempts = Math.min(job.attempts, job.max_attempts)
  const totalRetries = autoAttempts + manualAttempts

  // Once all auto attempts are used up the job is no longer "retrying" — it needs
  // attention (a permanent failure), even if the stored status wasn't flipped.
  const exhausted = !done && autoAttempts >= job.max_attempts
  const effectiveStatus = exhausted ? "needs_attention" : job.status
  const nextRetryFuture =
    new Date(job.next_retry_at).getTime() > Date.now()

  function run(fn: (id: string) => Promise<{ ok: boolean; message: string }>) {
    start(async () => {
      const res = await fn(job.id)
      if (res.ok) toast.success("Done", { description: res.message })
      else toast.error(res.message)
      router.refresh()
    })
  }

  const tone = done
    ? "text-success bg-success/12"
    : exhausted
      ? "text-destructive bg-destructive/12"
      : job.status === "retrying"
        ? "text-warning bg-warning/12"
        : "text-destructive bg-destructive/12"

  return (
    <div className="group border-b border-border/60 last:border-0 hover:bg-muted/10 transition-colors">
      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          {/* Main Info Area */}
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div
              className={cn(
                "mt-0.5 flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg",
                tone
              )}
            >
              <Icon className="h-4 w-4" />
            </div>

            <div className="min-w-0 flex-1">
              {/* Badges line: wrapped cleanly */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {meta.label}
                </span>

                {job.show_name && (
                  <Badge variant={/modern/i.test(job.show_name) ? "secondary" : "accent"}>
                    {job.show_name}
                  </Badge>
                )}

                <StatusBadge
                  meta={retryStatusMeta[effectiveStatus]}
                  withDot={false}
                />

                {/* Clean, interactive Retries popover */}
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-all focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer select-none",
                        exhausted
                          ? "border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20"
                          : manualAttempts > 0
                            ? "border border-accent/30 bg-accent/15 text-accent hover:bg-accent/25"
                            : "border border-border/60 bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                      title="Click to view retry breakdown"
                    >
                      <RotateCw className="h-2.5 w-2.5 opacity-70" />
                      <span>
                        {totalRetries} {totalRetries === 1 ? "retry" : "retries"}
                      </span>
                      <ChevronDown className="h-2.5 w-2.5 opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-64 p-3 shadow-xl">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                        <span className="font-semibold text-xs text-foreground">
                          Retry Breakdown
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-mono">
                          Auto {autoAttempts}/{job.max_attempts}
                        </Badge>
                      </div>

                      <div className="space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                            Auto Attempts
                          </span>
                          <span className="font-mono font-medium text-foreground">
                            {autoAttempts} / {job.max_attempts}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                            Manual Retries
                          </span>
                          <span className="font-mono font-medium text-foreground">
                            {manualAttempts}
                          </span>
                        </div>
                      </div>

                      <div className="border-t border-border/40 pt-1.5 text-[11px] leading-snug">
                        {exhausted ? (
                          <span className="text-destructive font-medium">
                            Max auto attempts reached ({job.max_attempts}/{job.max_attempts}). Use &quot;Retry now&quot; to run manually.
                          </span>
                        ) : !done ? (
                          <span className="text-muted-foreground">
                            Auto-scheduler will retry or click &quot;Retry now&quot;.
                          </span>
                        ) : (
                          <span className="text-success font-medium">
                            Resolved successfully.
                          </span>
                        )}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>

                {job.resolved_by && (
                  <Badge variant="success">
                    {job.resolved_by === "auto"
                      ? "solved automatically"
                      : "solved manually"}
                  </Badge>
                )}
              </div>

              {/* Title: full width, readable on both mobile & desktop */}
              {job.episode_title && (
                <p className="mt-2 text-sm font-medium text-foreground leading-snug break-words sm:line-clamp-2">
                  {job.episode_title}
                </p>
              )}

              {/* Error message */}
              {job.last_error && (
                <p className="mt-1 line-clamp-2 text-xs sm:text-sm text-muted-foreground break-words">
                  {job.last_error}
                </p>
              )}

              {/* Timestamps & Result link */}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span title={dateTime(job.updated_at)}>
                  updated {timeAgo(job.updated_at)}
                </span>
                {exhausted ? (
                  <span className="text-destructive font-medium">
                    all {job.max_attempts} auto attempts used — needs attention
                  </span>
                ) : !done ? (
                  <span title={dateTime(job.next_retry_at)}>
                    {nextRetryFuture
                      ? `next retry ${timeAgo(job.next_retry_at)}`
                      : "due now"}
                  </span>
                ) : null}
                {job.output_url && (
                  <a
                    href={job.output_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 text-primary hover:underline"
                  >
                    view result <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons:
              - Mobile: full width row at bottom of card with comfortable touch buttons
              - Desktop: right aligned, vertically centered
          */}
          {!done && (
            <div className="flex w-full sm:w-auto shrink-0 items-center justify-end gap-2 pt-2 border-t border-border/40 sm:border-0 sm:pt-0 sm:self-center">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 sm:flex-initial h-8 text-xs"
                disabled={pending}
                onClick={() => run(forceRetryJob)}
              >
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCw className="h-3.5 w-3.5" />
                )}
                Retry now
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 sm:flex-initial h-8 text-xs"
                disabled={pending}
                onClick={() => run(resolveJob)}
              >
                <Check className="h-3.5 w-3.5" />
                Resolve
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function RecoveryClient({ jobs }: { jobs: Job[] }) {
  const [q, setQ] = React.useState("")
  const [platform, setPlatform] = React.useState("all")
  const [status, setStatus] = React.useState("all")
  /** Days to look back; "all" keeps everything. */
  const [range, setRange] = React.useState("all")

  // A row whose attempts are all used up reads as "needs attention" even if its
  // stored status is still "retrying".
  const effStatus = (j: RetryQueueJob) =>
    j.status !== "resolved" && j.attempts >= j.max_attempts
      ? "needs_attention"
      : j.status

  const cutoff = useCutoff(range)

  const filtered = jobs.filter((j) => {
    if (!withinRange(j.created_at, cutoff)) return false
    if (platform !== "all" && j.platform !== platform) return false
    if (status !== "all" && effStatus(j) !== status) return false
    if (q) {
      const hay =
        `${j.platform} ${j.show_name ?? ""} ${j.episode_title ?? ""} ${j.last_error ?? ""}`.toLowerCase()
      if (!hay.includes(q.toLowerCase())) return false
    }
    return true
  })

  const counts = {
    failed: jobs.filter((j) => effStatus(j) === "failed").length,
    retrying: jobs.filter((j) => effStatus(j) === "retrying").length,
    needs: jobs.filter((j) => effStatus(j) === "needs_attention").length,
    resolved: jobs.filter((j) => j.status === "resolved").length,
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
        <Stat label="Failed" value={counts.failed} tone="destructive" />
        <Stat label="Retrying" value={counts.retrying} tone="warning" />
        <Stat label="Needs attention" value={counts.needs} tone="destructive" />
        <Stat label="Resolved" value={counts.resolved} tone="success" />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2.5 sm:gap-3 p-3 sm:p-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search platform or error…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9 h-9 text-xs sm:text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3 w-full md:w-auto">
            <TimeRangeSelect
              value={range}
              onChange={setRange}
              className="md:w-40 h-9 text-xs"
            />
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger className="w-full md:w-40 h-9 text-xs">
                <SelectValue placeholder="Platform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All platforms</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="youtube">YouTube</SelectItem>
                <SelectItem value="wordpress">WordPress</SelectItem>
                <SelectItem value="gbp">Google Business Profile</SelectItem>
                <SelectItem value="clio_intake">Clio — intake</SelectItem>
                <SelectItem value="clio_summary">Clio — summary</SelectItem>
                <SelectItem value="clio_transcript">Clio — transcript</SelectItem>
                <SelectItem value="clio_note">Clio — note</SelectItem>
                <SelectItem value="clio_filed">Clio — filing record</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full md:w-44 h-9 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="retrying">Retrying</SelectItem>
                <SelectItem value="needs_attention">Needs attention</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <p className="py-14 text-center text-sm text-muted-foreground">
            {jobs.length === 0
              ? "Nothing in the recovery queue — every job has succeeded."
              : "No jobs match your filters."}
          </p>
        ) : (
          filtered.map((job) => <JobRow key={job.id} job={job} />)
        )}
      </Card>
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: "destructive" | "warning" | "success"
}) {
  const map = {
    destructive: "text-destructive",
    warning: "text-warning",
    success: "text-success",
  }
  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={cn("mt-1 font-serif text-xl sm:text-2xl font-bold", map[tone])}>
          {value}
        </p>
      </CardContent>
    </Card>
  )
}
