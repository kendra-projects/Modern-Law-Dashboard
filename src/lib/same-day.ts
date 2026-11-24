import type { createAdminClient } from "@/lib/supabase/admin"
import { logStep } from "@/lib/intake-step-log"
import type { IntakeLead } from "@/types/database"

// A client booked twice the same day on purpose (David Khalaj, 23 Nov 2026: two
// back-to-back Limited Scope sessions, one per hour). Each booking is its own
// lead, but the client should get one text, one portal invite, one Slack post
// and one Grow matter. The first booking of the day does them; the others are
// marked as covered by it.

type Admin = NonNullable<ReturnType<typeof createAdminClient>>
type Lead = Pick<IntakeLead, "id" | "email" | "phone" | "consult_datetime" | "created_at" | "status">

export const SAME_DAY = "same_day"
/** The steps the first booking does for the whole day. */
const COVERED = ["clio_text_sent", "clio_portal_sent", "slack_posted"] as const
const CLOSED = ["canceled", "stopped", "failed"]
const TZ = "America/Phoenix"

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").slice(-10)
const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso))

function sameClient(a: Lead, b: Lead) {
  const ea = a.email?.trim().toLowerCase()
  const eb = b.email?.trim().toLowerCase()
  if (ea && ea === eb) return true
  const pa = digits(a.phone)
  return pa.length === 10 && pa === digits(b.phone)
}

/**
 * The booking that does the day's steps for this lead's client, when it isn't
 * this one: one that already sent the text, else the earliest consult (then
 * the earliest booked). Null when this lead is the first, or the only one.
 */
export function sameDayFirst(lead: Lead, others: Lead[], textSent: (id: string) => boolean): Lead | null {
  if (!lead.consult_datetime || textSent(lead.id)) return null
  const d = day(lead.consult_datetime)
  const group = others.filter(
    (o) => o.id !== lead.id && !CLOSED.includes(o.status) && o.consult_datetime && day(o.consult_datetime) === d && sameClient(lead, o)
  )
  if (!group.length) return null
  const sent = group.find((o) => textSent(o.id))
  if (sent) return sent
  const key = (l: Lead) => [new Date(l.consult_datetime!).getTime(), new Date(l.created_at).getTime()]
  const first = [lead, ...group].sort((a, b) => key(a)[0] - key(b)[0] || key(a)[1] - key(b)[1])[0]
  return first.id === lead.id ? null : first
}

/**
 * Mark this lead's text, portal invite and Slack post as covered by the day's
 * first booking, with a marker the bot reads to leave its text, portal and Grow
 * matter alone. Returns the first booking's id, or null.
 */
export async function coverSameDay(admin: Admin, lead: Lead): Promise<string | null> {
  if (!lead.consult_datetime || CLOSED.includes(lead.status)) return null
  const email = lead.email?.trim().toLowerCase()
  const phone = digits(lead.phone)
  if (!email && phone.length !== 10) return null
  const start = new Date(new Date(lead.consult_datetime).getTime() - 24 * 60 * 60 * 1000).toISOString()
  const end = new Date(new Date(lead.consult_datetime).getTime() + 24 * 60 * 60 * 1000).toISOString()
  const { data } = await admin
    .from("intake_leads")
    .select("id, email, phone, consult_datetime, created_at, status")
    .eq("source", "acuity")
    .gte("consult_datetime", start)
    .lte("consult_datetime", end)
    .neq("id", lead.id)
  const others = (data ?? []) as Lead[]
  if (!others.some((o) => sameClient(lead, o))) return null

  const ids = [lead.id, ...others.map((o) => o.id)]
  const { data: texts } = await admin.from("intake_steps").select("lead_id").in("lead_id", ids).eq("step_key", "clio_text_sent").eq("state", "done")
  const sent = new Set((texts ?? []).map((t) => t.lead_id))
  const first = sameDayFirst(lead, others, (id) => sent.has(id))
  if (!first) return null

  const { data: have } = await admin.from("intake_steps").select("step_key").eq("lead_id", lead.id).eq("state", "done").in("step_key", [SAME_DAY, ...COVERED])
  const done = new Set((have ?? []).map((s) => s.step_key))
  const detail = { action: "covered", lead: first.id, at: first.consult_datetime }
  if (!done.has(SAME_DAY)) await logStep(admin, { lead_id: lead.id, step_key: SAME_DAY, state: "done", detail })
  for (const key of COVERED) if (!done.has(key)) await logStep(admin, { lead_id: lead.id, step_key: key, state: "done", detail })
  return first.id
}
