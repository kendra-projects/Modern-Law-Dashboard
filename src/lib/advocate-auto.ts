import "server-only"

import { clioFetch, clioStatus } from "@/lib/clio"
import { ADVOCATES, ADVOCATE_CLIO_NAMES, isAdvocate } from "@/lib/intake"
import { logStep } from "@/lib/intake-step-log"
import { emailNoAdvocate } from "@/lib/team-alerts"
import { slackConfigured, slackStatuses } from "@/lib/slack"
import { createAdminClient } from "@/lib/supabase/admin"
import type { IntakeLead } from "@/types/database"

// The advocate for a booking nobody was assigned to (the client booked it, or
// Acuity says "Client" or "Other"): whoever is free. Free means at work on
// the next workday (no out-of-office status in Slack, and no "Out of office"
// or "CLOSED" entry on their Clio calendar for half the day or more) and, of
// those, the one with the fewest open consults ahead. A tie goes to whoever
// had fewer bookings in the last 7 days, then to the order of ADVOCATES.
//
// ADVOCATE_AUTO=on turns it on (the firm's call, Oct 2026), for bookings made
// from ADVOCATE_AUTO_FROM, once the conflict check is clear. It runs as part of
// the automatic intake, so the portal invite, the Slack post and the tasks
// follow straight away. An advocate named in Acuity or picked on the lead page
// is never replaced, and staff can change this one on the lead page.

export const advocateAutoOn = () => (process.env.ADVOCATE_AUTO ?? "").trim().toLowerCase() === "on"
const advocateAutoFrom = () => process.env.ADVOCATE_AUTO_FROM?.trim() || "2026-10-15T07:00:00Z"

type Admin = NonNullable<ReturnType<typeof createAdminClient>>
type Lead = Pick<IntakeLead, "id" | "source" | "created_at" | "status" | "conflict_status" | "consult_datetime" | "assigned_advocate">

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
// Arizona keeps MST all year: the workday is 8am to 5pm, UTC-7.
const OFFSET = 7 * HOUR
const WORK_START = 8 * HOUR
const WORK_END = 17 * HOUR
const WORKDAY = WORK_END - WORK_START
const LOOK_AHEAD = 7

const OUT_EVENT = /out of (the )?office|\bo\.?o\.?o\b|\bpto\b|vacation|\bsick\b|day off|time off|\bon leave\b|\bclosed\b|holiday/i
const OUT_STATUS = /\bout\b|\bo\.?o\.?o\b|\bpto\b|vacation|\bsick\b|day off|time off|\bleave\b|holiday/i

/** The next workdays from now (today while it's before 5pm on a weekday), as [start, end] in ms. */
function workdays(now = Date.now()) {
  const days: { label: string; start: number; end: number }[] = []
  let midnight = Math.floor((now - OFFSET) / DAY) * DAY + OFFSET
  while (days.length < LOOK_AHEAD) {
    const weekday = new Date(midnight - OFFSET).getUTCDay()
    const end = midnight + WORK_END
    if (weekday !== 0 && weekday !== 6 && end > now) {
      days.push({
        label: new Intl.DateTimeFormat("en-US", { timeZone: "America/Phoenix", weekday: "short", month: "short", day: "numeric" }).format(new Date(end)),
        start: midnight + WORK_START,
        end,
      })
    }
    midnight += DAY
  }
  return days
}

/** How much of [start, end] the intervals cover, overlaps counted once. */
function covered(intervals: [number, number][], start: number, end: number) {
  const parts = intervals
    .map(([a, b]) => [Math.max(a, start), Math.min(b, end)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0])
  let total = 0
  let reach = start
  for (const [a, b] of parts) {
    if (b <= reach) continue
    total += b - Math.max(a, reach)
    reach = b
  }
  return total
}

type Entry = { summary?: string | null; start_at?: string | null; end_at?: string | null; calendar_owner?: { id: number } | null }

// Several bookings picked in a row read the same calendars: keep them a few
// minutes (Clio allows 50 calendar requests a minute).
let awayCache: { key: string; at: number; away: Record<string, [number, number][]> } | null = null
const AWAY_TTL = 10 * 60 * 1000

/** Each advocate's out-of-office time on their own Clio calendar, between `from` and `to`. */
async function outOfOffice(names: string[], from: number, to: number): Promise<Record<string, [number, number][]>> {
  const key = `${names.join(",")}:${from}:${to}`
  if (awayCache?.key === key && Date.now() - awayCache.at < AWAY_TTL) return awayCache.away
  const out: Record<string, [number, number][]> = {}
  const cals = await clioFetch<{ data: { id: number; name: string; type: string }[] }>(`/api/v4/calendars?fields=id,name,type&limit=200`)
  for (const name of names) {
    const cal = cals.data.find((c) => c.type === "UserCalendar" && c.name.trim().toLowerCase() === (ADVOCATE_CLIO_NAMES[name] ?? name).toLowerCase())
    if (!cal) continue
    const fields = encodeURIComponent("summary,start_at,end_at,calendar_owner{id}")
    let next: string | null =
      `/api/v4/calendar_entries?calendar_id=${cal.id}&expanded=true&from=${encodeURIComponent(new Date(from).toISOString())}` +
      `&to=${encodeURIComponent(new Date(to).toISOString())}&fields=${fields}&limit=200`
    const spans: [number, number][] = []
    for (let page = 0; next && page < 3; page++) {
      const r: { data: Entry[]; meta?: { paging?: { next?: string } } } = await clioFetch(next)
      for (const e of r.data) {
        if (e.calendar_owner?.id !== cal.id || !e.start_at || !e.end_at || !OUT_EVENT.test(e.summary ?? "")) continue
        spans.push([Date.parse(e.start_at), Date.parse(e.end_at)])
      }
      next = r.meta?.paging?.next ? r.meta.paging.next.replace(/^https:\/\/[^/]+/, "") : null
    }
    out[name] = spans
  }
  awayCache = { key, at: Date.now(), away: out }
  return out
}

