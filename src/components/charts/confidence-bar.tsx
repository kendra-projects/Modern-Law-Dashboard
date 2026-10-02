"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { useChartColors } from "./use-chart-colors"
import { ChartTooltip } from "./chart-tooltip"
import type { ConfidenceBar as ConfidenceBarData } from "@/lib/kpis"

export function ConfidenceBarChart({ data }: { data: ConfidenceBarData[] }) {
  const c = useChartColors()

  const colorFor = (v: number) =>
    v >= 90 ? c.success : v >= 80 ? c.primary : v >= 70 ? c.warning : c.destructive

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 44)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 28, left: 8, bottom: 4 }}
        barCategoryGap={12}
      >
        <CartesianGrid
          horizontal={false}
          strokeDasharray="3 3"
          stroke={c.border}
        />
        <XAxis
          type="number"
          domain={[0, 100]}
          tick={{ fill: c.muted, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={150}
          tick={{ fill: c.muted, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<ChartTooltip suffix="%" />} cursor={{ fill: c.border, opacity: 0.25 }} />
        <Bar dataKey="confidence" name="Confidence" radius={[0, 6, 6, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={colorFor(d.confidence)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
