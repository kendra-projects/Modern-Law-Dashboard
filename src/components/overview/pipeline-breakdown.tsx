"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import {
  PipelineDonut,
  STAGE_VAR,
  type PipelineSlice,
} from "@/components/charts/pipeline-donut"
import { lifecycleMeta, type LifecycleStatus } from "@/lib/status"
import { WhenVisible } from "@/components/motion/reveal"

export type StageCounts = Record<LifecycleStatus, number>

// Pipeline order, earliest stage first.
const ORDER: LifecycleStatus[] = [
  "pending",
  "processing",
  "drafted",
  "published",
  "failed",
]

/** Aggregate counterpart to the per-file pipeline on the Upload page: where
 * every intake currently sits, as one donut. Slice colours reuse
 * `lifecycleMeta`, so a slice matches the status badge for the same record in
 * the stream beside it. */
export function PipelineBreakdown({ counts }: { counts: StageCounts }) {
  const slices: PipelineSlice[] = ORDER.filter((key) => counts[key] > 0).map(
    (key) => ({ key, name: lifecycleMeta[key].label, value: counts[key] })
  )

  return (
    <div className="flex flex-col space-y-2">
      <h3 className="text-sm font-semibold text-foreground">Pipeline status</h3>

      {slices.length === 0 ? (
        <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center text-xs text-muted-foreground">
          Nothing in the pipeline yet.
        </p>
      ) : (
        <>
          <WhenVisible height={200}>
            <PipelineDonut data={slices} />
          </WhenVisible>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {slices.map((slice) => (
              <div key={slice.key} className="flex items-center gap-2 text-xs">
                {/* Inline CSS-var reference (not a JS-resolved colour) so the
                    dot matches its slice on the very first paint, with no
                    hydration mismatch. */}
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: `hsl(var(${STAGE_VAR[slice.key]}))` }}
                />
                <span className="truncate text-muted-foreground">
                  {slice.name}
                </span>
                <span className="ml-auto font-semibold text-foreground">
                  {slice.value}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <Link
        href="/upload"
        className="flex items-center justify-center gap-1 pt-1 text-xs font-medium text-primary hover:underline"
      >
        Upload new media <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  )
}
