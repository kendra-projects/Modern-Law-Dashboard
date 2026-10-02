import {
  PageHeaderSkeleton,
  CardListSkeleton,
} from "@/components/shell/page-skeletons"

export default function Loading() {
  return (
    <div className="space-y-5">
      <PageHeaderSkeleton />
      <CardListSkeleton rows={4} />
    </div>
  )
}
