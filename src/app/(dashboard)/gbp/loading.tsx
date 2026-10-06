import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { MediaCardGridSkeleton, PageTitleSkeleton, StatTilesSkeleton } from "@/components/shell/page-skeletons"

// Title with Refresh, four tiles, search + time + AI toggle, then the blog campaign cards.
export default function Loading() {
  return (
    <div className="space-y-6">
      <PageTitleSkeleton action actionWidth="w-20" />
      <StatTilesSkeleton count={4} />
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-3 sm:p-4 md:flex-row">
          <Skeleton className="h-9 w-full md:flex-1" />
          <div className="flex w-full items-center gap-2 md:w-auto">
            <Skeleton className="h-9 w-[145px]" />
            <Skeleton className="h-8 w-36 rounded-lg" />
          </div>
        </CardContent>
      </Card>
      <MediaCardGridSkeleton count={3} chips={3} />
    </div>
  )
}
