import {
  KpiRowSkeleton,
  ChartCardSkeleton,
  CardListSkeleton,
} from "@/components/shell/page-skeletons"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-5">
      <KpiRowSkeleton />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCardSkeleton className="lg:col-span-2" />
        <ChartCardSkeleton height="h-48" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent>
            <CardListSkeleton rows={2} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-28" />
          </CardHeader>
          <CardContent>
            <Skeleton className="mx-auto h-32 w-32 rounded-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
