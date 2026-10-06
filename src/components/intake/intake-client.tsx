"use client"

import * as React from "react"
import Link from "next/link"
import { Inbox, Plus, Search, ListFilter } from "lucide-react"
import type { IntakeLead, IntakeLeadStatus } from "@/types/database"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TimeRangeSelect, useCutoff, withinRange } from "@/components/time-range-select"
import { cn } from "@/lib/utils"
import { QueueSkeleton } from "@/components/intake/intake-skeletons"
import { FilterTransition, FilterLink, PendingArea } from "@/components/intake/filter-transition"

// status → how it reads in the queue. Kept in one place so the queue and the
// detail page can't drift on what a status means.
const STATUS_META: Record<
  IntakeLeadStatus,
  { label: string; tone: string }
> = {
  received: { label: "New", tone: "bg-secondary text-secondary-foreground" },
  enriched: { label: "New", tone: "bg-secondary text-secondary-foreground" },
  conflict_pending: { label: "Conflict check", tone: "bg-accent/15 text-accent" },
  conflict_clear: { label: "In progress", tone: "bg-primary/15 text-primary" },
  stopped: { label: "Stopped", tone: "bg-destructive/15 text-destructive" },
  matter_created: { label: "In progress", tone: "bg-primary/15 text-primary" },
  manage_finished: { label: "In progress", tone: "bg-primary/15 text-primary" },
  portal_sent: { label: "In progress", tone: "bg-primary/15 text-primary" },
  text_sent: { label: "In progress", tone: "bg-primary/15 text-primary" },
  slack_pending: { label: "Awaiting sign-off", tone: "bg-accent/15 text-accent" },
  slack_posted: { label: "In progress", tone: "bg-primary/15 text-primary" },
  tasks_set: { label: "In progress", tone: "bg-primary/15 text-primary" },
  done: { label: "Done", tone: "bg-success/15 text-success" },
  failed: { label: "Failed", tone: "bg-destructive/15 text-destructive" },
  canceled: { label: "Canceled", tone: "bg-muted text-muted-foreground line-through" },
}

// Status filter groups: what the team thinks in, not the raw pipeline states.
type Group = "all" | "new" | "progress" | "done" | "canceled" | "stopped"
const GROUPS: { key: Group; label: string }[] = [
  { key: "all", label: "All statuses" },
  { key: "new", label: "New" },
  { key: "progress", label: "In progress" },
  { key: "done", label: "Approved" },
  { key: "canceled", label: "Canceled" },
  { key: "stopped", label: "Stopped" },
]
function groupOf(s: IntakeLeadStatus): Exclude<Group, "all"> {
  if (s === "received" || s === "enriched" || s === "conflict_pending") return "new"
  if (s === "done") return "done"
  if (s === "canceled") return "canceled"
  if (s === "stopped" || s === "failed") return "stopped"
  return "progress"
}

function fullName(l: IntakeLead) {
  return [l.client_first, l.client_last].filter(Boolean).join(" ") || "Unknown lead"
}
function fmtDate(iso: string | null) {
  if (!iso) return "—"
  // The firm's clock, not the viewer's: consults are booked in Arizona time.
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function IntakeClient({ leads }: { leads: IntakeLead[] }) {
  const pending = leads.filter((l) =>
    ["conflict_pending", "slack_pending"].includes(l.status)
  ).length

  const [q, setQ] = React.useState("")
  const [range, setRange] = React.useState("all")
  const [group, setGroup] = React.useState<Group>("all")
  const cutoff = useCutoff(range)

  // Time + search first, so the status chips count what's left after them.
  const base = leads.filter((l) => {
    if (!withinRange(l.created_at, cutoff)) return false
    const needle = q.trim().toLowerCase()
    if (!needle) return true
    const hay = [fullName(l), l.email, l.phone, l.matter_type, l.consulting_attorney, l.assigned_advocate]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
    return hay.includes(needle)
  })
  const counts = base.reduce<Record<Group, number>>(
    (acc, l) => ({ ...acc, [groupOf(l.status)]: acc[groupOf(l.status)] + 1 }),
    { all: base.length, new: 0, progress: 0, done: 0, canceled: 0, stopped: 0 }
  )
  const shown = group === "all" ? base : base.filter((l) => groupOf(l.status) === group)

  // Opening a lead swaps the queue for the lead skeleton on the click itself,
  // instead of waiting for the server's first byte.
  return (
    <FilterTransition>
    <PendingArea fallback={<QueueSkeleton />}>
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-foreground">
            Consultation Intake
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            New consultation leads and their automated admin progress.
            {pending > 0 && (
              <span className="text-accent"> · {pending} awaiting you</span>
            )}
          </p>
        </div>
        <Button asChild size="sm" className="gap-1.5">
          <Link href="/intake/new">
            <Plus className="h-4 w-4" /> New lead
          </Link>
        </Button>
      </div>

      {leads.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
            <div className="relative lg:flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name, email, phone, matter, attorney…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:shrink-0">
              <TimeRangeSelect value={range} onChange={setRange} className="lg:w-44" />
              <Select value={group} onValueChange={(v) => setGroup(v as Group)}>
                <SelectTrigger className="w-full lg:w-48">
                  <ListFilter className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  {GROUPS.map((g) => (
                    <SelectItem key={g.key} value={g.key}>
                      {g.label} ({counts[g.key]})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {leads.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium text-foreground">No leads yet</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            When a consultation is booked in Acuity it posts here automatically, and
            the admin steps run in the background.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Method</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Consult</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Priority</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No leads match these filters.
                  </td>
                </tr>
              )}
              {shown.map((l) => {
                const meta = STATUS_META[l.status]
                return (
                  <tr
                    key={l.id}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                  >
                    <td className="w-full max-w-0 px-4 py-3">
                      <FilterLink href={`/intake/${l.id}`} className="block" scroll>
                        <span className="truncate font-medium text-foreground">
                          {fullName(l)}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {l.matter_type ?? l.email ?? l.phone ?? "—"}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground md:hidden">
                          {fmtDate(l.consult_datetime)}
                        </span>
                      </FilterLink>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 capitalize text-muted-foreground sm:table-cell">
                      {l.method?.replace("_", " ") ?? "—"}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-muted-foreground md:table-cell">
                      {fmtDate(l.consult_datetime)}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-muted-foreground sm:table-cell">
                      {l.priority_score != null ? `P${l.priority_score}` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                          meta.tone
                        )}
                      >
                        {meta.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
    </PendingArea>
    </FilterTransition>
  )
}
