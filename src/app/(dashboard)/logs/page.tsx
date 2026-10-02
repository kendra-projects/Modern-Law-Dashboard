import { getActivityFeed } from "@/lib/queries"
import { LogsClient } from "@/components/logs/logs-client"

export const dynamic = "force-dynamic"

export default async function LogsPage() {
  const events = await getActivityFeed()
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight text-foreground">
          Activity &amp; System Logs
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A complete timeline of every automation event — uploads, content
          generation, each platform publish, recovery attempts and system logs.
        </p>
      </div>
      <LogsClient events={events} />
    </div>
  )
}
