"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Link2, Loader2 } from "lucide-react"
import { linkClioMatter } from "@/app/actions/intake-leads"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Links one of the client's existing Clio matters to the lead. Writes nothing to Clio. */
export function ClioLinkButton({ leadId, matterId, label }: { leadId: string; matterId: string; label: string }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null)

  function run() {
    startTransition(async () => {
      const r = await linkClioMatter(leadId, matterId)
      setResult(r)
      router.refresh()
    })
  }

  return (
    <div className="space-y-1.5">
      <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={run} disabled={pending}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
        {pending ? "Linking…" : `Link ${label}`}
      </Button>
      {result && <p className={cn("text-xs", result.ok ? "text-success" : "text-destructive")}>{result.message}</p>}
    </div>
  )
}
