import { redirect } from "next/navigation"
import { Sidebar } from "@/components/shell/sidebar"
import { Topbar } from "@/components/shell/topbar"
import { ScenarioStrip } from "@/components/shell/scenario-strip"
import { AutoRefresh } from "@/components/shell/auto-refresh"
import { MakeHealthSync } from "@/components/shell/make-health-sync"
import { NavSignalsProvider } from "@/components/shell/nav-signals"
import { getNavSignals } from "@/lib/signals"
import { getRole, getCurrentUser } from "@/lib/role"
import { getWorkspace } from "@/lib/workspace"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()

  // Belt-and-suspenders: middleware already guards, but never render the
  // authenticated shell without a validated session.
  if (!user) redirect("/login")

  // Signals: timestamps only; what counts as "new" is decided in the browser.
  // Role decides which nav section this person sees (content/intake/admin).
  // Pass only the role string across the RSC boundary — the nav items carry icon
  // *components* (functions), which are not serializable as client props.
  // Independent, so fetched together.
  const [signals, role] = await Promise.all([getNavSignals(), getRole()])

  return (
    <NavSignalsProvider signals={signals}>
      <div className="flex min-h-screen bg-background">
        <AutoRefresh />
        <MakeHealthSync />
        <Sidebar role={role} workspace={getWorkspace()} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar email={user.email ?? "admin@modernlaw.app"} role={role} workspace={getWorkspace()} />
          <ScenarioStrip />
          <main className="flex-1 p-4 sm:p-6">
            <div className="mx-auto w-full max-w-[1400px] animate-fade-up">
              {children}
            </div>
          </main>
        </div>
      </div>
    </NavSignalsProvider>
  )
}
