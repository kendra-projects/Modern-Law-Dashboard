import Link from "next/link"
import { CalendarDays, Video, ArrowUpRight } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import type { Appointment } from "@/types/database"
import { cn } from "@/lib/utils"
import { AppointmentsListSkeleton } from "@/components/intake/intake-skeletons"
import {
  FilterTransition,
  FilterLink,
  FilterForm,
  PendingArea,
} from "@/components/intake/filter-transition"

export const dynamic = "force-dynamic"

// The whole Acuity schedule, mirrored by the intake webhook: consults, existing
// clients' follow-ups and internal meetings. It's reference/history, not a work
// queue; only consultations become intake leads (linked from here).

const TZ = "America/Phoenix"
type View = "upcoming" | "past"
type Kind = "all" | "consult" | "followup" | "other"

const KINDS: { key: Kind; label: string }[] = [
  { key: "all", label: "All" },
  { key: "consult", label: "Consults" },
  { key: "followup", label: "Follow-ups" },
  { key: "other", label: "Other" },
]

function kindOf(a: Appointment): Exclude<Kind, "all"> {
  if (a.is_consult) return "consult"
  if (/follow[\s-]?up/i.test(a.type ?? "")) return "followup"
  return "other"
}

const KIND_PILL: Record<Exclude<Kind, "all">, { label: string; cls: string }> = {
  consult: { label: "Consult", cls: "bg-primary/15 text-primary" },
  followup: { label: "Follow-up", cls: "bg-secondary text-secondary-foreground" },
  other: { label: "Other", cls: "bg-muted text-muted-foreground" },
}

