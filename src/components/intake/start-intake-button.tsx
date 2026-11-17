"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Loader2, Play } from "lucide-react"
import { startIntakeFromAppointment } from "@/app/actions/intake-leads"
import { cn } from "@/lib/utils"

/** Makes a lead for a consult booking that has none, and starts the intake automation on it. */
export function StartIntakeButton({ acuityId }: { acuityId: string }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null)

  function run() {
    startTransition(async () => {
      const r = await startIntakeFromAppointment(acuityId)
      setResult(r)
      router.refresh()
    })
  }

  if (result && !result.ok) return <span className="text-xs text-destructive">{result.message}</span>
  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-primary/40 px-2 py-1 text-xs text-primary hover:bg-primary/10",
        pending && "opacity-70"
      )}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
      {pending ? "Starting…" : "Start intake"}
    </button>
  )
}
