import { Skeleton } from "@/components/ui/skeleton"
import { Card } from "@/components/ui/card"
import { FilterBarSkeleton, PageTitleSkeleton } from "@/components/shell/page-skeletons"

// Title, filters, then the archive table (title, source, status, date, detail).
export default function Loading() {
  return (
    <div className="space-y-5">
      <PageTitleSkeleton />
      <div className="space-y-4">
        <FilterBarSkeleton selects={3} widths={["lg:w-44", "lg:w-44", "lg:w-44"]} />
        <Card className="overflow-hidden">
          <div className="flex items-center gap-4 border-b border-border px-4 py-3">
            <Skeleton className="h-3 w-12 flex-1" />
            <Skeleton className="hidden h-3 w-14 md:block" />
            <Skeleton className="h-3 w-14" />
            <Skeleton className="hidden h-3 w-10 sm:block" />
            <Skeleton className="hidden h-3 w-10 sm:block" />
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-border/60 px-4 py-3.5 last:border-0">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className={i % 2 ? "h-4 w-56" : "h-4 w-80 max-w-full"} />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
              <Skeleton className="hidden h-7 w-20 rounded-md md:block" />
              <Skeleton className="h-5 w-24 rounded-md" />
              <Skeleton className="hidden h-4 w-14 sm:block" />
              <Skeleton className="hidden h-4 w-4 sm:block" />
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}
