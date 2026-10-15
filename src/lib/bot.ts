import "server-only"

import { consultLocation } from "@/lib/attorney-zoom"
import { CLIO_APP } from "@/lib/clio-intake"
import { confirmationText, consultMethod } from "@/lib/client-messages"
import { growState, nameDiffers } from "@/lib/grow-note"
import { autoSignoff } from "@/lib/auto-intake"
import { logStep } from "@/lib/intake-step-log"
import { lexiConversationUrl } from "@/lib/lexi-followups"
import { createAdminClient } from "@/lib/supabase/admin"
import type { IntakeLead, IntakeStep } from "@/types/database"

// The intake bot (the private repo abdulqayyum3116-art/modern-law-bot) does
// the two steps no API allows: it pauses Lexi's follow-up texts in LexiDesk
// (for bookings Lexi didn't make; LexiDesk stops its own) and sends the
// confirmation text from the Clio matter. It runs on GitHub Actions with a
// real Chrome, asks GET /api/intake/bot/tasks what to do and reports each lead
// to POST /api/intake/bot/result.
//
// BOT_MODE=on lets it click Pause and Send; BOT_MODE=dry sends it through the
// same pages without those clicks (a test run, recorded on the lead); anything
// else gives it nothing to do. BOT_KINDS picks its jobs ("lexi", "text" or
// both; Lexi only until the Clio side is set up). Each job has its own first
// booking date: pausing Lexi is harmless on older open leads, but a text only
// goes to bookings made from BOT_TEXT_FROM on, so the bot never texts a
// client staff already texted by hand. The dashboard wakes it when a
// lead becomes ready (GitHub repository_dispatch, with GITHUB_BOT_TOKEN); an
// hourly run picks up the rest. What it can't settle on its own (two LexiDesk
// clients on one phone, a page it doesn't recognise) goes to Intake Recovery
// and the lead page's buttons, which always work.

export type BotMode = "off" | "dry" | "on"
export function botMode(): BotMode {
  const v = (process.env.BOT_MODE ?? "").trim().toLowerCase()
  return v === "on" || v === "dry" ? v : "off"
}
export type BotKind = "lexi" | "text"
export function botKinds(): BotKind[] {
  const v = (process.env.BOT_KINDS ?? "lexi").toLowerCase()
  return (["lexi", "text"] as const).filter((k) => v.includes(k))
}
const FROM: Record<BotKind, () => string> = {
  lexi: () => process.env.BOT_LEXI_FROM?.trim() || "2026-10-01T07:00:00Z",
  text: () => process.env.BOT_TEXT_FROM?.trim() || "2026-10-16T07:00:00Z",
}
/** The first booking date the bot's enabled jobs reach back to. */
export const botFrom = () =>
  botKinds()
    .map((k) => FROM[k]())
    .sort()[0] ?? FROM.lexi()
const inRange = (lead: Pick<IntakeLead, "created_at">, kind: BotKind) =>
  botKinds().includes(kind) && new Date(lead.created_at).getTime() >= new Date(FROM[kind]()).getTime()
/** The bot (on or on a test run) has this job for this lead. */
export const botHandles = (lead: Pick<IntakeLead, "source" | "created_at">, kind: BotKind) =>
  botMode() !== "off" && lead.source === "acuity" && inRange(lead, kind)
const BOT_REPO = () => process.env.BOT_REPO?.trim() || "abdulqayyum3116-art/modern-law-bot"

export const BOT_BY = "Bot"
const CLOSED: IntakeLead["status"][] = ["canceled", "stopped", "failed", "done"]
const RETRY_AFTER = 60 * 60 * 1000
// Lexi keeps texting after the consult too, so pausing still helps for a while.
const LEXI_WINDOW = 3 * 24 * 60 * 60 * 1000

export type BotTask =
  | {
      kind: "lexi"
      lead_id: string
      client: string
      phone: string | null
      email: string | null
    }
  | {
      kind: "text"
      lead_id: string
      client: string
      phone: string | null
      matter_id: string
      /** The matter's Text messages tab in Clio. */
      texts_url: string
      text: string
    }

