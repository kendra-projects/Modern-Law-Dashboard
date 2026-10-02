"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Loader2, FilePlus2 } from "lucide-react"
import { createInClio } from "@/app/actions/intake-leads"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Writes to the firm's live Clio. */
export function ClioCreateButton({ leadId }: { leadId: string }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null)

  function run() {
    startTransition(async () => {
      const r = await createInClio(leadId)
      setResult(r)
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <Button type="button" size="sm" className="h-8 gap-1.5 text-xs" onClick={run} disabled={pending}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FilePlus2 className="h-3.5 w-3.5" />}
        {pending ? "Writing to Clio…" : "Create in Clio"}
      </Button>
      {result && (
        <p className={cn("text-xs", result.ok ? "text-success" : "text-destructive")}>{result.message}</p>
      )}
    </div>
  )
}
