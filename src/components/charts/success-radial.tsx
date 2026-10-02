"use client"

import * as React from "react"
import {
  Area,
  AreaChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
} from "recharts"
import { useChartColors } from "./use-chart-colors"

export function SuccessRadial({ value }: { value: number }) {
  const c = useChartColors()
  const fill =
    value >= 90 ? c.success : value >= 75 ? c.primary : value >= 50 ? c.warning : c.destructive
  const data = [{ name: "success", value }]

  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={200}>
        <RadialBarChart
          data={data}
          startAngle={220}
          endAngle={-40}
          innerRadius={72}
          outerRadius={100}
          barSize={14}
        >
          <PolarAngleAxis
            type="number"
            domain={[0, 100]}
            angleAxisId={0}
            tick={false}
          />
          <RadialBar
            background={{ fill: c.border }}
            dataKey="value"
            cornerRadius={12}
            fill={fill}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-foreground">{value}%</span>
        <span className="text-xs text-muted-foreground">Success rate</span>
      </div>
    </div>
  )
}

export function Sparkline({
  data,
  color,
}: {
  data: { v: number }[]
  color?: string
}) {
  const c = useChartColors()
  const stroke = color ?? c.primary
  const id = React.useId().replace(/:/g, "")

  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.4} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={stroke}
          strokeWidth={1.75}
          fill={`url(#spark-${id})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
