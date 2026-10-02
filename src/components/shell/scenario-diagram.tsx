"use client"

import * as React from "react"
import { ExternalLink, Maximize2, ImageOff, Workflow } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { makeScenarioUrl, type GuideScenario } from "@/lib/page-guide"

/**
 * Shows the real Make.com diagram for a scenario.
 *
 * A screenshot of a ninety-module scenario is dense, so it is framed rather
 * than dropped inline: contained inside a fixed light panel, because Make's
 * canvas is light grey and would read as a broken element on the dark themes.
 * Anyone who needs to actually read it opens the full-size image or the
 * scenario itself.
 */
export function ScenarioDiagram({
  scenario,
  open,
  onOpenChange,
}: {
  scenario: GuideScenario | null
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  // Reset when a different scenario is opened, so a previously failed load
  // does not carry over.
  const [broken, setBroken] = React.useState(false)
  React.useEffect(() => setBroken(false), [scenario?.id])

  if (!scenario) return null
  const src = `/scenarios/${scenario.id}.png`
  const makeUrl = makeScenarioUrl(scenario.id)
  const missing = broken || !scenario.hasDiagram

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-1.5 border-b border-border p-5 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2 font-serif text-base">
            <Workflow className="h-4 w-4 shrink-0 text-accent" />
            {scenario.name}
          </DialogTitle>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {scenario.does}
          </p>
        </DialogHeader>

        <div className="bg-muted/30 p-4">
          {missing ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-card/40 py-14 text-center">
              <ImageOff className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                No diagram saved for this automation yet
              </p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Open it in Make to see the live flow.
              </p>
            </div>
          ) : (
            // The canvas is light grey whatever the dashboard theme is, so it
            // gets its own light surface instead of fighting the page. Centred
            // and fitted to the panel because these captures are tall and
            // narrow — left-aligned at natural size they sat in a sea of grey.
            <div className="flex h-[62vh] items-center justify-center overflow-auto rounded-lg border border-border bg-[#f1f2f4] p-3">
              {/* Not next/image: these are screenshots of varying size served
                  straight from /public, and the optimiser adds nothing. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`Make.com flow diagram for ${scenario.name}`}
                onError={() => setBroken(true)}
                className="max-h-full w-auto max-w-full object-contain"
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-4">
          <p className="text-[11px] text-muted-foreground">
            Live diagram from Make.com
          </p>
          <div className="flex items-center gap-2">
            {!missing && (
              <a
                href={src}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                Full size
              </a>
            )}
            <a
              href={makeUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in Make
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
