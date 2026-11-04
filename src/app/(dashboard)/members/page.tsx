import { MembersClient } from "@/components/members/members-client"
import { listMembers, listPendingInvites, requireManager } from "@/lib/members"

export const dynamic = "force-dynamic"

export default async function MembersPage() {
  const { email, teams } = await requireManager()
  const [members, invites] = await Promise.all([listMembers(email), listPendingInvites(teams)])
  return <MembersClient members={members} invites={invites} teams={teams} />
}
