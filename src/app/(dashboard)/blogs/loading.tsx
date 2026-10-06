import { FilterBarSkeleton, MediaCardGridSkeleton, PageTitleSkeleton, StatTilesSkeleton } from "@/components/shell/page-skeletons"

// Title, Drafted / Published tiles, filters, then the blog cards.
export default function Loading() {
  return (
    <div className="space-y-5">
      <PageTitleSkeleton />
      <StatTilesSkeleton count={2} narrow />
      <div className="space-y-4">
        <FilterBarSkeleton selects={2} widths={["md:w-44", "md:w-44"]} />
        <MediaCardGridSkeleton count={6} />
      </div>
    </div>
  )
}
