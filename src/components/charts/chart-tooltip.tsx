"use client"

interface TooltipEntry {
  name?: string | number
  value?: string | number
  color?: string
}

interface ChartTooltipProps {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string | number
  suffix?: string
}

export function ChartTooltip({
  active,
  payload,
  label,
  suffix = "",
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      {label !== undefined && label !== "" && (
        <div className="mb-1 font-medium text-foreground">{label}</div>
      )}
      <div className="space-y-0.5">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-semibold text-foreground">
              {entry.value}
              {suffix}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
