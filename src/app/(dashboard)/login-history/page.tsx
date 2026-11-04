import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { listLoginEvents, requireManager } from "@/lib/members"

export const dynamic = "force-dynamic"

const TEAM_LABEL: Record<string, string> = { content: "Content", intake: "Intake", admin: "Admin" }

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/Phoenix", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })

export default async function LoginHistoryPage() {
  const { teams } = await requireManager()
  const events = await listLoginEvents(teams)
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight text-foreground">Login History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {teams.length === 2 ? "Who opened the dashboard and when." : `Who on the ${TEAM_LABEL[teams[0]]} team opened the dashboard and when.`} Times are Arizona time. Showing the latest 500.
        </p>
      </div>
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {events.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{e.name}</p>
                <p className="truncate text-xs text-muted-foreground">{e.email}</p>
              </div>
              <Badge variant="outline">{TEAM_LABEL[e.role] ?? e.role}</Badge>
              <p className="w-44 text-right text-xs text-muted-foreground">{when(e.at)}</p>
            </div>
          ))}
          {!events.length && <p className="p-6 text-center text-sm text-muted-foreground">Nobody has opened the dashboard since this started recording.</p>}
        </CardContent>
      </Card>
    </div>
  )
}
