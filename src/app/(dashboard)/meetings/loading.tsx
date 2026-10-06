import { Skeleton } from "@/components/ui/skeleton"
import { FilterBarSkeleton, PageTitleSkeleton } from "@/components/shell/page-skeletons"

// Title, search + time, then Needs Attorney Review (left) and Recently Filed (right).
export default function Loading() {
  return (
    <div className="space-y-5">
      <PageTitleSkeleton />
      <FilterBarSkeleton selects={1} compact widths={["sm:w-44"]} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-60" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <Skeleton className="h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-72 max-w-full" />
              </div>
              <Skeleton className="hidden h-6 w-20 rounded-md sm:block" />
              <Skeleton className="h-6 w-24 rounded-md" />
              <Skeleton className="h-4 w-4" />
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <Skeleton className="h-6 w-40" />
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                <Skeleton className="h-4 w-4 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-40" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