type Admin = NonNullable<ReturnType<typeof createAdminClient>>
type Steps = Pick<IntakeStep, "lead_id" | "step_key" | "state" | "detail" | "error" | "created_at" | "updated_at">[]

const fullName = (l: Pick<IntakeLead, "client_first" | "client_last">) => [l.client_first, l.client_last].filter(Boolean).join(" ")

/** Staff or the bot already did it, or the bot is waiting on staff, or it failed within the hour. */
function settled(steps: Steps, kind: "lexi" | "text") {
  const doneKey = kind === "lexi" ? "lexi_followups" : "clio_text_sent"
  if (steps.some((s) => s.step_key === doneKey && s.state === "done")) return true
  const bot = steps.find((s) => s.step_key === `bot_${kind}`)
  if (!bot) return false
  if (bot.state === "awaiting_human") return true
  return bot.state === "failed" && Date.now() - new Date(bot.updated_at).getTime() < RETRY_AFTER
}

async function tasksFor(admin: Admin, leads: IntakeLead[]): Promise<BotTask[]> {
  if (!leads.length) return []
  const ids = leads.map((l) => l.id)
  const [{ data: steps }, { data: appts }, { data: offices }] = await Promise.all([
    admin.from("intake_steps").select("lead_id, step_key, state, detail, error, created_at, updated_at").in("lead_id", ids),
    admin
      .from("appointments")
      .select("lead_id, location, datetime")
      .in("lead_id", ids)
      .eq("canceled", false)
      .order("datetime", { ascending: false }),
    admin.from("office_addresses").select("office, address"),
  ])
  const address = new Map((offices ?? []).map((o) => [o.office as string, o.address as string]))
  const out: BotTask[] = []
  for (const lead of leads) {
    const rows = ((steps ?? []) as Steps).filter((s) => s.lead_id === lead.id)
    const consult = lead.consult_datetime ? new Date(lead.consult_datetime).getTime() : null
    const client = fullName(lead)

    // A consult Lexi booked has its follow-ups stopped by LexiDesk itself
    // (lib/lexi-followups.ts); any other booking may still have them running.
    if (
      inRange(lead, "lexi") &&
      !settled(rows, "lexi") &&
      !lexiConversationUrl(lead) &&
      (consult == null || consult > Date.now() - LEXI_WINDOW) &&
      (lead.phone || lead.email)
    ) {
      out.push({ kind: "lexi", lead_id: lead.id, client, phone: lead.phone, email: lead.email })
    }

    // The text needs what the lead page needs before Send: the conflict clear,
    // the advocate who signs it, the matter it is sent from, a consult still
    // ahead, every detail filled in, and one spelling of the client's name.
    if (
      inRange(lead, "text") &&
      !settled(rows, "text") &&
      lead.conflict_status === "clear" &&
      lead.assigned_advocate &&
      lead.clio_matter_id &&
      lead.phone &&
      consult != null &&
      consult > Date.now()
    ) {
      const grow = growState(rows).noted
      if (grow && nameDiffers(lead.client_first, lead.client_last, grow.clientName)) continue
      const appt = (appts ?? []).find((a) => a.lead_id === lead.id)
      const { location } = await consultLocation(admin, lead, appt?.location ?? null)
      const sms = confirmationText({
        firstName: lead.client_first,
        advocate: lead.assigned_advocate,
        datetime: lead.consult_datetime,
        method: consultMethod(lead.method, location),
        location,
        officeAddress: lead.office ? address.get(lead.office) ?? null : null,
      })
      if (sms.text && !sms.missing.length) {
        out.push({
          kind: "text",
          lead_id: lead.id,
          client,
          phone: lead.phone,
          matter_id: lead.clio_matter_id,
          texts_url: `${CLIO_APP}/matters/${lead.clio_matter_id}/communications?tab=3`,
          text: sms.text,
        })
      }
    }
  }
  return out
}

