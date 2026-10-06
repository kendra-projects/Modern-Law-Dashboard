import { EventListSkeleton, FilterBarSkeleton, PageTitleSkeleton, StatTilesSkeleton } from "@/components/shell/page-skeletons"

// Title, four count tiles, filters, then the event timeline.
export default function Loading() {
  return (
    <div className="space-y-5">
      <PageTitleSkeleton />
      <div className="space-y-4">
        <StatTilesSkeleton count={4} />
        <FilterBarSkeleton selects={3} compact widths={["md:w-36", "md:w-36", "md:w-32"]} />
        <EventListSkeleton rows={7} />
      </div>
    </div>
  )
}
