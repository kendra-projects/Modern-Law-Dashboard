"use client"

import * as React from "react"

const VARS = [
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
  "--primary",
  "--accent",
  "--success",
  "--destructive",
  "--warning",
  "--muted-foreground",
  "--border",
  "--foreground",
  "--card",
] as const

type VarKey = (typeof VARS)[number]

function read(): Record<VarKey, string> {
  if (typeof window === "undefined") {
    return Object.fromEntries(VARS.map((v) => [v, "#888"])) as Record<
      VarKey,
      string
    >
  }
  const cs = getComputedStyle(document.documentElement)
  const out = {} as Record<VarKey, string>
  for (const v of VARS) {
    const triad = cs.getPropertyValue(v).trim()
    out[v] = triad ? `hsl(${triad})` : "#888"
  }
  return out
}

const FALLBACK = Object.fromEntries(VARS.map((v) => [v, "#888"])) as Record<
  VarKey,
  string
>

/** Reads theme CSS variables as resolved hsl() strings and re-reads on theme change. */
export function useChartColors() {
  // Start from a stable fallback so SSR and the first client render match,
  // then swap in the real theme colors after mount (avoids hydration mismatch).
  const [colors, setColors] = React.useState<Record<VarKey, string>>(FALLBACK)

  React.useEffect(() => {
    setColors(read())
    const target = document.documentElement
    const obs = new MutationObserver(() => setColors(read()))
    obs.observe(target, { attributes: true, attributeFilter: ["data-theme"] })
    return () => obs.disconnect()
  }, [])

  return {
    series: [
      colors["--chart-1"],
      colors["--chart-2"],
      colors["--chart-3"],
      colors["--chart-4"],
      colors["--chart-5"],
    ],
    primary: colors["--primary"],
    accent: colors["--accent"],
    success: colors["--success"],
    destructive: colors["--destructive"],
    warning: colors["--warning"],
    muted: colors["--muted-foreground"],
    border: colors["--border"],
    foreground: colors["--foreground"],
    card: colors["--card"],
  }
}
