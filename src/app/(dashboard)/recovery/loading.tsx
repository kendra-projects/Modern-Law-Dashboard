import {
  PageHeaderSkeleton,
  ToolbarSkeleton,
  TableRowsSkeleton,
} from "@/components/shell/page-skeletons"

export default function Loading() {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton />
      <ToolbarSkeleton />
      <TableRowsSkeleton rows={6} />
    </div>
  )
}
