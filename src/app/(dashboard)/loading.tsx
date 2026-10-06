import { getRole } from "@/lib/role"
import { getWorkspace } from "@/lib/workspace"
import { ContentOverviewSkeleton } from "@/components/overview/overview-skeleton"
import { IntakeOverviewSkeleton } from "@/components/intake/intake-skeletons"

// The Overview shows a different page per workspace, so its placeholder does
// too. The role is already fetched for this request (React cache), so this
// adds no wait.
export default async function Loading() {
  const role = await getRole()
  const intake = role === "intake" || (role === "admin" && getWorkspace() === "intake")
  return intake ? <IntakeOverviewSkeleton /> : <ContentOverviewSkeleton />
}
