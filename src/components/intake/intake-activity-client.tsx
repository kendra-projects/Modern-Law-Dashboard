"use client"

import * as React from "react"
import Link from "next/link"
import {
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  CalendarCheck,
  Briefcase,
  UserCheck,
  Server,
  ScrollText,
  type LucideIcon,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { StatTile } from "@/components/stat-tile"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TimeRangeSelect, useCutoff, withinRange } from "@/components/time-range-select"
import { describeStep, stepCategory, type StepCategory, type StepDetail } from "@/lib/intake-steps"
import { dateTime, timeAgo } from "@/lib/format"
import type { IntakeStep } from "@/types/database"
import { cn } from "@/lib/utils"

// Intake Activity: every step logged for every lead, in the same shape as the
// content Activity & Logs page (stats, search + filters, one row per event).

export type ActivityStep = Pick<IntakeStep, "id" | "lead_id" | "step_key" | "state" | "detail" | "error" | "created_at">
export type ActivityLead = { id: string; name: string; matter_type: string | null }

const CATEGORY: Record<StepCategory, { label: string; icon: LucideIcon }> = {
  booking: { label: "Booking", icon: CalendarCheck },
  clio: { label: "Clio", icon: Briefcase },
  decision: { label: "Decision", icon: UserCheck },
  system: { label: "System", icon: Server },
}

type Level = "done" | "failed" | "pending"
const levelOf = (s: IntakeStep["state"]): Level => (s === "done" ? "done" : s === "failed" ? "failed" : "pending")

const LEVEL: Record<Level, { tone: string; icon: LucideIcon }> = {
  done: { tone: "text-success bg-success/12", icon: CheckCircle2 },
  failed: { tone: "text-destructive bg-destructive/12", icon: XCircle },
  pending: { tone: "text-warning bg-warning/12", icon: Clock },
}

export function IntakeActivityClient({ steps, leads }: { steps: ActivityStep[]; leads: ActivityLead[] }) {
  const [q, setQ] = React.useState("")
  const [range, setRange] = React.useState("all")
  const [category, setCategory] = React.useState("all")
  const [level, setLevel] = React.useState("all")
  const cutoff = useCutoff(range)
  const leadMap = React.useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads])

  const events = React.useMemo(
    () =>
      steps.map((s) => {
        const lead = leadMap.get(s.lead_id)
        return {
          ...s,
          title: describeStep(s),
          category: stepCategory(s.step_key),
          level: levelOf(s.state),
          leadName: lead?.name ?? "Unknown lead",
          matterType: lead?.matter_type ?? null,
          by: ((s.detail ?? {}) as StepDetail).by,
        }
      }),
    [steps, leadMap]
  )

  // Time first, so the stats describe the same window as the list.
  const inRange = events.filter((e) => withinRange(e.created_at, cutoff))
  const shown = inRange.filter((e) => {
    if (category !== "all" && e.category !== category) return false
    if (level !== "all" && e.level !== level) return false
    const needle = q.trim().toLowerCase()
    if (needle && !`${e.title} ${e.leadName} ${e.matterType ?? ""} ${e.by ?? ""}`.toLowerCase().includes(needle)) return false
    return true
  })

  const stats = {
    total: inRange.length,
    leads: new Set(inRange.map((e) => e.lead_id)).size,
    clio: inRange.filter((e) => e.category === "clio" && e.level === "done").length,
    failed: inRange.filter((e) => e.level === "failed").length,
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight text-foreground">Intake Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every step taken on every lead, by the automation or the team, newest first.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
        <StatTile label="Total events" value={stats.total} tone="primary" />
        <StatTile label="Leads" value={stats.leads} tone="foreground" />
        <StatTile label="Clio actions" value={stats.clio} tone="success" />
        <StatTile label="Failed" value={stats.failed} tone="destructive" />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2.5 p-3 sm:gap-3 sm:p-4 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search lead, event or person…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-9 pl-9 text-xs sm:text-sm"
            />
          </div>
          <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:items-center sm:gap-3 md:w-auto">
            <TimeRangeSelect value={range} onChange={setRange} className="h-9 text-xs md:w-40" />
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9 w-full text-xs md:w-36">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="booking">Booking</SelectItem>
                <SelectItem value="clio">Clio</SelectItem>
                <SelectItem value="decision">Decisions</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger className="h-9 w-full text-xs md:w-32">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="done">Done</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        {shown.length === 0 ? (
          <div className="flex flex-col items-center py-14 text-center">
            <ScrollText className="h-7 w-7 text-muted-foreground/60" />
            <p className="mt-2 text-sm text-muted-foreground">
              {events.length === 0 ? "No activity yet." : "No events match your filters."}
            </p>
          </div>
        ) : (
          shown.map((e) => {
            const cat = CATEGORY[e.category]
            const lv = LEVEL[e.level]
            return (
              <div key={e.id} className="flex items-start gap-3 border-b border-border/60 p-4 last:border-0">
                <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", lv.tone)}>
                  <lv.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{e.title}</span>
                    <Badge variant="muted" className="gap-1">
                      <cat.icon className="h-3 w-3" />
                      {cat.label}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    <Link href={`/intake/${e.lead_id}`} className="font-medium text-foreground/90 hover:text-primary hover:underline">
                      {e.leadName}
                    </Link>
                    {e.matterType ? ` · ${e.matterType}` : ""}
                  </p>
                  {e.error && <p className="mt-0.5 text-xs text-destructive">{e.error}</p>}
                  <p className="mt-1 text-xs text-muted-foreground" title={dateTime(e.created_at)}>
                    {timeAgo(e.created_at)}
                    {e.by ? ` · by ${e.by.split("@")[0]}` : " · automatic"}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </Card>
    </div>
  )
}
