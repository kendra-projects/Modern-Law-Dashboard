"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

// The lead's log, newest first. Shows the latest few and opens the rest on
// request, so the card never outgrows the page.

export type ActivityRow = {
  id: string
  text: string
  at: string
  by?: string
  state: "done" | "failed" | "pending" | "running" | "skipped" | "awaiting_human"
  error?: string | null
}

const DOT: Record<ActivityRow["state"], string> = {
  done: "bg-success",
  failed: "bg-destructive",
  pending: "bg-muted-foreground/50",
  running: "bg-primary",
  skipped: "bg-muted-foreground/30",
  awaiting_human: "bg-accent",
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/Phoenix", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })

const SHOWN = 6

export function LeadActivity({ rows }: { rows: ActivityRow[] }) {
  const [all, setAll] = React.useState(false)
  const newestFirst = rows.slice().reverse()
  const visible = all ? newestFirst : newestFirst.slice(0, SHOWN)
  return (
    <div>
      <ol className="divide-y divide-border/60">
        {visible.map((r) => (
          <li key={r.id} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[r.state])} />
            {/* Event on the left, when and who on the right (stacked on phones). */}
            <div className="flex min-w-0 flex-1 flex-col gap-x-6 sm:flex-row sm:items-baseline sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm text-foreground">{r.text}</p>
                {r.error && <p className="text-xs text-destructive">{r.error}</p>}
              </div>
              <p className="shrink-0 text-xs text-muted-foreground sm:text-right">
                {fmt(r.at)}
                {r.by ? ` · ${r.by}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ol>
      {rows.length > SHOWN && (
        <button
          type="button"
          onClick={() => setAll(!all)}
          className="mt-3 cursor-pointer text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {all ? "Show less" : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  )
}
