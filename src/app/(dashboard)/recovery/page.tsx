import { getRetryQueue } from "@/lib/queries"
import { RecoveryClient } from "@/components/recovery/recovery-client"

export const dynamic = "force-dynamic"

export default async function RecoveryPage() {
  const jobs = await getRetryQueue()
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight text-foreground">
          Recovery Queue
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Only the failed jobs that are being retried. Each one auto-retries on
          its own — or retry it now by hand. One failure never stops the rest.
        </p>
      </div>
      <RecoveryClient jobs={jobs} />
    </div>
  )
}