export type AdvocatePick = { advocate: string | null; why: string }

/** Who is free for a new booking, and why. Reads Clio, Slack and the dashboard's leads; changes nothing. */
export async function pickAdvocate(admin: Admin, now = Date.now()): Promise<AdvocatePick> {
  const pool = [...ADVOCATES] as string[]
  const days = workdays(now)

  // Open consults ahead, and bookings in the last 7 days, per advocate.
  const { data: rows } = await admin
    .from("intake_leads")
    .select("assigned_advocate, consult_datetime, created_at")
    .in("assigned_advocate", pool)
    .not("status", "in", "(canceled,stopped,failed)")
    .or(`consult_datetime.gt.${new Date(now).toISOString()},created_at.gte.${new Date(now - 7 * DAY).toISOString()}`)
  const ahead: Record<string, number> = Object.fromEntries(pool.map((a) => [a, 0]))
  const recent: Record<string, number> = Object.fromEntries(pool.map((a) => [a, 0]))
  for (const r of rows ?? []) {
    const a = r.assigned_advocate as string
    if (r.consult_datetime && Date.parse(r.consult_datetime) > now) ahead[a]++
    if (Date.parse(r.created_at) >= now - 7 * DAY) recent[a]++
  }

  // Who is out: a Slack status counts until it clears; the Clio calendar for each day.
  const status: Awaited<ReturnType<typeof slackStatuses>> = slackConfigured()
    ? await slackStatuses(pool.map((a) => ADVOCATE_CLIO_NAMES[a] ?? a)).catch(() => ({}))
    : {}
  const away = await outOfOffice(pool, days[0].start, days[days.length - 1].end)

  for (const day of days) {
    const skipped: string[] = []
    const free = pool.filter((a) => {
      const s = status[ADVOCATE_CLIO_NAMES[a] ?? a]
      if (s && OUT_STATUS.test(s.text) && !/lunch/i.test(s.text) && (s.expires === 0 || s.expires * 1000 > day.start + WORKDAY / 2)) {
        skipped.push(`${a} (Slack: "${s.text}")`)
        return false
      }
      if (covered(away[a] ?? [], day.start, day.end) >= WORKDAY / 2) {
        skipped.push(`${a} (out of office on ${day.label} in Clio)`)
        return false
      }
      return true
    })
    if (!free.length) continue
    free.sort((x, y) => ahead[x] - ahead[y] || recent[x] - recent[y] || pool.indexOf(x) - pool.indexOf(y))
    const pick = free[0]
    const load = free.map((a) => `${a} ${ahead[a]}`).join(", ")
    return {
      advocate: pick,
      why:
        `Free on ${day.label} with the fewest open consults (${load}).` +
        (skipped.length ? ` Not counted: ${skipped.join("; ")}.` : ""),
    }
  }
  return { advocate: null, why: `No advocate is free in the next ${LOOK_AHEAD} workdays by Slack and the Clio calendars.` }
}

/**
 * Assign the free advocate to a booking that has none, once its conflict
 * check is clear. Returns the advocate, or null when it didn't assign.
 */
export async function autoAssignAdvocate(admin: Admin, lead: Lead): Promise<string | null> {
  if (!advocateAutoOn() || lead.source !== "acuity" || isAdvocate(lead.assigned_advocate)) return null
  if (lead.conflict_status !== "clear" || ["canceled", "stopped", "failed", "done"].includes(lead.status)) return null
  if (Date.parse(lead.created_at) < Date.parse(advocateAutoFrom())) return null
  if (!lead.consult_datetime || Date.parse(lead.consult_datetime) <= Date.now()) return null
  if (!(await clioStatus()).connected) return null

  const pick = await pickAdvocate(admin)
  if (!pick.advocate) {
    await logStep(admin, { lead_id: lead.id, step_key: "advocate_auto", state: "pending", detail: { by: "Automatic", why: pick.why } })
    await emailNoAdvocate(admin, lead.id, pick.why ?? null).catch(() => false)
    return null
  }
  // Only while nobody has named an advocate in the meantime.
  const { data } = await admin
    .from("intake_leads")
    .update({ assigned_advocate: pick.advocate })
    .eq("id", lead.id)
    .or(`assigned_advocate.is.null,assigned_advocate.not.in.(${ADVOCATES.join(",")})`)
    .select("id")
  if (!data?.length) return null
  await logStep(admin, {
    lead_id: lead.id,
    step_key: "advocate_assigned",
    state: "done",
    detail: { advocate: pick.advocate, by: "Automatic", why: pick.why, booked_as: lead.assigned_advocate ?? null },
  })
  await admin.from("intake_steps").delete().eq("lead_id", lead.id).eq("step_key", "advocate_auto")
  return pick.advocate
}
