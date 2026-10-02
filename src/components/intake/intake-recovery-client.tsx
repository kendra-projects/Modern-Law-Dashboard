"use client"

import * as React from "react"
import Link from "next/link"
import { LifeBuoy, RotateCw, PauseCircle } from "lucide-react"
import { retryStep } from "@/app/actions/intake-leads"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type RecoveryRow = {
  id: string
  lead_id: string
  step_key: string
  state: "failed" | "awaiting_human"
  error: string | null
  updated_at: string
  leadName: string
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function Row({ row }: { row: RecoveryRow }) {
  const [pending, startTransition] = React.useTransition()
  const [msg, setMsg] = React.useState<string | null>(null)
  const failed = row.state === "failed"

  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className="px-4 py-3">
        <Link href={`/intake/${row.lead_id}`} className="font-medium text-foreground hover:underline">
          {row.leadName}
        </Link>
        <span className="block text-xs text-muted-foreground">{row.step_key}</span>
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
            failed
              ? "bg-destructive/15 text-destructive"
              : "bg-accent/15 text-accent"
          )}
        >
          {failed ? <RotateCw className="h-3 w-3" /> : <PauseCircle className="h-3 w-3" />}
          {failed ? "Failed" : "Awaiting human"}
        </span>
        {row.error && (
          <span className="mt-1 block max-w-xs truncate text-xs text-muted-foreground">
            {row.error}
          </span>
        )}
      </td>
      <td className="hidden whitespace-nowrap px-4 py-3 text-xs text-muted-foreground sm:table-cell">
        {fmt(row.updated_at)}
      </td>
      <td className="px-4 py-3 text-right">
        {failed ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            className="gap-1.5"
            onClick={() =>
              startTransition(async () => {
                const r = await retryStep(row.id)
                setMsg(r.message)
              })
            }
          >
            <RotateCw className="h-3.5 w-3.5" /> Retry
          </Button>
        ) : (
          <Link
            href={`/intake/${row.lead_id}`}
            className="text-xs text-primary hover:underline"
          >
            Open
          </Link>
        )}
        {msg && <span className="mt-1 block text-[11px] text-muted-foreground">{msg}</span>}
      </td>
    </tr>
  )
}

export function IntakeRecoveryClient({ rows }: { rows: RecoveryRow[] }) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight text-foreground">
          Intake Recovery
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Steps that failed or are waiting on a person. Retry re-queues a failed
          step; the orchestrator runs it again from where it stopped.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
          <LifeBuoy className="h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium text-foreground">Nothing stuck</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Failed steps and human-gate pauses show up here so nothing quietly
            falls through.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Lead · step</th>
                <th className="px-4 py-3 font-medium">State</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">Updated</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Row key={r.id} row={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
