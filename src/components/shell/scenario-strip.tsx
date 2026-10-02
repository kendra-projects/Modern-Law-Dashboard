"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { Workflow, Eye, Image as ImageIcon } from "lucide-react"
import { guideFor, type GuideScenario } from "@/lib/page-guide"
import { ScenarioDiagram } from "./scenario-diagram"

/**
 * Names the Make.com automations behind the current page, in the open.
 *
 * The (i) panel holds the explanation, but an explanation nobody opens is not
 * documentation. The client should be able to glance at any page and see which
 * automations it depends on — and open the actual flow diagram — without
 * knowing there is a panel to hover in the first place.
 *
 * It lives in the layout rather than on each page so every route gets it,
 * including the ones whose heading is rendered inside a client component.
 */
export function ScenarioStrip() {
  const pathname = usePathname()
  const [showing, setShowing] = React.useState<GuideScenario | null>(null)

  const guide = guideFor(pathname)
  if (!guide) return null

  const hasScenarios = guide.scenarios.length > 0

  return (
    <>
      <div className="border-b border-border/60 bg-muted/25">
        <div className="mx-auto flex w-full max-w-[1400px] items-center gap-2.5 px-4 py-2 sm:px-6">
          <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {hasScenarios ? (
              <>
                <Workflow className="h-3.5 w-3.5 text-accent" />
                <span className="hidden sm:inline">Runs on</span>
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="hidden sm:inline">Reads only</span>
              </>
            )}
          </span>

          {hasScenarios ? (
            // Scrolls sideways rather than wrapping: Meeting Resolution lists
            // five, and a strip that grows to two rows pushes the page down on
            // every single view.
            <div className="scrollbar-none flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
              {guide.scenarios.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setShowing(s)}
                  title={`${s.name} — ${s.does}`}
                  className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
                >
                  {s.short}
                  <ImageIcon className="h-2.5 w-2.5 text-muted-foreground transition-colors group-hover:text-primary" />
                </button>
              ))}
            </div>
          ) : (
            <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
              {guide.note}
            </p>
          )}
        </div>
      </div>

      <ScenarioDiagram
        scenario={showing}
        open={!!showing}
        onOpenChange={(v) => !v && setShowing(null)}
      />
    </>
  )
}