async function openLeads(admin: Admin, leadId?: string) {
  let q = admin
    .from("intake_leads")
    .select("*")
    .eq("source", "acuity")
    .not("status", "in", `(${CLOSED.join(",")})`)
    .gte("created_at", botFrom())
    // Past consults are out of every job's window (Lexi's is the widest).
    .or(`consult_datetime.is.null,consult_datetime.gte.${new Date(Date.now() - LEXI_WINDOW).toISOString()}`)
  if (leadId) q = q.eq("id", leadId)
  const { data } = await q.order("consult_datetime", { ascending: true }).limit(200)
  return (data ?? []) as IntakeLead[]
}

/** Everything the bot can do now. Empty when BOT_MODE is off. */
export async function botTasks(): Promise<{ mode: BotMode; tasks: BotTask[] }> {
  const mode = botMode()
  const admin = createAdminClient()
  if (mode === "off" || !admin) return { mode, tasks: [] }
  return { mode, tasks: await tasksFor(admin, await openLeads(admin)) }
}

export type BotOutcome = "paused" | "none" | "sent" | "dry" | "needs_staff" | "failed"

/**
 * Record what the bot did for one lead. A pause or a sent text completes the
 * step (and may complete the intake); a test run is noted on the lead; what
 * needs staff or failed goes to Intake Recovery.
 */
export async function recordBotResult(r: { lead_id: string; kind: "lexi" | "text"; outcome: BotOutcome; note?: string | null }) {
  const admin = createAdminClient()
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing")
  const note = r.note?.slice(0, 500) ?? null
  const botKey = `bot_${r.kind}`
  if (r.outcome === "paused" || r.outcome === "none" || r.outcome === "sent") {
    const doneKey = r.kind === "lexi" ? "lexi_followups" : "clio_text_sent"
    const { data: already } = await admin.from("intake_steps").select("id").eq("lead_id", r.lead_id).eq("step_key", doneKey).eq("state", "done").limit(1)
    if (!already?.length) {
      await logStep(admin, {
        lead_id: r.lead_id,
        step_key: doneKey,
        state: "done",
        detail: r.kind === "lexi" ? { by: BOT_BY, result: r.outcome === "none" ? "none" : "paused", note } : { by: BOT_BY, note },
      })
    }
    await admin.from("intake_steps").delete().eq("lead_id", r.lead_id).eq("step_key", botKey)
    return { approved: await autoSignoff(r.lead_id).catch(() => false) }
  }
  if (r.outcome === "dry") {
    await logStep(admin, { lead_id: r.lead_id, step_key: `${botKey}_dry`, state: "done", detail: { by: BOT_BY, note } })
    return { approved: false }
  }
  await logStep(admin, {
    lead_id: r.lead_id,
    step_key: botKey,
    state: r.outcome === "needs_staff" ? "awaiting_human" : "failed",
    detail: { by: BOT_BY },
    error: note ?? (r.outcome === "needs_staff" ? "The bot left this one for staff." : "The bot couldn't finish this step."),
  })
  return { approved: false }
}

/**
 * Wake the bot when this lead has something for it (a new booking to pause
 * Lexi for, a lead now ready for its text). Fire and forget: the hourly run
 * catches whatever a missed wake-up leaves.
 */
export async function wakeBotFor(leadId: string): Promise<boolean> {
  const token = process.env.GITHUB_BOT_TOKEN?.trim()
  const admin = createAdminClient()
  if (!token || !admin || botMode() === "off") return false
  const tasks = await tasksFor(admin, await openLeads(admin, leadId))
  if (!tasks.length) return false
  const res = await fetch(`https://api.github.com/repos/${BOT_REPO()}/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify({ event_type: "intake", client_payload: { lead: leadId } }),
    cache: "no-store",
  }).catch(() => null)
  return Boolean(res?.ok)
}
