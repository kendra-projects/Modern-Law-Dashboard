"use client"

import * as React from "react"
import { CalendarRange } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

/**
 * "How far back" filter, shared by the Archive, Blogs and Recovery lists.
 *
 * One component rather than three copies so the options, the wording and the
 * cutoff arithmetic cannot drift apart between pages — a "Last 30 days" that
 * means something different on two screens is worse than no filter at all.
 */

const RANGES = [
  { value: "all", label: "All time" },
  { value: "1h", label: "Last 1 hour" },
  { value: "24h", label: "Last 24 hours" },
  { value: "3", label: "Last 3 days" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
] as const

/** The oldest date still allowed, or null when everything is kept. */
export function useCutoff(range: string): Date | null {
  return React.useMemo(() => {
    if (!range || range === "all") return null
    const d = new Date()
    // Hour-scale ranges ("1h", "24h") sit below a single day, so they cannot be
    // expressed as whole days — subtract hours instead.
    if (range.endsWith("h")) {
      const hours = Number(range.slice(0, -1))
      if (!hours) return null
      d.setHours(d.getHours() - hours)
      return d
    }
    const days = Number(range)
    if (!days) return null
    d.setDate(d.getDate() - days)
    return d
  }, [range])
}

/** A row with no date at all is dropped by any range other than "all time". */
export function withinRange(
  date: string | null | undefined,
  cutoff: Date | null
): boolean {
  if (!cutoff) return true
  if (!date) return false
  return new Date(date) >= cutoff
}

export function TimeRangeSelect({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("w-full", className)}>
        <CalendarRange className="h-4 w-4 shrink-0 text-muted-foreground" />
        <SelectValue placeholder="Time" />
      </SelectTrigger>
      <SelectContent>
        {RANGES.map((r) => (
          <SelectItem key={r.value} value={r.value}>
            {r.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
