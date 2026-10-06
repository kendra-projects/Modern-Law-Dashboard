import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  ChartCardSkeleton,
  ChartHeaderSkeleton,
  DonutSkeleton,
  KpiRowSkeleton,
  ListRowSkeleton,
} from "@/components/shell/page-skeletons"

/** The content Overview while it loads: KPIs, velocity + platforms, activity + health. */
export function ContentOverviewSkeleton() {
  return (
    <div className="space-y-5">
      <KpiRowSkeleton sparks={[0, 2]} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCardSkeleton className="lg:col-span-2" titleWidth="w-40" />
        <Card className="h-full">
          <ChartHeaderSkeleton titleWidth="w-44" />
          <CardContent>
            <DonutSkeleton size={200} legend={5} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="h-full lg:col-span-2">
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <DonutSkeleton size={170} legend={5} />
              <Skeleton className="mx-auto mt-2 h-3 w-32" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-44" />
              {Array.from({ length: 5 }).map((_, i) => (
                <ListRowSkeleton key={i} />
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="flex h-full flex-col">
          <ChartHeaderSkeleton titleWidth="w-32" />
          <CardContent className="flex flex-1 flex-col justify-center">
            <div className="flex justify-center">
              <Skeleton className="h-[180px] w-[180px] rounded-full" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {[0, 1].map((i) => (
                <div key={i} className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-muted/30 p-2">
                  <Skeleton className="h-6 w-8" />
                  <Skeleton className="h-3 w-12" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
