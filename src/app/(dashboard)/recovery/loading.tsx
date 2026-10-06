import { EventListSkeleton, FilterBarSkeleton, PageTitleSkeleton, StatTilesSkeleton } from "@/components/shell/page-skeletons"

// Title, four status tiles, filters, then the retry jobs.
export default function Loading() {
  return (
    <div className="space-y-5">
      <PageTitleSkeleton />
      <div className="space-y-4">
        <StatTilesSkeleton count={4} />
        <FilterBarSkeleton selects={3} compact widths={["md:w-40", "md:w-40", "md:w-44"]} />
        <EventListSkeleton rows={4} chips={3} />
      </div>
    </div>
  )
}
