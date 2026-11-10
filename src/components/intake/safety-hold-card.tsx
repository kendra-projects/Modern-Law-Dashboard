"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ShieldAlert, ShieldOff } from "lucide-react"
import { setSafetyHold } from "@/app/actions/intake-leads"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

const when = (iso: string) =>
  iso
    ? new Intl.DateTimeFormat("en-US", { timeZone: "America/Phoenix", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso))
    : ""

/**
 * The lead page's safety hold (lib/safety-hold.ts). Off: a quiet card with a
 * button to turn it on. On: a red banner saying who put it on and why, and a
 * release button that asks first.
 */
export function SafetyHoldCard({
  leadId,
  hold,
}: {
  leadId: string
  hold: { by: string; reason: string | null; at: string } | null
}) {
  const router = useRouter()
  const [pending, start] = React.useTransition()
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null)
  const [asking, setAsking] = React.useState(false)
  const [reason, setReason] = React.useState("")

  const run = (on: boolean) =>
    start(async () => {
      const r = await setSafetyHold(leadId, on, reason)
      setMsg({ ok: r.ok, text: r.message })
      if (r.ok) {
        setAsking(false)
        setReason("")
        // Show the banner (or take it down) straight away, not on the next reload.
        router.refresh()
      }
    })

  const note = msg && <p className={cn("text-xs", msg.ok ? "text-muted-foreground" : "text-destructive")}>{msg.text}</p>

  if (hold) {
    return (
      <div role="alert" className="space-y-2 rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-destructive">Safety hold: do not contact this client</p>
              <p className="text-xs text-foreground/80">
                Nothing automated runs for this lead: no portal invite, text, calendar invite, Clio matter, Slack post or Grow card. Don&apos;t
                send anything by hand either.
              </p>
              {hold.reason && <p className="text-xs text-foreground/80">Reason: {hold.reason}</p>}
              <p className="text-xs text-muted-foreground">
                Put on by {hold.by}
                {hold.at ? `, ${when(hold.at)}` : ""}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            disabled={pending}
            onClick={() => {
              if (window.confirm("Release the safety hold? The automation will carry on and can contact this client.")) run(false)
            }}
          >
            <ShieldOff className="h-3.5 w-3.5" /> Release hold
          </Button>
        </div>
        {note}
      </div>
    )
  }

  return (
    <div className="space-y-2 rounded-xl border border-border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Safety concern? Put this lead on hold so nothing automated contacts the client.</p>
        {!asking && (
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={pending} onClick={() => setAsking(true)}>
            <ShieldAlert className="h-3.5 w-3.5" /> Safety hold
          </Button>
        )}
      </div>
      {asking && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional, visible to staff)"
            className="h-8 min-w-0 flex-1 text-xs"
            maxLength={300}
          />
          <Button size="sm" variant="destructive" className="h-8 gap-1.5 text-xs" disabled={pending} onClick={() => run(true)}>
            <ShieldAlert className="h-3.5 w-3.5" /> Turn on hold
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={pending} onClick={() => setAsking(false)}>
            Cancel
          </Button>
        </div>
      )}
      {note}
    </div>
  )
}
