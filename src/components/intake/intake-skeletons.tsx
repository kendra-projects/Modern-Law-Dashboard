import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

// Loading placeholders for the intake pages. Each one mirrors the real page's
// layout (same cards, same row heights) so the content doesn't jump when it
// arrives. Built on the shared shimmer <Skeleton>.

function Header({ action = false }: { action?: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {action && <Skeleton className="h-9 w-28" />}
    </div>
  )
}

/** Consultation Intake queue: header + table rows. */
export function QueueSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-5">
      <Header action />
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex gap-4 border-b border-border px-4 py-3">
          {["w-24", "w-16", "w-20", "w-14", "w-16"].map((w, i) => (
            <Skeleton key={i} className={cn("h-3", w, i > 0 && "hidden sm:block")} />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border/60 px-4 py-3 last:border-0">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-44 max-w-full" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="hidden h-4 w-14 sm:block" />
            <Skeleton className="hidden h-4 w-24 md:block" />
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** One lead: back link, name, booking-details grid, right rail cards. */
export function LeadDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-28" />
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="rounded-xl border border-border bg-card p-5">
          <Skeleton className="mb-4 h-4 w-32" />
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            {Array.from({ length: 14 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-36 max-w-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5">
            <Skeleton className="mb-4 h-4 w-28" />
            <Skeleton className="mb-2 h-3 w-24" />
            <div className="mb-5 flex gap-2">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-8 w-32" />
            </div>
            <Skeleton className="mb-2 h-3 w-28" />
            <div className="flex gap-2">
              <Skeleton className="h-9 w-32" />
              <Skeleton className="h-9 w-16" />
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <Skeleton className="mb-4 h-4 w-16" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="mb-3 flex items-start gap-2.5">
                <Skeleton className="mt-1 h-2 w-2 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-16" />
                </div>
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
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {Array.from({ length: d === 0 ? 6 : 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-border/60 px-4 py-3 last:border-0">
                <Skeleton className="h-4 w-36 shrink-0" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-40 max-w-full" />
                  <Skeleton className="h-3 w-64 max-w-full" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="hidden h-7 w-14 sm:block" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

/** Full Appointments page: header + filter bar + list. */
export function AppointmentsSkeleton() {
  return (
    <div className="space-y-5">
      <Header />
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-9 w-40" />
        <div className="flex gap-1.5">
          {["w-10", "w-16", "w-20", "w-14"].map((w, i) => (
            <Skeleton key={i} className={cn("h-7 rounded-full", w)} />
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-16" />
        </div>
      </div>
      <AppointmentsListSkeleton />
    </div>
  )
}

/** Intake Settings: two connection cards. */
export function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      <Header />
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((c) => (
          <div key={c} className="rounded-xl border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="mt-1.5 h-3 w-4/5" />
            <div className="mt-4 space-y-2.5">
              {[0, 1, 2].map((r) => (
                <div key={r} className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
            {c === 1 && <Skeleton className="mt-4 h-8 w-32" />}
          </div>
        ))}
      </div>
    </div>
  )
}
