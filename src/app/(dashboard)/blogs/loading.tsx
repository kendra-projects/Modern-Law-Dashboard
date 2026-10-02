import {
  PageHeaderSkeleton,
  StatCardsSkeleton,
  ToolbarSkeleton,
  TableRowsSkeleton,
} from "@/components/shell/page-skeletons"

export default function Loading() {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton />
      <StatCardsSkeleton count={2} />
      <ToolbarSkeleton />
      <TableRowsSkeleton rows={8} />
    </div>
  )
}
