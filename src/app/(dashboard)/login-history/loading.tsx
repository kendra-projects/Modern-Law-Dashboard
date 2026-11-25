import { PeopleListSkeleton } from "@/components/shell/page-skeletons"
import { Skeleton } from "@/components/ui/skeleton"

// Title and its description, then one card of logins: name over email, team
// badge, and the time on the right. The description wraps to two lines on a
// phone, so the placeholder does too.
export default function Loading() {
  return (
    <div className="space-y-5">
      <div>
        <Skeleton className="h-8 w-44" />
        <Skeleton className="mt-1.5 h-4 w-[34rem] max-w-full" />
        <Skeleton className="mt-1 h-4 w-40 sm:hidden" />
      </div>
      <PeopleListSkeleton rows={8} />
    </div>
  )
}
