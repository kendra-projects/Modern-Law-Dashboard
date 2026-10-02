"use client"

import {
  Database,
  Loader2,
  FileCheck2,
  Scale,
  Activity,
  BarChart3,
  PieChart as PieIcon,
  Gauge,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { KpiCard } from "./kpi-card"
import { Rise, CountUp, WhenVisible } from "@/components/motion/reveal"
import { RecentStream, type StreamItem } from "./recent-stream"
import {
  PipelineBreakdown,
  type StageCounts,
} from "./pipeline-breakdown"
import { IngestionVelocityChart } from "@/components/charts/ingestion-velocity"
import {
  PlatformDonut,
  PlatformLegend,
} from "@/components/charts/platform-donut"
import { SuccessRadial } from "@/components/charts/success-radial"
import type { Kpis, DayPoint, PlatformSlice } from "@/lib/kpis"

export interface OverviewData {
  kpis: Kpis
  series: DayPoint[]
  platform: PlatformSlice[]
  stream: StreamItem[]
  stageCounts: StageCounts
  sparks: {
    ingestions: { v: number }[]
    processed: { v: number }[]
  }
}

export function OverviewClient({ data }: { data: OverviewData }) {
  const { kpis } = data

  return (
    <div className="space-y-5">
      {/* KPI ROW */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <Rise i={1} className="h-full">
        <KpiCard
          label="Total Ingestions"
          value={<CountUp value={kpis.totalIngestions} />}
          icon={Database}
          tone="primary"
          spark={data.sparks.ingestions}
          hint="all-time"
        />
        </Rise>
        <Rise i={2} className="h-full">
        <KpiCard
          label="Live Processing"
          value={<CountUp value={kpis.liveProcessing} />}
          icon={Loader2}
          tone="warning"
          hint="in queue now"
        />
        </Rise>
        <Rise i={3} className="h-full">
        <KpiCard
          label="Published Posts"
          value={<CountUp value={kpis.publishedPosts} />}
          icon={FileCheck2}
          tone="success"
          spark={data.sparks.processed}
          hint="to WordPress"
        />
        </Rise>
        <Rise i={4} className="h-full">
        <KpiCard
          label="Pending Clio"
          value={<CountUp value={kpis.pendingClio} />}
          icon={Scale}
          tone="accent"
          hint="awaiting attorney"
        />
        </Rise>
        <Rise i={5} className="h-full">
        <KpiCard
          label="Success Rate"
          value={<CountUp value={kpis.successRate} suffix="%" />}
          icon={Activity}
          tone={kpis.successRate >= 85 ? "success" : "warning"}
          hint={`${kpis.retries} retries`}
        />
        </Rise>
      </div>

      {/* CHARTS GRID */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Rise i={6} className="lg:col-span-2">
        <Card className="h-full">
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <BarChart3 className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Ingestion Velocity</CardTitle>
            <span className="ml-auto text-xs text-muted-foreground">
              last 14 days
            </span>
          </CardHeader>
          <CardContent>
            <WhenVisible height={260}>
              <IngestionVelocityChart data={data.series} />
            </WhenVisible>
          </CardContent>
        </Card>
        </Rise>

        <Rise i={7}>
        <Card className="h-full">
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <PieIcon className="h-4 w-4 text-accent" />
            <CardTitle className="text-base">Platform Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {data.platform.length ? (
              <>
                <WhenVisible height={260}>
                  <PlatformDonut data={data.platform} />
                </WhenVisible>
                <PlatformLegend data={data.platform} />
              </>
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">
                No published content yet.
              </p>
            )}
          </CardContent>
        </Card>
        </Rise>
      </div>

      {/* STREAM + ANALYTICS */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Rise i={8} className="lg:col-span-2">
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <PipelineBreakdown counts={data.stageCounts} />
            <RecentStream items={data.stream} />
          </CardContent>
        </Card>
        </Rise>

        {/* Stretches to the Recent Activity card so both end level. */}
        <Rise i={9} className="h-full">
          <Card className="flex h-full flex-col">
            <CardHeader className="flex-row items-center gap-2 space-y-0">
              <Gauge className="h-4 w-4 text-success" />
              <CardTitle className="text-base">System Health</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-center">
              <WhenVisible height={200}>
                <SuccessRadial value={kpis.successRate} />
              </WhenVisible>
              <div className="mt-2 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg border border-border bg-muted/30 p-2">
                  <div className="text-lg font-bold text-warning">
                    <CountUp value={kpis.retries} />
                  </div>
                  <div className="text-xs text-muted-foreground">Retries</div>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-2">
                  <div className="text-lg font-bold text-destructive">
                    <CountUp value={kpis.errors} />
                  </div>
                  <div className="text-xs text-muted-foreground">Errors</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Rise>
      </div>
    </div>
  )
}
