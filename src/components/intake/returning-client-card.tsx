"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { History } from "lucide-react"
import { decideReturningClient } from "@/app/actions/intake-leads"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type OpenMatter = { id: string; display: string; status: string; attorney: string | null; opened: string | null; same_attorney: boolean }

const CLIO = "https://app.clio.com/nc/#/matters/"

/**
 * A returning client (lib/returning-client.ts): the client already has open or
 * pending matters in Clio. Staff say whether this booking is the same case
 * (link it to that matter) or a new one (the bot makes a new matter). Nothing
 * that needs a matter (Grow convert, portal, text) goes ahead until they do.
 */
export function ReturningClientCard({ leadId, client, matters }: { leadId: string; client: string; matters: OpenMatter[] }) {
  const router = useRouter()
  const [pending, start] = React.useTransition()
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null)

  const run = (decision: "same" | "new", matterId?: string) =>
    start(async () => {
      const r = await decideReturningClient(leadId, decision, matterId)
      setMsg({ ok: r.ok, text: r.message })
      if (r.ok) router.refresh()
    })

  return (
    <div role="alert" className="space-y-3 rounded-xl border border-accent/50 bg-accent/10 px-4 py-3">
      <div className="flex items-start gap-2.5">
        <History className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-accent">Returning client: same case or new case?</p>
          <p className="text-xs text-foreground/80">
            {client} already has {matters.length === 1 ? "an open matter" : `${matters.length} open matters`} in Clio. If this booking is for the same
            case, use that matter: no new Grow or Clio matter is made (close the extra Grow lead by hand). If it&apos;s a separate case, choose New
            case. Nothing that needs a matter goes ahead until you decide.
          </p>
        </div>
      </div>
      <ul className="space-y-2">
        {matters.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background/60 px-3 py-2">
            <div className="min-w-0 text-xs">
              <a href={`${CLIO}${m.id}`} target="_blank" rel="noreferrer" className="font-medium text-foreground hover:underline">
                {m.display}
              </a>
              <span className="block text-muted-foreground">
                {[m.status, m.attorney, m.opened && `since ${m.opened}`].filter(Boolean).join(" · ")}
                {m.same_attorney && <span className="ml-1 text-accent">· same attorney as this booking</span>}
              </span>
            </div>
            <Button size="sm" className="h-8 text-xs" disabled={pending} onClick={() => run("same", m.id)}>
              Same case: use this matter
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="h-8 text-xs" disabled={pending} onClick={() => run("new")}>
          New case: make a new matter
        </Button>
        {msg && <p className={cn("text-xs", msg.ok ? "text-muted-foreground" : "text-destructive")}>{msg.text}</p>}
      </div>
    </div>
  )
}
