import type { LucideIcon } from "lucide-react"
import { LeadWorkspace, type WorkspaceStep } from "@/components/intake/lead-workspace"
import { LeadActivity, type ActivityRow } from "@/components/intake/lead-activity"

// The lead page's layout, given everything already worked out: who the client
// is, the intake steps and the log. The page builds the data; this only
// arranges it.

export type LeadFact = { icon: LucideIcon; text: string; href?: string }
export type FileGroup = { title: string; fields: [string, string | null][] }

/** Step 1's panel: the booking as the client gave it. */
export function BookingDetails({ groups, description }: { groups: FileGroup[]; description: string | null }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => (
          <div key={g.title} className="min-w-0">
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{g.title}</h3>
            <dl className="space-y-2">
              {g.fields.map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="text-sm text-foreground [overflow-wrap:anywhere]">{value ?? "—"}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      {description && (
        <div className="rounded-lg bg-muted/30 px-4 py-3">
          <h3 className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Why they booked</h3>
          <p className="max-w-prose whitespace-pre-wrap text-sm leading-relaxed text-foreground">{description}</p>
        </div>
      )}
    </div>
  )
}

export function LeadView({
  name,
  status,
  facts,
  steps,
  note,
  activity,
}: {
  name: string
  status: string
  facts: LeadFact[]
  steps: WorkspaceStep[]
  note?: string
  activity: ActivityRow[]
}) {
  const done = steps.filter((s) => s.state === "done").length
  const pct = Math.round((done / steps.length) * 100)

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">{name}</h1>
            <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium capitalize text-muted-foreground">
              {status}
            </span>
          </div>
          {facts.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
              {facts.map((f) => (
                <li key={f.text} className="inline-flex min-w-0 items-center gap-1.5">
                  <f.icon aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {f.href ? (
                    <a href={f.href} className="truncate text-foreground/90 underline-offset-2 hover:text-primary hover:underline">
                      {f.text}
                    </a>
                  ) : (
                    <span className="truncate text-foreground/90">{f.text}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Where the intake stands, as a determinate progress bar. */}
        <div className="w-full sm:w-56">
          <div className="mb-1.5 flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">Intake progress</span>
            <span className="font-medium tabular-nums text-foreground">
              {done} of {steps.length} done
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={steps.length}
            aria-valuenow={done}
            aria-label="Intake progress"
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div className="h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </header>

      <LeadWorkspace steps={steps} note={note} />

      <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Activity</h2>
        <LeadActivity rows={activity} />
      </section>
    </div>
  )
}
