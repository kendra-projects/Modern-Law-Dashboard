"use client"

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useChartColors } from "./use-chart-colors"
import { ChartTooltip } from "./chart-tooltip"
import type { DayPoint } from "@/lib/kpis"

export function IngestionVelocityChart({ data }: { data: DayPoint[] }) {
  const c = useChartColors()

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="gradUploads" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.primary} stopOpacity={0.45} />
            <stop offset="100%" stopColor={c.primary} stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gradProcessed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.accent} stopOpacity={0.35} />
            <stop offset="100%" stopColor={c.accent} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={c.border}
          vertical={false}
        />
        <XAxis
          dataKey="label"
          tick={{ fill: c.muted, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          minTickGap={16}
        />
        <YAxis
          tick={{ fill: c.muted, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
          width={36}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: c.border }} />
        <Area
          type="monotone"
          dataKey="uploads"
          name="Ingested"
          stroke={c.primary}
          strokeWidth={2}
          fill="url(#gradUploads)"
        />
        <Area
          type="monotone"
          dataKey="processed"
          name="Processed"
          stroke={c.accent}
          strokeWidth={2}
          fill="url(#gradProcessed)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
