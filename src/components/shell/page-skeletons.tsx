import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

export function PageHeaderSkeleton() {
  return (
    <div>
      <Skeleton className="h-7 w-64" />
      <Skeleton className="mt-2 h-4 w-full max-w-xl" />
    </div>
  )
}

export function ToolbarSkeleton() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Skeleton className="h-10 flex-1" />
      <Skeleton className="h-10 w-full sm:w-40" />
      <Skeleton className="h-10 w-full sm:w-40" />
    </div>
  )
}

export function TableRowsSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  )
}

export function StatCardsSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:max-w-md">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-2 h-7 w-10" />
        </div>
      ))}
    </div>
  )
}

export function CardListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: rows }).map((_, i) => (
        <Card key={i}>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function KpiRowSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <Skeleton className="h-4 w-10" />
            </div>
            <Skeleton className="mt-4 h-7 w-16" />
            <Skeleton className="mt-2 h-3 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function ChartCardSkeleton({
  className,
  height = "h-64",
}: {
  className?: string
  height?: string
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-40" />
      </CardHeader>
      <CardContent>
        <Skeleton className={`w-full ${height}`} />
      </CardContent>
    </Card>
  )
}
