import { redirect } from "next/navigation"
import { getRole, canSeeIntake } from "@/lib/role"
import { ClioSyncPing } from "@/components/intake/clio-sync-ping"

// Route-level guard: only intake/admin users may open any /intake page.
// The nav already hides these links for content users; this stops a direct URL.
export default async function IntakeSectionLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const role = await getRole()
  if (!canSeeIntake(role)) redirect("/")
  return (
    <>
      <ClioSyncPing />
      {children}
    </>
  )
}
