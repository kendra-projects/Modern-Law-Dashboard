import { PeopleListSkeleton } from "@/components/shell/page-skeletons"
import { Skeleton } from "@/components/ui/skeleton"

// Title with "Add member" on the right, then one card of members: name over
// email, team badge, "Last opened …", and Remove (or "Main login"). The title
// block keeps its own width like the page's, so on a phone the button drops
// below it the same way.
export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="mt-1.5 h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <PeopleListSkeleton rows={4} timeBox="w-48" timeBar="w-40" action />
    </div>
  )
}
