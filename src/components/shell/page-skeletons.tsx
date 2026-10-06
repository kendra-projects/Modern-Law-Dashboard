import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { cn } from "@/lib/utils"

// Loading placeholders built from the same pieces the pages use (title block,
// stat tiles, filter bar, list and table cards, media cards, KPI cards), at
// the same sizes, so nothing jumps when the real content arrives.

/** The h1 + one-line description at the top of a page, with an optional button on the right. */
export function PageTitleSkeleton({ action = false, actionWidth = "w-28" }: { action?: boolean; actionWidth?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="mt-1.5 h-4 w-[34rem] max-w-full" />
      </div>
      {action && <Skeleton className={cn("h-9", actionWidth)} />}
    </div>
  )
}

/** The small number tiles (StatTile): four across, or two in a narrow strip. */
export function StatTilesSkeleton({ count = 4, narrow = false }: { count?: number; narrow?: boolean }) {
  return (
    <div className={narrow ? "grid grid-cols-2 gap-3 sm:max-w-md" : "grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4"}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn("rounded-lg border border-border bg-card", narrow ? "p-4" : "p-3 sm:p-4")}>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-2 h-7 w-12" />
        </div>
      ))}
    </div>
  )
}

/** The search + filters card. `compact` is the h-9 variant (logs, recovery, meetings, GBP). */
export function FilterBarSkeleton({
  selects = 2,
  compact = false,
  widths,
}: {
  selects?: number
  compact?: boolean
  widths?: string[]
}) {
  const h = compact ? "h-9" : "h-10"
  return (
    <Card>
      <CardContent className={cn("flex flex-col gap-3 md:flex-row md:items-center", compact ? "p-3 sm:p-4" : "p-4")}>
        <Skeleton className={cn(h, "w-full md:flex-1")} />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
          {Array.from({ length: selects }).map((_, i) => (
            <Skeleton key={i} className={cn(h, "w-full", widths?.[i] ?? "md:w-40")} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

/** An event/job list in one card: icon, title with a chip, a line, a meta line. */
export function EventListSkeleton({ rows = 6, chips = 1 }: { rows?: number; chips?: number }) {
  return (
    <Card>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 border-b border-border/60 p-4 last:border-0">
          <Skeleton className="mt-0.5 h-8 w-8 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className={cn("h-4", i % 2 ? "w-48" : "w-36")} />
              {Array.from({ length: chips }).map((_, c) => (
                <Skeleton key={c} className="h-5 w-16 rounded-full" />
              ))}
            </div>
            <Skeleton className={cn("mt-2 h-4 max-w-full", i % 3 ? "w-96" : "w-80")} />
            <Skeleton className="mt-2 h-3 w-44" />
          </div>
        </div>
      ))}
    </Card>
  )
}

/** Blog / GBP cards: image on top, two-line title, chips and a date. */
export function MediaCardGridSkeleton({ count = 6, chips = 1 }: { count?: number; chips?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
          <Skeleton className="aspect-video w-full rounded-none" />
          <div className="flex flex-1 flex-col gap-2 p-4">
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-2/3" />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Array.from({ length: chips }).map((_, c) => (
                <Skeleton key={c} className="h-5 w-20 rounded-md" />
              ))}
            </div>
            <div className="mt-auto flex items-center justify-between pt-1">
              <Skeleton className="h-5 w-24 rounded-md" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** One KPI card: label and number on the left, icon on the right, hint (and sparkline) below. */
export function KpiCardSkeleton({ spark = false }: { spark?: boolean }) {
  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-3 h-8 w-16" />
        </div>
        <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
      </div>
      <div className="mt-auto flex items-end justify-between gap-3 pt-3">
        <Skeleton className="h-3 w-20" />
        {spark && <Skeleton className="h-10 w-24" />}
      </div>
    </Card>
  )
}

/** The five KPI cards, with sparklines where the page draws them. */
export function KpiRowSkeleton({ sparks = [] }: { sparks?: number[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <KpiCardSkeleton key={i} spark={sparks.includes(i)} />
      ))}
    </div>
  )
}

/** Card header used by the charts: icon, title, and an optional note on the right. */
export function ChartHeaderSkeleton({ titleWidth = "w-36", note = false }: { titleWidth?: string; note?: boolean }) {
  return (
    <CardHeader className="flex-row items-center gap-2 space-y-0">
      <Skeleton className="h-4 w-4" />
      <Skeleton className={cn("h-5", titleWidth)} />
      {note && <Skeleton className="ml-auto h-3 w-20" />}
    </CardHeader>
  )
}

/** A line chart card (260px plot, optional legend under it). */
export function ChartCardSkeleton({
  className,
  titleWidth,
  note = true,
  legend = 0,
}: {
  className?: string
  titleWidth?: string
  note?: boolean
  legend?: number
}) {
  return (
    <Card className={cn("h-full", className)}>
      <ChartHeaderSkeleton titleWidth={titleWidth} note={note} />
      <CardContent>
        <Skeleton className="h-[260px] w-full" />
        {legend > 0 && (
          <div className="mt-2 flex justify-center gap-4">
            {Array.from({ length: legend }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-16" />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/** A donut with its two-column legend underneath. */
export function DonutSkeleton({ size = 180, legend = 6 }: { size?: number; legend?: number }) {
  return (
    <>
      <div className="flex justify-center py-2">
        <Skeleton className="rounded-full" style={{ height: size, width: size }} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
        {Array.from({ length: legend }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="ml-auto h-3 w-5" />
          </div>
        ))}
      </div>
    </>
  )
}

/** A row in a dashboard list: icon tile, two lines, a pill. */
export function ListRowSkeleton({ icon = true, pill = true }: { icon?: boolean; pill?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 p-3">
      {icon && <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />}
      <div className="min-w-0 flex-1 space-y-1.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      {pill && <Skeleton className="h-5 w-16 shrink-0 rounded-full" />}
    </div>
  )
}
