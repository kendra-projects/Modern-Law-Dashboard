"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Loader2, UserCog } from "lucide-react"
import { changeLeadClient } from "@/app/actions/intake-leads"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * Someone booked for another person: staff paste the Clio Manage matter that's
 * under the real client, and the lead takes that client. Writes nothing to Clio.
 */
export function ChangeClientForm({ leadId }: { leadId: string }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [ref, setRef] = React.useState("")
  const [pending, startTransition] = React.useTransition()
  const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null)

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
        Wrong client? (booked by someone else)
      </button>
    )

  function run(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const r = await changeLeadClient(leadId, ref)
      setResult(r)
      if (r.ok) setRef("")
      router.refresh()
    })
  }

  return (
    <form onSubmit={run} className="space-y-2 rounded-lg border border-dashed border-border px-3 py-2.5">
      <p className="text-xs text-muted-foreground">
        Paste the Clio Manage matter that&apos;s under the real client. The lead takes that client&apos;s name, contact and matter; nothing changes in Clio.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="https://app.clio.com/nc/#/matters/…"
          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs"
        />
        <Button type="submit" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={pending || !ref.trim()}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCog className="h-3.5 w-3.5" />}
          {pending ? "Changing…" : "Change client"}
        </Button>
      </div>
      {result && <p className={cn("text-xs", result.ok ? "text-success" : "text-destructive")}>{result.message}</p>}
    </form>
  )
}
