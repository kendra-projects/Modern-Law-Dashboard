"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import {
  Info,
  ExternalLink,
  ChevronRight,
  Workflow,
  LifeBuoy,
} from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { NAV_ITEMS } from "./nav-items"
import { guideFor, makeScenarioUrl } from "@/lib/page-guide"
import { cn } from "@/lib/utils"

/** Long enough not to flicker when the pointer crosses the gap to the panel. */
const CLOSE_DELAY = 160

export function PageGuide() {
  const pathname = usePathname()
  const [open, setOpen] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    setOpen(true)
  }, [])

  const hide = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(false), CLOSE_DELAY)
  }, [])

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  // A route change can leave the panel open over a page it no longer describes.
  React.useEffect(() => setOpen(false), [pathname])

  const guide = guideFor(pathname)
  if (!guide) return null

  const nav = [...NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => (i.href === "/" ? pathname === "/" : pathname.startsWith(i.href)))
  const Icon = nav?.icon ?? Workflow

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="What this page does"
          onMouseEnter={show}
          onMouseLeave={hide}
          onFocus={show}
          onBlur={hide}
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground",
            "transition-all hover:bg-primary/12 hover:text-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            open && "bg-primary/12 text-primary"
          )}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={10}
        onMouseEnter={show}
        onMouseLeave={hide}
        // Hovering must not pull focus out of whatever the user was doing.
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-[min(26rem,calc(100vw-2rem))] overflow-hidden p-0"
      >
        <div className="flex items-start gap-3 border-b border-border bg-muted/40 p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <Icon className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0">
            <p className="font-serif text-sm font-semibold leading-tight text-foreground">
              {nav?.label ?? "This page"}
            </p>
            <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
              What this page does
            </p>
          </div>
        </div>

        <div className="max-h-[min(32rem,72vh)] overflow-y-auto">
          <div className="space-y-2.5 p-4">
            <p className="text-[13px] font-medium leading-relaxed text-foreground">
              {guide.what}
            </p>
            {guide.detail && (
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                {guide.detail}
              </p>
            )}
          </div>

          {guide.flow && (
            <div className="flex flex-wrap items-center gap-1 border-t border-border/60 px-4 py-3">
              {guide.flow.map((step, i) => (
                <React.Fragment key={step}>
                  {i > 0 && (
                    <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                  )}
                  <span className="rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-foreground">
                    {step}
                  </span>
                </React.Fragment>
              ))}
            </div>
          )}

          {guide.scenarios.length > 0 ? (
            <div className="border-t border-border/60 p-4">
              <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Workflow className="h-3.5 w-3.5 text-accent" />
                Runs on {guide.scenarios.length}{" "}
                {guide.scenarios.length === 1 ? "automation" : "automations"}
              </p>
              <div className="space-y-1.5">
                {guide.scenarios.map((s) => (
                  <a
                    key={s.id}
                    href={makeScenarioUrl(s.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="group block rounded-lg border border-border bg-card/60 p-2.5 transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                        {s.name}
                      </span>
                      <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                      {s.does}
                    </span>
                  </a>
                ))}
              </div>
              <p className="mt-2.5 text-[11px] text-muted-foreground/70">
                Opens the automation in Make.com.
              </p>
            </div>
          ) : (
            guide.note && (
              <p className="border-t border-border/60 p-4 text-[12px] leading-relaxed text-muted-foreground">
                {guide.note}
              </p>
            )
          )}

          {guide.troubleshoot && (
            <div className="flex items-start gap-2 border-t border-border/60 bg-muted/30 p-4">
              <LifeBuoy className="mt-px h-3.5 w-3.5 shrink-0 text-accent" />
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {guide.troubleshoot}
              </p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
