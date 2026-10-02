"use client"

import * as React from "react"
import { motion, useInView } from "framer-motion"
import {
  UploadCloud,
  Database,
  BrainCircuit,
  Send,
  Check,
  FileEdit,
  X,
  Loader2,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { IntakeStatus } from "@/types/database"
import type { LifecycleStatus } from "@/lib/status"

type StepState = "done" | "active" | "drafted" | "failed" | "pending"

interface Step {
  key: string
  label: string
  sublabel: string
  icon: LucideIcon
  state: StepState
}

function buildSteps(
  intakeStatus: IntakeStatus,
  lifecycle: LifecycleStatus,
  hasEpisode: boolean
): Step[] {
  // Step 1 — file landed in the browser and the intake row exists: always done
  // the moment there is an upload to show.
  const uploaded: StepState = "done"

  // Step 2 — the Supabase row insert IS the trigger (Watch Events fires
  // instantly), so as soon as the intake row exists this is done too.
  const savedAndTriggered: StepState = "done"

  // Step 3 — Make.com transcribing / writing the blog.
  let processing: StepState
  if (intakeStatus === "failed") processing = "failed"
  else if (intakeStatus === "completed" || hasEpisode) processing = "done"
  else if (intakeStatus === "processing") processing = "active"
  else processing = "active" // "pending" — queued, Make.com picking it up

  // Step 4 — publishing out to WordPress / socials. "Drafted" is deliberately
  // NOT the same as "done": the socials are live but the blog is still
  // sitting as a WordPress draft awaiting a human publish, so it gets its own
  // in-between color (matches the "Drafted" status badge everywhere else)
  // instead of reading as fully finished.
  let publishing: StepState
  if (lifecycle === "failed") publishing = "failed"
  else if (lifecycle === "published") publishing = "done"
  else if (lifecycle === "drafted") publishing = "drafted"
  else if (hasEpisode) publishing = "active"
  else publishing = "pending"

  const publishSublabel: Record<StepState, string> = {
    done: "Live everywhere",
    drafted: "Draft awaiting publish",
    active: "WordPress + social",
    failed: "Publish failed",
    pending: "WordPress + social",
  }

  return [
    {
      key: "upload",
      label: "Uploaded",
      sublabel: "File received",
      icon: UploadCloud,
      state: uploaded,
    },
    {
      key: "supabase",
      label: "Saved to Supabase",
      sublabel: "Trigger fired",
      icon: Database,
      state: savedAndTriggered,
    },
    {
      key: "make",
      label: "Make.com processing",
      sublabel:
        processing === "active" ? "Transcribing + writing" : "AI pipeline",
      icon: BrainCircuit,
      state: processing,
    },
    {
      key: "publish",
      label: "Publishing",
      sublabel: publishSublabel[publishing],
      icon: publishing === "drafted" ? FileEdit : Send,
      state: publishing,
    },
  ]
}

// Each theme paints this pipeline in ITS OWN two signature colours rather than
// one fixed green/amber scheme shared by all three:
//   Executive Light → deep teal done  · amber in-progress
//   Modern Dark     → bright cyan done · amber in-progress
//   Luxury Evening  → gold done        · teal in-progress
// `primary` and `accent` swap warm/cool between the themes, which is exactly
// what makes the three pipelines look different from one another.
//
// `active` and `drafted` can share `accent` safely: step 4 only reads "drafted"
// once steps 1-3 are done, so a spinner and a draft check never sit side by
// side — the icon tells them apart.
const STATE_STYLES: Record<
  StepState,
  { box: string; icon: LucideIcon | null; connector: string; badge: string }
> = {
  done: {
    box: "border-primary/40 bg-primary/10 text-primary",
    icon: Check,
    connector: "bg-primary",
    badge: "bg-primary text-primary-foreground",
  },
  active: {
    box: "border-accent/50 bg-accent/10 text-accent",
    icon: Loader2,
    connector: "bg-border",
    badge: "bg-accent text-accent-foreground",
  },
  drafted: {
    box: "border-accent/40 bg-accent/10 text-accent",
    icon: Check,
    connector: "bg-accent",
    badge: "bg-accent text-accent-foreground",
  },
  failed: {
    box: "border-destructive/40 bg-destructive/10 text-destructive",
    icon: X,
    connector: "bg-border",
    badge: "bg-destructive text-destructive-foreground",
  },
  pending: {
    box: "border-border bg-muted/30 text-muted-foreground",
    icon: null,
    connector: "bg-border",
    badge: "",
  },
}

export function UploadPipeline({
  fileName,
  intakeStatus,
  lifecycle,
  hasEpisode,
  compact = false,
}: {
  fileName: string
  intakeStatus: IntakeStatus
  lifecycle: LifecycleStatus
  hasEpisode: boolean
  /** Always stacks vertically (ignores the md:flex-row breakpoint) and uses
   * tighter spacing — for embedding in a narrower column, e.g. the Overview
   * page, where the viewport is wide but the slot isn't. */
  compact?: boolean
}) {
  const steps = buildSteps(intakeStatus, lifecycle, hasEpisode)
  // Steps pop in one after another and the links between finished steps fill,
  // the first time the graph scrolls into view.
  const ref = React.useRef<HTMLDivElement>(null)
  const play = useInView(ref, { once: true, amount: 0.4 })

  return (
    <div ref={ref} className="rounded-xl border border-border bg-card/60 p-4">
      <p className="mb-3 truncate text-xs text-muted-foreground">
        Live pipeline ·{" "}
        <span className="font-medium text-foreground">{fileName}</span>
      </p>
      <div
        className={cn(
          "flex flex-col items-stretch gap-3",
          !compact && "md:flex-row md:items-center"
        )}
      >
        {steps.map((step, i) => {
          const style = STATE_STYLES[step.state]
          const StatusIcon = style.icon
          const Icon = step.icon
          return (
            <div
              key={step.key}
              className={cn(
                "flex flex-1 items-center gap-3",
                !compact && "md:contents"
              )}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.85 }}
                animate={play ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.85 }}
                transition={{ delay: 0.15 * i, type: "spring", stiffness: 300, damping: 22 }}
                className={cn(
                  // basis-0 + min-w-0 keeps all four steps exactly equal width:
                  // without them a longer sublabel sets the box's min-content
                  // width and pushes the row out past the card.
                  "flex min-w-0 flex-1 basis-0 items-center gap-3 rounded-lg border p-3 transition-colors",
                  !compact && "md:flex-col md:text-center",
                  style.box
                )}
              >
                <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background/60">
                  <Icon className="h-4 w-4" />
                  {StatusIcon && (
                    <span
                      className={cn(
                        "absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full",
                        style.badge
                      )}
                    >
                      <StatusIcon
                        className={cn(
                          "h-2.5 w-2.5",
                          step.state === "active" && "animate-spin"
                        )}
                      />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold leading-tight">
                    {step.label}
                  </div>
                  <div className="text-[11px] leading-tight opacity-80">
                    {step.sublabel}
                  </div>
                </div>
              </motion.div>

              {i < steps.length - 1 && (
                <div
                  className={cn(
                    "relative shrink-0 overflow-hidden bg-border",
                    compact ? "hidden" : "hidden h-px w-6 md:block"
                  )}
                >
                  {step.state === "done" && (
                    <motion.span
                      className={cn("absolute inset-0 origin-left", style.connector)}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: play ? 1 : 0 }}
                      transition={{ delay: 0.15 * i + 0.2, duration: 0.4, ease: "easeOut" }}
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
