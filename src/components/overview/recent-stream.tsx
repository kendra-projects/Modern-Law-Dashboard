"use client"

import Link from "next/link"
import { Video, Upload, ArrowRight } from "lucide-react"
import { StatusBadge } from "@/components/status-badge"
import { lifecycleMeta, type LifecycleStatus } from "@/lib/status"
import { timeAgo } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { IntakeSourceType } from "@/types/database"

export interface StreamItem {
  id: string
  title: string
  source_type: IntakeSourceType
  status: LifecycleStatus
  created_at: string
  /** Where clicking the row goes. */
  href: string
}

export function RecentStream({ items }: { items: StreamItem[] }) {
  return (
    // On md+ the stream takes the height of the Pipeline status column beside it
    // (h-0 + min-h-full: adds nothing to the row, then fills it) and scrolls
    // inside, so the two halves of the card end level.
    <div className="flex flex-col space-y-2 md:h-0 md:min-h-full">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          Recent ingestion stream
        </h3>
      </div>

      <div className="max-h-[360px] min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 md:max-h-none">
        {items.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No items yet.
          </p>
        )}
        {items.map((item) => {
          const Icon = item.source_type === "zoom_webhook" ? Video : Upload
          // A consultation's lifecycle is a review, not a content build — relabel
          // its badge so it reads in the attorney's language, not the pipeline's.
          const meta =
            item.source_type === "zoom_webhook"
              ? item.status === "published"
                ? { ...lifecycleMeta.published, label: "Filed" }
                : item.status === "pending"
                  ? { ...lifecycleMeta.pending, label: "Pending Review" }
                  : lifecycleMeta[item.status]
              : lifecycleMeta[item.status]
          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg border border-border bg-card/60 p-3 transition-colors hover:border-primary/40 hover:bg-muted/50"
              )}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {item.title}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.source_type === "zoom_webhook"
                    ? "Zoom consultation"
                    : "Manual upload"}{" "}
                  · {timeAgo(item.created_at)}
                </p>
              </div>
              <span className="shrink-0">
                <StatusBadge meta={meta} />
              </span>
            </Link>
          )
        })}
      </div>

      <Link
        href="/archive"
        className="flex items-center justify-center gap-1 pt-1 text-xs font-medium text-primary hover:underline"
      >
        View full archive <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  )
}
