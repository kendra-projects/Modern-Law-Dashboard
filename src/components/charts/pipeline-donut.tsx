"use client"

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import { useChartColors } from "./use-chart-colors"
import { ChartTooltip } from "./chart-tooltip"
import type { LifecycleStatus } from "@/lib/status"

export interface PipelineSlice {
  key: LifecycleStatus
  name: string
  value: number
}

/** CSS variable per stage — the single source of truth for both the donut
 * slices and the legend dots, so a colour can never drift between them.
 *
 * `processing` deliberately uses `--chart-3` rather than the `--warning` that
 * `lifecycleMeta` gives its badge: in Modern Dark `--warning` and `--accent`
 * are the SAME amber, which is harmless on two separate badges but would make
 * the Processing and Drafted slices — the two biggest — indistinguishable in
 * one ring. `--chart-3` is cool in Light/Dark and burnt orange in Evening, so
 * all five stages stay separable in every theme. Published stays green, Failed
 * red and Pending grey, so the semantics still read at a glance. */
export const STAGE_VAR: Record<LifecycleStatus, string> = {
  pending: "--muted-foreground",
  processing: "--chart-3",
  drafted: "--accent",
  published: "--success",
  failed: "--destructive",
}

export function PipelineDonut({ data }: { data: PipelineSlice[] }) {
  const c = useChartColors()
  const total = data.reduce((sum, d) => sum + d.value, 0)

  const fill: Record<LifecycleStatus, string> = {
    pending: c.muted,
    processing: c.series[2],
    drafted: c.accent,
    published: c.success,
    failed: c.destructive,
  }

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Tooltip content={<ChartTooltip />} />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={80}
            paddingAngle={3}
            stroke={c.card}
            strokeWidth={2}
          >
            {data.map((slice) => (
              <Cell key={slice.key} fill={fill[slice.key]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-foreground">{total}</span>
        <span className="text-xs text-muted-foreground">
          {total === 1 ? "intake" : "intakes"}
        </span>
      </div>
    </div>
  )
}
