"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { Rise, CountUp, WhenVisible } from "@/components/motion/reveal"
import {
  Inbox,
  CalendarDays,
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  Plus,
  BarChart3,
  PieChart as PieIcon,
  Filter,
  Users,
  Video,
  MapPin,
  ArrowRight,
  ChevronDown,
} from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { IntakeLead } from "@/types/database"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { KpiCard } from "@/components/overview/kpi-card"
import { useChartColors } from "@/components/charts/use-chart-colors"
import { ChartTooltip } from "@/components/charts/chart-tooltip"
import { cn } from "@/lib/utils"
import { IntakeOverviewSkeleton } from "@/components/intake/intake-skeletons"
import { FilterTransition, FilterLink, PendingArea } from "@/components/intake/filter-transition"

// The intake login's home page: the same shape as the content Overview (KPIs,
// charts, lists), built from consultation leads and the mirrored Acuity schedule.

export type OverviewAppt = {
  id: string
  datetime: string | null
  attorney: string | null
  type: string | null
  is_consult: boolean
  canceled: boolean
  client_first: string | null
  client_last: string | null
  location: string | null
  lead_id: string | null
}

const TZ = "America/Phoenix"
const DAY = 24 * 60 * 60 * 1000
const CLOSED: IntakeLead["status"][] = ["done", "stopped", "failed", "canceled"]
// The lists at the bottom show this many rows; "Show all" opens the rest.
const LIST_MAX = 5
// Attention rows are one line, so seven of them fill the same height as five
// two-line rows in the cards beside it.
const ATTENTION_MAX = 7
const RECENT_MAX = 15

const dayKey = (d: Date | string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d))
const dayLabel = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric" }).format(d)
const timeLabel = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso))
const fullName = (x: { client_first: string | null; client_last: string | null }) =>
  [x.client_first, x.client_last].filter(Boolean).join(" ") || "Unknown"
const zoomLink = (loc: string | null) => loc?.match(/https?:\/\/[^\s]*zoom\.us\/[^\s]*/i)?.[0] ?? null

type Attention = { lead: IntakeLead; reason: string; tone: string }

function ShowAll({ open, more, onClick }: { open: boolean; more: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-auto flex w-full items-center justify-center gap-1 rounded-lg px-2 pt-3 text-xs font-medium text-primary hover:underline"
    >
      {open ? "Show less" : `Show all (${more} more)`}
      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
    </button>
  )
}

function ListTitle({ children, count }: { children: React.ReactNode; count: number }) {
  return (
    <CardTitle className="text-base">
      {children}
      {count > 0 && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{count}</span>}
    </CardTitle>
  )
}

function needsAttention(l: IntakeLead): Attention | null {
  if (CLOSED.includes(l.status)) return null
  if (l.conflict_status === "pending") return { lead: l, reason: "Conflict check", tone: "bg-accent/15 text-accent" }
  if (!l.clio_matter_id) return { lead: l, reason: "Create in Clio", tone: "bg-primary/15 text-primary" }
  return { lead: l, reason: "Sign-off", tone: "bg-success/15 text-success" }
}

