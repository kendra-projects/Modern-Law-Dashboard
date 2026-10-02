"use client"

import type * as React from "react"
import type { LucideIcon } from "lucide-react"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Sparkline } from "@/components/charts/success-radial"
import { cn } from "@/lib/utils"

export interface KpiCardProps {
  label: string
  value: React.ReactNode
  icon: LucideIcon
  spark?: { v: number }[]
  sparkColor?: string
  delta?: number
  hint?: string
  tone?: "primary" | "accent" | "success" | "warning" | "destructive"
}

const toneRing: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  primary: "text-primary bg-primary/12",
  accent: "text-accent bg-accent/12",
  success: "text-success bg-success/12",
  warning: "text-warning bg-warning/12",
  destructive: "text-destructive bg-destructive/12",
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  spark,
  sparkColor,
  delta,
  hint,
  tone = "primary",
}: KpiCardProps) {
  return (
    <Card className="card-hover flex h-full flex-col overflow-hidden p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium leading-snug text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 truncate font-serif text-3xl font-bold tracking-tight text-foreground">
            {value}
          </p>
        </div>
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            toneRing[tone]
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 pt-3">
        <div className="flex items-center gap-1.5 text-xs">
          {typeof delta === "number" && (
            <span
              className={cn(
                "flex items-center gap-0.5 font-medium",
                delta >= 0 ? "text-success" : "text-destructive"
              )}
            >
              {delta >= 0 ? (
                <ArrowUpRight className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5" />
              )}
              {Math.abs(delta)}%
            </span>
          )}
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </div>
        {spark && spark.length > 1 && (
          <div className="h-10 w-24 shrink-0">
            <Sparkline data={spark} color={sparkColor} />
          </div>
        )}
      </div>
    </Card>
  )
}