function dayKey(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso))
}
function dayLabel(iso: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(iso))
}
function time(iso: string | null) {
  if (!iso) return ""
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso))
}
function zoomLink(loc: string | null) {
  return loc?.match(/https?:\/\/[^\s]*zoom\.us\/[^\s]*/i)?.[0] ?? null
}
/** Midnight today in Arizona, as an ISO instant (Arizona has no DST: UTC-7). */
function startOfTodayAZ() {
  const [y, m, d] = dayKey(new Date().toISOString()).split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d, 7)).toISOString()
}

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: { view?: string; kind?: string; attorney?: string }
}) {
  const view: View = searchParams.view === "past" ? "past" : "upcoming"
  const kind: Kind = (["consult", "followup", "other"] as const).includes(searchParams.kind as never)
    ? (searchParams.kind as Kind)
    : "all"
  const attorney = searchParams.attorney?.trim() || ""

  const supabase = await createClient()
  const today = startOfTodayAZ()

  const COLS =
    "id, acuity_id, datetime, end_time, duration_min, type, category, calendar, attorney, client_first, client_last, email, phone, location, canceled, is_consult, lead_id"
  let q = supabase.from("appointments").select(COLS)
  q = view === "upcoming"
    ? q.gte("datetime", today).order("datetime", { ascending: true })
    : q.lt("datetime", today).order("datetime", { ascending: false })
  if (kind === "consult") q = q.eq("is_consult", true)
  if (kind === "followup") q = q.eq("is_consult", false).ilike("type", "%follow%")
  if (kind === "other") q = q.eq("is_consult", false).not("type", "ilike", "%follow%")
  if (attorney) q = q.eq("attorney", attorney)
  const { data } = await q.limit(400)
  const rows = (data ?? []).filter((a) => a.datetime) as unknown as (Appointment & { datetime: string })[]

  const { data: atts } = await supabase.from("appointments").select("attorney").not("attorney", "is", null).limit(3000)
  const attorneys = Array.from(new Set((atts ?? []).map((a) => a.attorney as string))).sort()

  const days: { key: string; label: string; items: typeof rows }[] = []
  for (const a of rows) {
    const k = dayKey(a.datetime)
    let g = days.find((d) => d.key === k)
    if (!g) days.push((g = { key: k, label: dayLabel(a.datetime), items: [] }))
    g.items.push(a)
  }

  const href = (p: Partial<{ view: View; kind: Kind; attorney: string }>) => {
    const s = new URLSearchParams()
    const v = p.view ?? view
    const k = p.kind ?? kind
    const at = p.attorney ?? attorney
    if (v !== "upcoming") s.set("view", v)
    if (k !== "all") s.set("kind", k)
    if (at) s.set("attorney", at)
    const qs = s.toString()
    return `/intake/appointments${qs ? `?${qs}` : ""}`
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight text-foreground">Appointments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every Acuity appointment for reference: consults, follow-ups and meetings. Only
          consultations become intake leads. Times are Arizona time.
        </p>
      </div>

      <FilterTransition>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {(["upcoming", "past"] as View[]).map((v) => (
            <FilterLink
              key={v}
              href={href({ view: v })}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm capitalize transition-colors",
                view === v ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {v}
            </FilterLink>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <FilterLink
              key={k.key}
              href={href({ kind: k.key })}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                kind === k.key
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {k.label}
            </FilterLink>
          ))}
        </div>
        <FilterForm action="/intake/appointments" className="ml-auto flex items-center gap-2">
          {view !== "upcoming" && <input type="hidden" name="view" value={view} />}
          {kind !== "all" && <input type="hidden" name="kind" value={kind} />}
          <select
            key={attorney}
            id="attorney"
            name="attorney"
            defaultValue={attorney}
            className="h-9 rounded-md border border-border bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All attorneys</option>
            {attorneys.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </FilterForm>
      </div>

      <PendingArea fallback={<AppointmentsListSkeleton />}>
      {days.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center">
          <CalendarDays className="h-8 w-8 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium text-foreground">No appointments here</p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Try another filter. New bookings, reschedules and cancellations in Acuity show up
            here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {days.map((d) => (
            <section key={d.key}>
              <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-foreground">
                {d.label}
                <span className="text-xs font-normal text-muted-foreground">
                  {d.items.length} appointment{d.items.length === 1 ? "" : "s"}
                </span>
              </h2>
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <ul className="divide-y divide-border/60">
                  {d.items.map((a) => {
                    const k = kindOf(a)
                    // Join only while the meeting is still ahead or in progress.
                    const endsAt = a.end_time
                      ? new Date(a.end_time).getTime()
                      : new Date(a.datetime).getTime() + 60 * 60000
                    const zoom = a.canceled || endsAt < Date.now() ? null : zoomLink(a.location)
                    const name = [a.client_first, a.client_last].filter(Boolean).join(" ") || "Unnamed"
                    return (
                      <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 text-sm">
                        <span className="w-40 shrink-0 whitespace-nowrap tabular-nums text-muted-foreground">
                          {time(a.datetime)}
                          {a.end_time ? ` to ${time(a.end_time)}` : ""}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn("block truncate font-medium text-foreground", a.canceled && "line-through opacity-60")}>
                            {name}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {a.type}
                            {a.attorney && (
                              <>
                                {" · "}
                                <FilterLink
                                  href={href({ attorney: a.attorney })}
                                  className="underline-offset-2 hover:text-foreground hover:underline"
                                >
                                  {a.attorney}
                                </FilterLink>
                              </>
                            )}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", KIND_PILL[k].cls)}>
                            {KIND_PILL[k].label}
                          </span>
                          {a.canceled && (
                            <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
                              Canceled
                            </span>
                          )}
                          {zoom && (
                            <a
                              href={zoom}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-muted"
                            >
                              <Video className="h-3.5 w-3.5" /> Join
                            </a>
                          )}
                          {a.lead_id && (
                            <Link
                              href={`/intake/${a.lead_id}`}
                              className="inline-flex items-center gap-1 rounded-md border border-primary/40 px-2 py-1 text-xs text-primary hover:bg-primary/10"
                            >
                              Lead <ArrowUpRight className="h-3.5 w-3.5" />
                            </Link>
                          )}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </section>
          ))}
        </div>
      )}
      </PendingArea>
      </FilterTransition>
    </div>
  )
}