export function IntakeOverview({ leads, appts }: { leads: IntakeLead[]; appts: OverviewAppt[] }) {
  const c = useChartColors()
  // Theme colours, so the charts follow Light / Dark / Evening like the rest.
  const tone = {
    new: c.muted,
    clio: c.primary,
    done: c.success,
    stopped: c.destructive,
    canceled: c.accent,
  }

  const d = React.useMemo(() => {
    const now = Date.now()
    const today = dayKey(new Date())
    const live = leads.filter((l) => l.status !== "canceled")

    // Leads received per day, last 14 days (sparkline).
    const perDay = new Map<string, number>()
    for (const l of leads) perDay.set(dayKey(l.created_at), (perDay.get(dayKey(l.created_at)) ?? 0) + 1)
    const spark = Array.from({ length: 14 }, (_, i) => ({ v: perDay.get(dayKey(new Date(now - (13 - i) * DAY))) ?? 0 }))

    // Schedule: next 14 days, stacked by kind.
    const active = appts.filter((a) => a.datetime && !a.canceled)
    const upcoming = active.filter((a) => new Date(a.datetime!).getTime() >= now - 60 * 60 * 1000)
    const schedule = Array.from({ length: 14 }, (_, i) => {
      const date = new Date(now + i * DAY)
      const k = dayKey(date)
      const on = active.filter((a) => dayKey(a.datetime!) === k)
      return {
        label: i === 0 ? "Today" : dayLabel(date),
        Consults: on.filter((a) => a.is_consult).length,
        "Follow-ups": on.filter((a) => !a.is_consult && /follow[\s-]?up/i.test(a.type ?? "")).length,
        Other: on.filter((a) => !a.is_consult && !/follow[\s-]?up/i.test(a.type ?? "")).length,
      }
    })
    const week = upcoming.filter((a) => a.is_consult && new Date(a.datetime!).getTime() < now + 7 * DAY).length

    // Consults per attorney, next 14 days.
    const byAtty = new Map<string, number>()
    for (const a of upcoming) if (a.is_consult) byAtty.set(a.attorney ?? "Unassigned", (byAtty.get(a.attorney ?? "Unassigned") ?? 0) + 1)
    const attorneys = Array.from(byAtty, ([name, value]) => ({ name, value })).sort((x, y) => y.value - x.value).slice(0, 8)

    // Where every lead sits.
    // Every category is always listed (a zero shows as 0), so the legend reads
    // the same today as when leads start getting approved or stopped.
    const status = [
      { key: "new", name: "New", value: live.filter((l) => !CLOSED.includes(l.status) && !l.clio_matter_id).length, color: tone.new },
      { key: "clio", name: "In Clio", value: live.filter((l) => !CLOSED.includes(l.status) && l.clio_matter_id).length, color: tone.clio },
      { key: "done", name: "Approved", value: leads.filter((l) => l.status === "done").length, color: tone.done },
      { key: "stopped", name: "Stopped", value: leads.filter((l) => l.status === "stopped" || l.status === "failed").length, color: tone.stopped },
      { key: "canceled", name: "Canceled", value: leads.filter((l) => l.status === "canceled").length, color: tone.canceled },
    ]

    // Funnel over non-canceled leads.
    const funnel = [
      { name: "Booked", value: live.length },
      { name: "Conflict cleared", value: live.filter((l) => l.conflict_status === "clear").length },
      { name: "In Clio", value: live.filter((l) => l.clio_matter_id).length },
      { name: "Approved", value: live.filter((l) => l.status === "done").length },
    ]

    const attention = leads.map(needsAttention).filter((x): x is Attention => Boolean(x))
    const todays = active.filter((a) => a.is_consult && dayKey(a.datetime!) === today)
    // Collapsed, the list shows what's still ahead today; once the day is over,
    // the last few.
    const ahead = todays.filter((a) => new Date(a.datetime!).getTime() + 60 * 60 * 1000 >= now)
    const todayShort = ahead.length ? ahead.slice(0, LIST_MAX) : todays.slice(-LIST_MAX)
    const leadById = new Map(leads.map((l) => [l.id, l]))

    return {
      total: leads.length,
      newToday: leads.filter((l) => dayKey(l.created_at) === today).length,
      inClio: leads.filter((l) => l.clio_matter_id).length,
      done: leads.filter((l) => l.status === "done").length,
      spark,
      schedule,
      week,
      attorneys,
      status,
      funnel,
      attention,
      todays,
      todayShort,
      leadById,
      recent: leads.slice(0, RECENT_MAX),
    }
  }, [leads, appts, tone.new, tone.clio, tone.done, tone.stopped, tone.canceled])

  const SERIES = [
    { key: "Consults", id: "consults", color: c.primary },
    { key: "Follow-ups", id: "followups", color: c.accent },
    { key: "Other", id: "other", color: c.muted },
  ]
  const [open, setOpen] = React.useState({ today: false, attention: false, recent: false })
  const toggle = (k: keyof typeof open) => setOpen((o) => ({ ...o, [k]: !o[k] }))
  const todayRows = open.today ? d.todays : d.todayShort
  const attentionRows = open.attention ? d.attention : d.attention.slice(0, ATTENTION_MAX)
  const recentRows = open.recent ? d.recent : d.recent.slice(0, LIST_MAX)

  const funnelMax = Math.max(1, d.funnel[0].value)
  const statusTotal = d.status.reduce((s, x) => s + x.value, 0)

  return (
    <FilterTransition>
      <PendingArea fallback={<IntakeOverviewSkeleton />}>
        <div className="space-y-5">
          <Rise i={0} className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-serif text-2xl font-bold tracking-tight text-foreground">Intake Overview</h1>
              <p className="mt-1 text-sm text-muted-foreground">Consultations, leads and what is waiting on you.</p>
            </div>
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/intake/new">
                <Plus className="h-4 w-4" /> New lead
              </Link>
            </Button>
          </Rise>

          {/* KPI ROW */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            <Rise i={1} className="h-full">
              <KpiCard label="Total leads" value={<CountUp value={d.total} />} icon={Inbox} tone="primary" spark={d.spark} hint={`${d.newToday} today`} />
            </Rise>
            <Rise i={2} className="h-full">
              <KpiCard label="Consults" value={<CountUp value={d.week} />} icon={CalendarDays} tone="primary" hint="next 7 days" />
            </Rise>
            <Rise i={3} className="h-full">
              <KpiCard
                label="Needs you"
                value={<CountUp value={d.attention.length} />}
                icon={AlertTriangle}
                tone={d.attention.length ? "accent" : "success"}
                hint="open actions"
              />
            </Rise>
            <Rise i={4} className="h-full">
              <KpiCard label="In Clio" value={<CountUp value={d.inClio} />} icon={Briefcase} tone="primary" hint="matter linked" />
            </Rise>
            <Rise i={5} className="h-full">
              <KpiCard label="Approved" value={<CountUp value={d.done} />} icon={CheckCircle2} tone="success" hint="intake complete" />
            </Rise>
          </div>

          {/* CHARTS */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Rise i={6} className="lg:col-span-2">
              <Card className="h-full">
                <CardHeader className="flex-row items-center gap-2 space-y-0">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base">Schedule</CardTitle>
                  <span className="ml-auto text-xs text-muted-foreground">next 14 days</span>
                </CardHeader>
                <CardContent>
                  <WhenVisible height={260}>
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart data={d.schedule} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                        <defs>
                          {SERIES.map((x) => (
                            <linearGradient key={x.key} id={`grad-${x.id}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={x.color} stopOpacity={0.4} />
                              <stop offset="100%" stopColor={x.color} stopOpacity={0.02} />
                            </linearGradient>
                          ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={c.border} vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={16} />
                        <YAxis tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
                        <Tooltip content={<ChartTooltip />} cursor={{ stroke: c.border }} />
                        {SERIES.map((x) => (
                          <Area
                            key={x.key}
                            type="monotone"
                            dataKey={x.key}
                            name={x.key}
                            stroke={x.color}
                            strokeWidth={2}
                            fill={`url(#grad-${x.id})`}
                            animationDuration={1100}
                          />
                        ))}
                      </AreaChart>
                    </ResponsiveContainer>
                  </WhenVisible>
                  <div className="mt-2 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
                    {SERIES.map((x) => (
                      <span key={x.key} className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: x.color }} />
                        {x.key}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Rise>

            <Rise i={7}>
              <Card className="h-full">
                <CardHeader className="flex-row items-center gap-2 space-y-0">
                  <PieIcon className="h-4 w-4 text-accent" />
                  <CardTitle className="text-base">Lead status</CardTitle>
                </CardHeader>
                <CardContent>
                  {statusTotal === 0 ? (
                    <p className="py-16 text-center text-sm text-muted-foreground">No leads yet.</p>
                  ) : (
                    <>
                      <div className="relative">
                        <WhenVisible height={200}>
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Tooltip content={<ChartTooltip />} />
                            <Pie data={d.status.filter((x) => x.value > 0)} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={80} paddingAngle={3} stroke={c.card} strokeWidth={2} animationDuration={900}>
                              {d.status.filter((x) => x.value > 0).map((s) => (
                                <Cell key={s.key} fill={s.color} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        </WhenVisible>
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-2xl font-bold text-foreground">
                            <CountUp value={statusTotal} />
                          </span>
                          <span className="text-xs text-muted-foreground">leads</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                        {d.status.map((s) => (
                          <div key={s.key} className={cn("flex items-center gap-2 text-xs", s.value === 0 && "opacity-50")}>
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                            <span className="truncate text-muted-foreground">{s.name}</span>
                            <span className="ml-auto font-semibold text-foreground">{s.value}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </Rise>
          </div>

          {/* FUNNEL + ATTORNEYS */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Rise i={8}>
              <Card className="h-full">
                <CardHeader className="flex-row items-center gap-2 space-y-0">
                  <Filter className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base">Intake funnel</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {d.funnel.map((f, i) => {
                    const pct = Math.round((f.value / funnelMax) * 100)
                    return (
                      <div key={f.name}>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="text-muted-foreground">{f.name}</span>
                          <span className="font-semibold tabular-nums text-foreground">
                            {f.value} <span className="font-normal text-muted-foreground">· {pct}%</span>
                          </span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ background: [c.muted, c.accent, c.primary, c.success][i] }}
                            initial={{ width: 0 }}
                            whileInView={{ width: `${pct}%` }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.9, delay: 0.3 + i * 0.12, ease: "easeOut" }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            </Rise>

            <Rise i={9}>
              <Card className="h-full">
                <CardHeader className="flex-row items-center gap-2 space-y-0">
                  <Users className="h-4 w-4 text-accent" />
                  <CardTitle className="text-base">Consults by attorney</CardTitle>
                  <span className="ml-auto text-xs text-muted-foreground">next 14 days</span>
                </CardHeader>
                <CardContent>
                  {d.attorneys.length === 0 ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">No upcoming consults.</p>
                  ) : (
                    <WhenVisible height={Math.max(140, d.attorneys.length * 34)}>
                    <ResponsiveContainer width="100%" height={Math.max(140, d.attorneys.length * 34)}>
                      <BarChart data={d.attorneys} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                        <XAxis type="number" hide allowDecimals={false} />
                        <YAxis type="category" dataKey="name" width={120} tick={{ fill: c.muted, fontSize: 11 }} tickLine={false} axisLine={false} />
                        <Tooltip content={<ChartTooltip />} cursor={{ fill: c.border, opacity: 0.3 }} />
                        <Bar dataKey="value" name="Consults" fill={c.primary} radius={[0, 4, 4, 0]} barSize={16} animationDuration={900} />
                      </BarChart>
                    </ResponsiveContainer>
                    </WhenVisible>
                  )}
                </CardContent>
              </Card>
            </Rise>
          </div>

          {/* TODAY + ATTENTION + RECENT */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Rise i={10} className="h-full">
              <Card className="flex h-full flex-col">
                <CardHeader className="flex-row items-center gap-2 space-y-0">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  <ListTitle count={d.todays.length}>Today&apos;s consults</ListTitle>
                  <Link href="/intake/appointments" className="ml-auto text-xs text-primary hover:underline">
                    Schedule
                  </Link>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  {d.todays.length === 0 ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">No consults today.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {todayRows.map((a) => {
                        const lead = a.lead_id ? d.leadById.get(a.lead_id) : undefined
                        const zoom = zoomLink(a.location)
                        const ended = new Date(a.datetime!).getTime() + 60 * 60 * 1000 < Date.now()
                        return (
                          <li key={a.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/40">
                            <span className="w-16 shrink-0 text-xs font-medium tabular-nums text-foreground">{timeLabel(a.datetime!)}</span>
                            <span className="min-w-0 flex-1">
                              {lead ? (
                                <FilterLink scroll href={`/intake/${lead.id}`} className="block truncate text-sm text-foreground hover:underline">
                                  {fullName(a)}
                                </FilterLink>
                              ) : (
                                <span className="block truncate text-sm text-foreground">{fullName(a)}</span>
                              )}
                              <span className="block truncate text-xs text-muted-foreground">
                                {a.attorney ?? "No attorney"}
                                {lead?.clio_matter_id ? " · In Clio" : ""}
                              </span>
                            </span>
                            {zoom && !ended ? (
                              <a href={zoom} target="_blank" rel="noreferrer" className="shrink-0 text-primary" title="Join Zoom">
                                <Video className="h-4 w-4" />
                              </a>
                            ) : !zoom ? (
                              <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                            ) : null}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  {d.todays.length > d.todayShort.length && (
                    <ShowAll open={open.today} more={d.todays.length - d.todayShort.length} onClick={() => toggle("today")} />
                  )}
                </CardContent>
              </Card>
            </Rise>

            <Rise i={11} className="h-full">
              <Card className="flex h-full flex-col">
                <CardHeader className="flex-row items-center gap-2 space-y-0">
                  <AlertTriangle className="h-4 w-4 text-accent" />
                  <ListTitle count={d.attention.length}>Needs your attention</ListTitle>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  {d.attention.length === 0 ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">Nothing waiting on you right now.</p>
                  ) : (
                    <ul className="space-y-1">
                      {attentionRows.map(({ lead, reason, tone }) => (
                        <li key={lead.id}>
                          <FilterLink
                            scroll
                            href={`/intake/${lead.id}`}
                            className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50"
                          >
                            <span className="min-w-0 truncate text-sm text-foreground">{fullName(lead)}</span>
                            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", tone)}>{reason}</span>
                          </FilterLink>
                        </li>
                      ))}
                    </ul>
                  )}
                  {d.attention.length > ATTENTION_MAX && (
                    <ShowAll open={open.attention} more={d.attention.length - ATTENTION_MAX} onClick={() => toggle("attention")} />
                  )}
                </CardContent>
              </Card>
            </Rise>

            <Rise i={12} className="h-full">
              <Card className="flex h-full flex-col">
                <CardHeader className="flex-row items-center gap-2 space-y-0">
                  <Inbox className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base">Recent leads</CardTitle>
                  <Link href="/intake" className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline">
                    View all <ArrowRight className="h-3 w-3" />
                  </Link>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  {d.recent.length === 0 ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">No leads yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {recentRows.map((l) => (
                        <li key={l.id}>
                          <FilterLink
                            scroll
                            href={`/intake/${l.id}`}
                            className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm text-foreground">{fullName(l)}</span>
                              <span className="block truncate text-xs text-muted-foreground">{l.matter_type ?? l.consulting_attorney ?? ""}</span>
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">{dayLabel(new Date(l.created_at))}</span>
                          </FilterLink>
                        </li>
                      ))}
                    </ul>
                  )}
                  {d.recent.length > LIST_MAX && (
                    <ShowAll open={open.recent} more={d.recent.length - LIST_MAX} onClick={() => toggle("recent")} />
                  )}
                </CardContent>
              </Card>
            </Rise>
          </div>
        </div>
      </PendingArea>
    </FilterTransition>
  )
}
