import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  ChartCardSkeleton,
  ChartHeaderSkeleton,
  DonutSkeleton,
  EventListSkeleton,
  FilterBarSkeleton,
  KpiRowSkeleton,
  PageTitleSkeleton,
  StatTilesSkeleton,
} from "@/components/shell/page-skeletons"
import { cn } from "@/lib/utils"

// Loading placeholders for the intake pages. Each one mirrors the real page's
// layout (same cards, same row heights) so the content doesn't jump when it
// arrives. Built on the shared shimmer <Skeleton> and the page-skeletons pieces.

/** A table card: header cells, then rows with a two-line first column. */
function TableSkeleton({ cols, rows }: { cols: string[]; rows: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-4 border-b border-border px-4 py-3">
        {cols.map((w, i) => (
          <Skeleton key={i} className={cn("h-3", w, i === 0 ? "flex-1" : "hidden sm:block")} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-border/60 px-4 py-3 last:border-0">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className={cn("h-4 max-w-full", r % 2 ? "w-36" : "w-48")} />
            <Skeleton className="h-3 w-28" />
          </div>
          {cols.slice(1).map((w, i) => (
            <Skeleton key={i} className={cn(i === cols.length - 2 ? "h-5 rounded-full" : "hidden h-4 sm:block", w)} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Intake Overview: title + New lead, KPIs, schedule + status, funnel + attorneys, three lists. */
export function IntakeOverviewSkeleton() {
  return (
    <div className="space-y-5">
      <PageTitleSkeleton action actionWidth="w-28" />
      <KpiRowSkeleton sparks={[0]} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCardSkeleton className="lg:col-span-2" titleWidth="w-24" legend={3} />
        <Card className="h-full">
          <ChartHeaderSkeleton titleWidth="w-28" />
          <CardContent>
            <DonutSkeleton size={160} legend={6} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[0, 1].map((c) => (
          <Card key={c} className="h-full">
            <ChartHeaderSkeleton titleWidth={c ? "w-44" : "w-32"} />
            <CardContent className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex justify-between">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-3 w-8" />
                  </div>
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {["w-36", "w-44", "w-28"].map((w, c) => (
          <Card key={c} className="flex h-full flex-col">
            <CardHeader className="flex-row items-center gap-2 space-y-0">
              <Skeleton className={cn("h-5", w)} />
              <Skeleton className="h-5 w-7 rounded-full" />
            </CardHeader>
            <CardContent className="space-y-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-2 py-1.5">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

/** Consultation Intake queue: title + New lead, search and filters, then the lead table. */
export function QueueSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-5">
      <PageTitleSkeleton action actionWidth="w-28" />
      <FilterBarSkeleton selects={2} widths={["lg:w-44", "lg:w-48"]} />
      <TableSkeleton cols={["w-16", "w-14", "w-16", "w-14", "w-20"]} rows={rows} />
    </div>
  )
}

/**
 * One lead: back link, name + facts + progress, the steps workspace (list on
 * the left, the open step on the right), then the activity card.
 */
export function LeadDetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-28" />
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-64" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {["w-32", "w-12", "w-20", "w-24", "w-24", "w-36"].map((w, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Skeleton className="h-4 w-4" />
                  <Skeleton className={cn("h-4", w)} />
                </div>
              ))}
            </div>
          </div>
          <div className="w-full sm:w-56">
            <div className="mb-2 flex justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="flex gap-1 overflow-hidden border-b border-border p-2 lg:flex-col lg:gap-0 lg:border-b-0 lg:border-r lg:p-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-2.5 py-2">
                  <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                  <div className="space-y-1.5 lg:flex-1">
                    <Skeleton className={cn("h-4", i % 3 ? "w-32" : "w-40")} />
                    <Skeleton className="hidden h-3 w-24 lg:block" />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex min-h-[340px] flex-col p-5 sm:p-6">
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="mt-3 h-8 w-72 max-w-full" />
              <Skeleton className="mt-2 h-4 w-[28rem] max-w-full" />
              <div className="mt-6 space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-20 w-full rounded-lg" />
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-36" />
                  <Skeleton className="h-8 w-24" />
                </div>
              </div>
              <div className="mt-auto flex justify-between pt-6">
                <Skeleton className="h-8 w-36" />
                <Skeleton className="h-8 w-36" />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
          <Skeleton className="mb-4 h-4 w-16" />
          <div className="divide-y divide-border/60">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
                <Skeleton className={cn("h-4", i % 2 ? "w-56" : "w-72")} />
                <Skeleton className="ml-auto h-3 w-28" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Appointments list only (used under the filters while they apply). */
export function AppointmentsListSkeleton({ days = 2 }: { days?: number }) {
  return (
    <div className="space-y-5">
      {Array.from({ length: days }).map((_, d) => (
        <section key={d}>
          <div className="mb-2 flex items-baseline gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {Array.from({ length: d === 0 ? 6 : 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-border/60 px-4 py-3 last:border-0">
                <Skeleton className="h-4 w-40 shrink-0" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-40 max-w-full" />
                  <Skeleton className="h-3 w-72 max-w-full" />
                </div>
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="hidden h-7 w-16 rounded-md sm:block" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

/** Full Appointments page: title, Upcoming/Past, type pills, attorney filter, list. */
export function AppointmentsSkeleton() {
  return (
    <div className="space-y-5">
      <PageTitleSkeleton />
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-40 rounded-lg" />
        <div className="flex gap-1.5">
          {["w-12", "w-28", "w-24", "w-20"].map((w, i) => (
            <Skeleton key={i} className={cn("h-7 rounded-full", w)} />
          ))}
        </div>
        <Skeleton className="ml-auto h-9 w-40" />
      </div>
      <AppointmentsListSkeleton />
    </div>
  )
}

/** Intake Recovery: title, then the failed / waiting steps table. */
export function IntakeRecoverySkeleton() {
  return (
    <div className="space-y-5">
      <PageTitleSkeleton />
      <TableSkeleton cols={["w-24", "w-14", "w-16", "w-16"]} rows={5} />
    </div>
  )
}

/** Intake Activity: title, four tiles, filters, the event list. */
export function IntakeActivitySkeleton() {
  return (
    <div className="space-y-4">
      <PageTitleSkeleton />
      <StatTilesSkeleton count={4} />
      <FilterBarSkeleton selects={3} compact widths={["md:w-40", "md:w-36", "md:w-32"]} />
      <EventListSkeleton rows={7} />
    </div>
  )
}

/** Intake Settings: the Acuity, Clio Manage and Clio Grow connection cards. */
export function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      <PageTitleSkeleton />
      <div className="grid gap-4 lg:grid-cols-2">
        {[3, 3, 3].map((rows, c) => (
          <div key={c} className="rounded-xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="mt-1.5 h-3 w-4/5" />
            <div className="mt-4 space-y-2.5">
              {Array.from({ length: rows }).map((_, r) => (
                <div key={r} className="flex justify-between">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-36" />
                </div>
              ))}
            </div>
            {c > 0 && <Skeleton className="mt-4 h-8 w-36" />}
          </div>
        ))}
      </div>
    </div>
  )
}

/** New lead form: back link, title, two-column fields, notes, buttons. */
export function NewLeadSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Skeleton className="h-4 w-28" />
      <PageTitleSkeleton />
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="mb-1.5 h-3 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
        <div>
          <Skeleton className="mb-1.5 h-3 w-24" />
          <Skeleton className="h-24 w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
    </div>
  )
}
