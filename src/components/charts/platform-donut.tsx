"use client"

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import { useChartColors } from "./use-chart-colors"
import { ChartTooltip } from "./chart-tooltip"
import type { PlatformSlice } from "@/lib/kpis"

export function PlatformDonut({ data }: { data: PlatformSlice[] }) {
  const c = useChartColors()
  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Tooltip content={<ChartTooltip />} />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={64}
            outerRadius={98}
            paddingAngle={3}
            stroke={c.card}
            strokeWidth={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={c.series[i % c.series.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-foreground">{total}</span>
        <span className="text-xs text-muted-foreground">Published</span>
      </div>
    </div>
  )
}

// CSS-variable strings are deterministic across SSR/CSR and theme-reactive,
// so the legend dots never trigger a hydration mismatch.
const CHART_VARS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
]

export function PlatformLegend({ data }: { data: PlatformSlice[] }) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
      {data.map((slice, i) => (
        <div key={slice.key} className="flex items-center gap-2 text-sm">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: CHART_VARS[i % CHART_VARS.length] }}
          />
          <span className="text-muted-foreground">{slice.name}</span>
          <span className="ml-auto font-semibold text-foreground">
            {slice.value}
          </span>
        </div>
      ))}
    </div>
  )
}
