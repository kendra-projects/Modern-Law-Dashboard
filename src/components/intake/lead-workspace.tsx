"use client"

import * as React from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Check, X, Ban, Clock3, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// The lead page's working area, as a split view: the intake steps in the order
// the work is done on the left, and the selected step on the right with its
// controls. It opens on the step to do now, so staff see one thing at a time
// and never scroll past finished work to reach it.

// "waiting" is a step the system finishes on its own (no one has to act now).
export type StepState = "done" | "current" | "todo" | "waiting" | "failed" | "stopped"
export type WorkspaceStep = {
  key: string
  title: string
  state: StepState
  /** One line under the title in the list: who did it and when, or what's pending. */
  summary?: string
  /** What the step is for, shown under its title in the panel. */
  description: string
  body?: React.ReactNode
}

const STATE_LABEL: Record<StepState, string> = {
  done: "Done",
  current: "To do now",
  todo: "Later",
  waiting: "Waiting",
  failed: "Stopped here",
  stopped: "Not needed",
}

function Node({ state, n, size = "md" }: { state: StepState; n: number; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums",
        size === "md" ? "h-7 w-7" : "h-6 w-6",
        state === "done" && "border-success/40 bg-success/15 text-success",
        state === "current" && "border-primary bg-primary text-primary-foreground",
        state === "todo" && "border-border bg-transparent text-muted-foreground",
        state === "waiting" && "border-dashed border-border bg-transparent text-muted-foreground",
        state === "failed" && "border-destructive/40 bg-destructive/15 text-destructive",
        state === "stopped" && "border-border/60 bg-transparent text-muted-foreground/50"
      )}
    >
      {state === "current" && (
        <span className="absolute inset-0 rounded-full border border-primary motion-safe:animate-ping motion-safe:[animation-duration:1.8s]" />
      )}
      {state === "done" ? (
        <Check className="h-3.5 w-3.5" />
      ) : state === "failed" ? (
        <X className="h-3.5 w-3.5" />
      ) : state === "stopped" ? (
        <Ban className="h-3 w-3" />
      ) : state === "waiting" ? (
        <Clock3 className="h-3.5 w-3.5" />
      ) : (
        n
      )}
    </span>
  )
}

export function LeadWorkspace({
  steps,
  note,
  initialKey,
}: {
  steps: WorkspaceStep[]
  note?: string
  /** Open this step instead of the one to do now (links from Intake Recovery). */
  initialKey?: string
}) {
  const asked = initialKey ? steps.findIndex((s) => s.key === initialKey) : -1
  const firstOpen = steps.findIndex((s) => s.state === "current" || s.state === "failed")
  const [index, setIndex] = React.useState(asked !== -1 ? asked : firstOpen === -1 ? steps.length - 1 : firstOpen)
  const reduce = useReducedMotion()
  const step = steps[index]
  const listRef = React.useRef<HTMLOListElement>(null)

  // Keep the selected step visible in the phone rail, which scrolls sideways.
  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-step="${step.key}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [step.key])

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {note && <p className="border-b border-border bg-muted/40 px-5 py-2.5 text-xs text-muted-foreground">{note}</p>}

      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Steps: a sideways rail on phones and tablets, a list beside the panel on laptops. */}
        <nav aria-label="Intake steps" className="min-w-0 border-b border-border lg:border-b-0 lg:border-r">
          <ol
            ref={listRef}
            className="flex gap-1 overflow-x-auto p-2 [scrollbar-width:none] lg:flex-col lg:gap-0 lg:overflow-visible lg:p-3 [&::-webkit-scrollbar]:hidden"
          >
            {steps.map((s, i) => {
              const selected = i === index
              const last = i === steps.length - 1
              return (
                <li key={s.key} data-step={s.key} className="relative shrink-0 lg:shrink">
                  {/* The line joining the steps, green below a finished one (laptops only). */}
                  {!last && (
                    <span
                      aria-hidden
                      className={cn(
                        "absolute left-[25px] top-[42px] hidden h-[calc(100%-32px)] w-px lg:block",
                        s.state === "done" ? "bg-success/50" : "bg-border"
                      )}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-current={selected ? "step" : undefined}
                    className={cn(
                      "relative flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected ? "bg-muted" : "hover:bg-muted/50"
                    )}
                  >
                    <Node state={s.state} n={i + 1} />
                    <span className="min-w-0 lg:flex-1">
                      <span
                        className={cn(
                          "block whitespace-nowrap text-sm lg:truncate",
                          selected || s.state === "current" ? "font-semibold text-foreground" : "text-foreground/85",
                          s.state === "stopped" && "text-muted-foreground"
                        )}
                      >
                        {s.title}
                      </span>
                      {s.summary && (
                        <span className="hidden truncate text-xs text-muted-foreground lg:block">{s.summary}</span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>

        {/* The selected step. */}
        <section aria-live="polite" className="flex min-h-[340px] min-w-0 flex-col p-5 sm:p-6">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step.key}
              initial={reduce ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className="flex flex-1 flex-col"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium uppercase tracking-wide text-muted-foreground">
                  Step {index + 1} of {steps.length}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 font-medium",
                    step.state === "done" && "bg-success/15 text-success",
                    step.state === "current" && "bg-primary/15 text-primary",
                    step.state === "todo" && "bg-muted text-muted-foreground",
                    step.state === "waiting" && "bg-muted text-muted-foreground",
                    step.state === "failed" && "bg-destructive/15 text-destructive",
                    step.state === "stopped" && "bg-muted text-muted-foreground"
                  )}
                >
                  {STATE_LABEL[step.state]}
                </span>
                {step.state === "done" && step.summary && <span className="text-muted-foreground">{step.summary}</span>}
              </div>

              <h2 className="mt-2 font-serif text-2xl font-semibold tracking-tight text-foreground">{step.title}</h2>
              <p className="mt-1 max-w-prose text-sm text-muted-foreground">{step.description}</p>

              {step.body && <div className="mt-5">{step.body}</div>}

              <div className="mt-auto flex items-center justify-between gap-2 pt-6">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-1 text-muted-foreground"
                  disabled={index === 0}
                  onClick={() => setIndex(index - 1)}
                >
                  <ChevronLeft className="h-4 w-4" /> {index > 0 ? steps[index - 1].title : "Previous"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-1 text-muted-foreground"
                  disabled={index === steps.length - 1}
                  onClick={() => setIndex(index + 1)}
                >
                  {index < steps.length - 1 ? steps[index + 1].title : "Next"} <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          </AnimatePresence>
        </section>
      </div>
    </div>
  )
}
