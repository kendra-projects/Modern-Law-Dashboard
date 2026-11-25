import "server-only"

import { SAME_DAY, sameDayFirst } from "@/lib/same-day"
import { consultLocation } from "@/lib/attorney-zoom"
import { pickAdvocate } from "@/lib/advocate-auto"
import { botKinds, botModeFor, type BotKind, type BotMode } from "@/lib/bot-mode"
import { CLIO_APP, matterDescription, onePerson, practiceAreaName, splitName } from "@/lib/clio-intake"
import { confirmationText, consultMethod, PORTAL_SUBJECT, portalInviteText } from "@/lib/client-messages"
import { cannotAutoClear, conflictAutoOn, fresh, savedSearch } from "@/lib/conflict-search"
import { contactWaitOver, safetyHold } from "@/lib/safety-hold"
import { checkReturningClient, growMayProceed, returningState } from "@/lib/returning-client"
import { followUpPlan, growDue } from "@/lib/follow-ups"
import { advocateSettled, growUserIds } from "@/lib/grow-advocate"
import { growState, nameDiffers } from "@/lib/grow-note"
import { clientSetByStaff } from "@/lib/intake-steps"
import { growContactId, growMattersSinceBooking, type GrowLead } from "@/lib/grow-sync"
import { autoSignoff, runAutoIntake } from "@/lib/auto-intake"
import { ADVOCATE_CLIO_NAMES, isAdvocate, OFFICE_ADDRESSES } from "@/lib/intake"
import { logStep } from "@/lib/intake-step-log"
import { lexiConversationUrl } from "@/lib/lexi-followups"
import { emailLexi } from "@/lib/lexi-email"
import { alertClioSignInExpired } from "@/lib/clio-signin-alert"
import { emailTextForStaff } from "@/lib/team-alerts"
import { createAdminClient } from "@/lib/supabase/admin"
import type { IntakeLead, IntakeStep } from "@/types/database"

// The intake bot (the private repo kendra-projects/modern-law-bot) does
// the two steps no API allows: it pauses Lexi's follow-up texts in LexiDesk
// (for bookings Lexi didn't make; LexiDesk stops its own) and sends the
// confirmation text from the Clio matter. It runs on GitHub Actions with a
// real Chrome, asks GET /api/intake/bot/tasks what to do and reports each lead
// to POST /api/intake/bot/result.
//
// BOT_MODE=on lets it click Pause and Send; BOT_MODE=dry sends it through the
// same pages without those clicks (a test run, recorded on the lead); anything
// else gives it nothing to do. BOT_LEXI_MODE and BOT_TEXT_MODE set one job's
// mode on its own (the text ran as a test while Lexi was live). BOT_KINDS
// picks its jobs ("lexi", "text" or both). Each job has its own first
// booking date: pausing Lexi is harmless on older open leads, but a text only
// goes to bookings made from BOT_TEXT_FROM on, so the bot never texts a
// client staff already texted by hand. The dashboard wakes it when a
// lead becomes ready (GitHub repository_dispatch, with GITHUB_BOT_TOKEN); an
// hourly run picks up the rest. What it can't settle on its own (two LexiDesk
// clients on one phone, a page it doesn't recognise) goes to Intake Recovery
// and the lead page's buttons, which always work.
//
// Two more jobs (27 Oct 2026), both off until listed in BOT_KINDS:
// - "grow": the consult's Clio Grow matter, the way staff work it. Creates it
//   when the booking has none (with Billing Department and the advocate),
//   fills what is empty (Consulting Attorney, County, Self Scheduled?,
//   description, status), applies the Standard Consult Scheduled Checklist,
//   dates its three follow-ups by the firm's rule (and again on a reschedule),
//   ticks the items the dashboard and the bot have done, and converts the
//   matter to Clio Manage once the conflict check is clean. The dashboard sends
//   the plan; the bot reads Grow and changes only what differs.
// - "portal": opens the real Clio for Clients portal on the Manage matter
//   (Communications > Client portals), with the attorney and the advocate, and
//   sends the firm's welcome message. Clio's API doesn't allow this (401).
//   While this job is on, the automatic intake stops sending its own invite
//   (an internal message).
// Each grow or portal task carries a signature of what it asks; the same
// request isn't sent again once done, left for staff, or tried as a test.

export { botMode, botModeFor, botKinds, type BotKind, type BotMode } from "@/lib/bot-mode"

const FROM: Record<BotKind, () => string> = {
  lexi: () => process.env.BOT_LEXI_FROM?.trim() || "2026-10-01T07:00:00Z",
  text: () => process.env.BOT_TEXT_FROM?.trim() || "2026-10-16T07:00:00Z",
  grow: () => process.env.BOT_GROW_FROM?.trim() || "2026-10-27T07:00:00Z",
  portal: () => process.env.BOT_PORTAL_FROM?.trim() || "2026-10-27T07:00:00Z",
}
/** The first booking date the bot's enabled jobs reach back to. */
export const botFrom = () =>
  botKinds()
    .map((k) => FROM[k]())
    .sort()[0] ?? FROM.lexi()
const inRange = (lead: Pick<IntakeLead, "created_at">, kind: BotKind) =>
  botKinds().includes(kind) && botModeFor(kind) !== "off" && new Date(lead.created_at).getTime() >= new Date(FROM[kind]()).getTime()
/** The bot (on or on a test run) has this job for this lead. */
export const botHandles = (lead: Pick<IntakeLead, "source" | "created_at">, kind: BotKind) =>
  lead.source === "acuity" && inRange(lead, kind)
const BOT_REPO = () => process.env.BOT_REPO?.trim() || "kendra-projects/modern-law-bot"

export const BOT_BY = "Bot"
const CLOSED: IntakeLead["status"][] = ["canceled", "stopped", "failed", "done"]
const RETRY_AFTER = 60 * 60 * 1000
// Lexi keeps texting after the consult too, so pausing still helps for a while.
const LEXI_WINDOW = 3 * 24 * 60 * 60 * 1000
/** How long after the consult the bot still converts a Grow matter whose check cleared late. */
const GROW_LATE_WINDOW = 24 * 60 * 60 * 1000

export type BotTask =
  | {
      kind: "lexi"
      lead_id: string
      client: string
      phone: string | null
      email: string | null
      /** A test run: go through the pages, click nothing that changes anything. */
      dry: boolean
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
      /** When the booking came in: a text the firm sent after this means it's done. */
      booked_at: string
      dry: boolean
    }
  | {
      kind: "grow"
      lead_id: string
      client: string
      /** The consult's Grow matter, or null when the bot is to create it. */
      matter_id: string | null
      /** Only when there is no Grow matter yet. */
      create: {
        first_name: string
        last_name: string
        email: string | null
        phone: string | null
        /** The client's existing Grow contact, when exactly one fits. */
        contact_id: string | null
        /** Grow user ids to assign: the advocate and Billing Department. */
        assigned_user_ids: string[]
      } | null
      /** Grow users the matter must be assigned to (added, never removed). */
      ensure_user_ids: string[]
      ensure_user_names: string[]
      /** Matter type to set only when Grow has none or "Unassigned". */
      matter_type: string | null
      status: string
      /** Statuses that come before "Consult Scheduled": only these are moved forward. */
      status_from: string[]
      /** Custom fields by Grow's name, set only when empty. */
      fields: Record<string, string | boolean>
      /** Grow marketing source (Grow's name) to set when the matter has none or only "Unassigned". */
      referral_source: string | null
      /** The opposing party, added as a related contact with the "Opposing Party" status. */
      opposing_party: { first_name: string; last_name: string } | null
      /** Set only when empty or a bare "IC -". */
      description: string
      checklist_template_id: number
      checklist_title: string
      /** Every name the consult checklist goes by: one already on the matter means none is added, and items in any are ticked. */
      checklist_titles: string[]
      /** Due times for the checklist's follow-up items, by item name. */
      follow_ups: { name: string; due: string }[]
      /** Checklist items (part of their name) to tick, because that work is done. */
      tick: string[]
      /** Convert to Clio Manage now (conflict search clean, no Manage matter yet). */
      convert: boolean
      sig: string
      dry: boolean
    }
  | {
      kind: "portal"
      lead_id: string
      client: string
      matter_id: string
      /** Firm users to add next to the client: the consulting attorney and the advocate. */
      members: string[]
      subject: string
      body: string
      sig: string
      dry: boolean
    }

type Admin = NonNullable<ReturnType<typeof createAdminClient>>
type Steps = Pick<IntakeStep, "lead_id" | "step_key" | "state" | "detail" | "error" | "created_at" | "updated_at">[]

const fullName = (l: Pick<IntakeLead, "client_first" | "client_last">) => [l.client_first, l.client_last].filter(Boolean).join(" ")

const DONE_KEY: Record<BotKind, string> = { lexi: "lexi_followups", text: "clio_text_sent", grow: "grow_bot", portal: "clio_client_portal" }

/** A short, stable signature of what a task asks, so the same request isn't repeated. */
function signature(x: unknown) {
  const s = JSON.stringify(x)
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** A grow or portal task with this signature was already done, left for staff, tried as a test, or failed within the hour. */
function sigSettled(steps: Steps, kind: "grow" | "portal", sig: string, dry: boolean) {
  const sigOf = (key: string) => (steps.find((s) => s.step_key === key)?.detail as { sig?: string } | null)?.sig
  if (kind === "grow" && steps.some((s) => s.step_key === DONE_KEY.grow && s.state === "done") && sigOf(DONE_KEY.grow) === sig) return true
  if (dry && sigOf(`bot_${kind}_dry`) === sig) return true
  // A test run that didn't finish is tried again after an hour.
  const test = steps.find((s) => s.step_key === `bot_${kind}_dry`)
  if (dry && (test?.detail as { failed?: boolean } | null)?.failed && Date.now() - new Date(test!.updated_at).getTime() < RETRY_AFTER) return true
  const bot = steps.find((s) => s.step_key === `bot_${kind}`)
  if (bot?.state === "awaiting_human" && sigOf(`bot_${kind}`) === sig) return true
  return bot?.state === "failed" && Date.now() - new Date(bot.updated_at).getTime() < RETRY_AFTER
}

// The firm's Grow setup (checked 26 Oct 2026, claude-history/notes/bot-recon-2026-10-26.md).
// The firm renamed its Grow statuses by 3 Nov 2026 (same id 1123106): names checked 6 Nov 2026.
const GROW_CHECKLIST = { id: 231446, title: "Standard Consult Scheduled Checklist" }
// Staff also apply "Appointment Scheduled Checklist" (seen 20 Nov 2026 on Gordon
// and Dees): the same consult steps. Either on the matter counts as the checklist.
const GROW_CHECKLIST_TITLES = [GROW_CHECKLIST.title, "Appointment Scheduled Checklist"]
const GROW_STATUS = "Consult Scheduled"
const GROW_EARLY_STATUSES = ["New Lead", "Book Consult"]
const BILLING = "Billing Department"
// A booking's Grow matter can take a few minutes to appear (LexiDesk, staff): wait before making one.
const CREATE_AFTER = 15 * 60 * 1000

/** Staff or the bot already did it, or the bot is waiting on staff, or it failed within the hour. */
function settled(steps: Steps, kind: "lexi" | "text") {
  const doneKey = DONE_KEY[kind]
  if (steps.some((s) => s.step_key === doneKey && s.state === "done")) return true
  const bot = steps.find((s) => s.step_key === `bot_${kind}`)
  if (!bot) return false
  if (bot.state === "awaiting_human") return true
  // A failed sign-in says nothing about the lead: try again after a few minutes.
  const wait = /^The bot couldn't sign in/.test(bot.error ?? "") ? 5 * 60 * 1000 : RETRY_AFTER
  return bot.state === "failed" && Date.now() - new Date(bot.updated_at).getTime() < wait
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
  const textSent = (id: string) => ((steps ?? []) as Steps).some((s) => s.lead_id === id && s.step_key === "clio_text_sent" && s.state === "done")
  for (const lead of leads) {
    const rows = ((steps ?? []) as Steps).filter((s) => s.lead_id === lead.id)
    const consult = lead.consult_datetime ? new Date(lead.consult_datetime).getTime() : null
    const client = fullName(lead)
    // Signed off: only the Grow checklist ticks are left to catch up on.
    const signedOff = lead.status === "done"

    // A consult Lexi booked has its follow-ups stopped by LexiDesk itself
    // (lib/lexi-followups.ts); any other booking may still have them running.
    if (
      !signedOff &&
      inRange(lead, "lexi") &&
      !settled(rows, "lexi") &&
      !lexiConversationUrl(lead) &&
      (consult == null || consult > Date.now() - LEXI_WINDOW) &&
      (lead.phone || lead.email)
    ) {
      out.push({ kind: "lexi", lead_id: lead.id, client, phone: lead.phone, email: lead.email, dry: botModeFor("lexi") === "dry" })
    }

    // A safety hold (lib/safety-hold.ts): pausing Lexi above stops contact, so it
    // still runs; the text, the Grow card and the portal don't.
    if (safetyHold(rows)) continue
    // A later booking the same day for the same client: the first booking does
    // the text, the portal and the Grow matter (lib/same-day.ts).
    if (rows.some((s) => s.step_key === SAME_DAY && s.state === "done") || sameDayFirst(lead, leads, textSent)) continue
    // A returning client waiting on same case or new case: no text, Grow work or portal on a matter that may be the wrong one.
    if (returningState(rows) === "waiting") continue

    // The text needs what the lead page needs before Send: the conflict clear,
    // the advocate who signs it, the matter it is sent from, a consult still
    // ahead, every detail filled in, and one spelling of the client's name.
    if (
      !signedOff &&
      inRange(lead, "text") &&
      contactWaitOver(lead.created_at) &&
      !settled(rows, "text") &&
      lead.conflict_status === "clear" &&
      // A real advocate signs it: Acuity's "Client" or "Other" is who booked,
      // and the one from the Grow matter (or staff), so it matches Grow.
      isAdvocate(lead.assigned_advocate) &&
      advocateSettled(rows) &&
      lead.clio_matter_id &&
      lead.phone &&
      consult != null &&
      consult > Date.now()
    ) {
      const grow = growState(rows).noted
      if (grow && !clientSetByStaff(rows) && nameDiffers(lead.client_first, lead.client_last, grow.clientName)) continue
      const appt = (appts ?? []).find((a) => a.lead_id === lead.id)
      const { location } = await consultLocation(admin, lead, appt?.location ?? null)
      const sms = confirmationText({
        firstName: lead.client_first,
        advocate: lead.assigned_advocate,
        datetime: lead.consult_datetime,
        method: consultMethod(lead.method, location),
        location,
        officeAddress: lead.office ? address.get(lead.office) ?? OFFICE_ADDRESSES[lead.office] ?? null : null,
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
          booked_at: lead.created_at,
          dry: botModeFor("text") === "dry",
        })
      }
    }

    const done = (key: string) => rows.some((s) => s.step_key === key && s.state === "done")
    const ahead = consult != null && consult > Date.now()

    // The Grow matter, worked the way staff do (see the note at the top). A
    // same-day booking can have its check cleared after the consult starts
    // (Wright, 24 Nov 2026: booked 12:30 for 2:00, cleared 2:04), so for a day
    // after the consult the bot still converts a Grow matter it already knows
    // and isn't on a Clio matter yet; it never makes one then.
    const lateConvert =
      consult != null &&
      !ahead &&
      consult > Date.now() - GROW_LATE_WINDOW &&
      !lead.clio_matter_id &&
      lead.conflict_status === "clear" &&
      Boolean(growState(rows).noted?.matterId)
    if (inRange(lead, "grow") && (ahead || lateConvert) && lead.conflict_status !== "conflict") {
      const task = await growTask(admin, lead, rows).catch(() => null)
      if (task && !sigSettled(rows, "grow", task.sig, task.dry)) out.push(task)
    }

    // The real client portal, once the matter, a clear conflict check and the final advocate are there.
    const advocate = isAdvocate(lead.assigned_advocate) && advocateSettled(rows) ? ADVOCATE_CLIO_NAMES[lead.assigned_advocate!] : null
    if (
      !signedOff &&
      inRange(lead, "portal") &&
      contactWaitOver(lead.created_at) &&
      ahead &&
      lead.clio_matter_id &&
      lead.conflict_status === "clear" &&
      advocate &&
      lead.consulting_attorney &&
      !done(DONE_KEY.portal)
    ) {
      const ask = {
        matter_id: lead.clio_matter_id,
        members: [lead.consulting_attorney, advocate],
        subject: PORTAL_SUBJECT,
        body: portalInviteText(lead.client_first),
      }
      const task = { kind: "portal" as const, lead_id: lead.id, client, ...ask, sig: signature(ask), dry: botModeFor("portal") === "dry" }
      if (!sigSettled(rows, "portal", task.sig, task.dry)) out.push(task)
    }
  }
  return out
}

/**
 * The Grow marketing source for the booking's referral answer (Acuity's
 * options; Grow spells a few differently). No answer means Google, as in
 * Kendra's walkthrough; "N/A" sets nothing.
 */
const GROW_SOURCE_NAMES: Record<string, string> = {
  Rehire: "Self Referral/Re-hire",
  "Facebook Group": "Facebook Support Group",
  "ChatGPT/AI": "ChatGPT",
}
function growSource(referral: string | null) {
  const r = referral?.trim()
  if (!r) return "Google"
  if (/^n\/?a$/i.test(r)) return null
  return GROW_SOURCE_NAMES[r] ?? r
}

/** What the Grow job should make true for this lead, or null when it can't run yet. */
async function growTask(admin: Admin, lead: IntakeLead, rows: Steps): Promise<Extract<BotTask, { kind: "grow" }> | null> {
  const grow = growState(rows)
  const matterId = grow.noted?.matterId ?? null
  // Several Grow matters could be the client's: staff pick one on the lead page first.
  if (!matterId && rows.some((s) => s.step_key === "grow_match" && s.state === "awaiting_human")) return null
  // The booking is already on a Clio matter (a returning client's, or one staff
  // made): that matter is the client's Grow matter too, so never make another
  // (Khalaj, 23 Nov 2026: one made per booking).
  if (!matterId && lead.clio_matter_id) return null
  if (!matterId && Date.now() - new Date(lead.created_at).getTime() < CREATE_AFTER) return null

  // A returning client (lib/returning-client.ts): while staff decide whether
  // this is the same case as an open matter, or once they say it is, the bot
  // neither creates nor converts a Grow matter. A Clio error holds off too.
  if (!lead.clio_matter_id) {
    const returning = await checkReturningClient(admin, lead, rows).catch(() => "error" as const)
    if (returning === "error" || !growMayProceed(returning)) return null
  }

  const done = (key: string) => rows.some((s) => s.step_key === key && s.state === "done")
  const search = savedSearch(rows)
  // Converting to Clio Manage needs a clear check, or (with CONFLICT_AUTO on) a
  // clean search run for the lead as it is now. A flagged match, an error or a
  // search from before a name changed waits for staff.
  const conflictClean =
    lead.conflict_status === "clear" ||
    (conflictAutoOn() && lead.conflict_status === "pending" && fresh(search, lead) && !cannotAutoClear(search!))
  const advocate = isAdvocate(lead.assigned_advocate) ? ADVOCATE_CLIO_NAMES[lead.assigned_advocate!] : null

  let create: Extract<BotTask, { kind: "grow" }>["create"] = null
  const names = [BILLING]
  if (!matterId) {
    // Never a second matter: once the bot has made one for this booking, or the
    // client has one made since they booked, wait for the dashboard to note it
    // (lib/grow-sync.ts) and work that one. A Grow error holds off too.
    const made = rows.some((s) => s.step_key === DONE_KEY.grow && /create the Grow matter/.test(String((s.detail as { note?: string } | null)?.note ?? "")))
    if (made) return null
    const since = await growMattersSinceBooking(lead as unknown as GrowLead).catch(() => null)
    if (since === null || since.length) return null
    // A new matter needs someone assigned: Acuity's advocate, else whoever is free.
    const assignee = advocate ?? (await pickAdvocate(admin).then((p) => (p.advocate ? ADVOCATE_CLIO_NAMES[p.advocate] : null)).catch(() => null))
    if (!assignee) return null
    names.push(assignee)
    create = {
      first_name: lead.client_first ?? "",
      last_name: lead.client_last ?? "",
      email: lead.email,
      phone: lead.phone,
      contact_id: await growContactId(lead as unknown as GrowLead).catch(() => null),
      assigned_user_ids: [],
    }
  }
  const ids = await growUserIds(names)
  if (!ids[BILLING]) return null
  if (create) {
    create.assigned_user_ids = names.map((n) => ids[n]).filter(Boolean)
    if (create.assigned_user_ids.length < 2) return null
  }

  const tick = [
    lead.conflict_status === "clear" && "Verify conflict check",
    done("lexi_followups") && "Stop Lexi follow ups",
    lead.clio_matter_id && "Convert to Manage",
    done("clio_matter_filled") && "Verify PC and OP as Contacts",
    // The bot's own invite, or one sent from the lead page or found in Clio.
    (done("clio_client_portal") || done("clio_portal_sent")) && "Invite Potential Client to their Portal",
    done("calendar_guest") && "Invite PC to IC",
    done("clio_text_sent") && "Text PC via Clio Texting",
    done("slack_posted") && "Send slack message to Initial Consultations",
    lead.county && lead.referral_source && "Verify County and Referral Source",
    // The bot fills these itself on this run.
    lead.consulting_attorney && "Fill Out Custom Field for Attorney Scheduled",
    "Add Billing Department to Grow Card",
  ].filter((t): t is string => Boolean(t))

  const fields: Record<string, string | boolean> = {}
  if (lead.consulting_attorney) fields["Consulting Attorney"] = lead.consulting_attorney
  if (lead.county) fields["County (ALL CAPS)"] = lead.county.toUpperCase()
  if (lead.self_scheduled != null) fields["Self Scheduled?"] = lead.self_scheduled
  const op = lead.opposing_party_name?.trim() ?? ""
  const opPerson = Boolean(op) && onePerson(op)
  if (opPerson) fields["Opposing Party Name"] = op

  const ask = {
    matter_id: matterId,
    create,
    ensure_user_ids: [ids[BILLING]],
    ensure_user_names: [BILLING],
    matter_type: practiceAreaName(lead.matter_type) ?? lead.matter_type?.trim() ?? null,
    status: GROW_STATUS,
    status_from: GROW_EARLY_STATUSES,
    fields,
    referral_source: growSource(lead.referral_source),
    opposing_party: opPerson ? splitName(op) : null,
    description: matterDescription(lead),
    checklist_template_id: GROW_CHECKLIST.id,
    checklist_title: GROW_CHECKLIST.title,
    checklist_titles: GROW_CHECKLIST_TITLES,
    follow_ups: lead.consult_datetime ? followUpPlan(lead.consult_datetime).map((f) => ({ name: f.name, due: growDue(f.due) })) : [],
    tick,
    convert: conflictClean && !lead.clio_matter_id,
  }
  return {
    kind: "grow",
    lead_id: lead.id,
    client: fullName(lead),
    ...ask,
    sig: signature(ask),
    dry: botModeFor("grow") === "dry",
  }
}

async function openLeads(admin: Admin, leadId?: string) {
  // A signed-off ("done") lead stays in until its consult starts, so the Grow
  // checklist still gets ticks for steps finished in the same run as, or after,
  // the bot's last Grow pass (tasksFor gives it the Grow job only).
  let q = admin
    .from("intake_leads")
    .select("*")
    .eq("source", "acuity")
    .not("status", "in", `(${CLOSED.filter((c) => c !== "done").join(",")})`)
    .gte("created_at", botFrom())
    // Past consults are out of every job's window (Lexi's is the widest).
    .or(`consult_datetime.is.null,consult_datetime.gte.${new Date(Date.now() - LEXI_WINDOW).toISOString()}`)
  if (leadId) q = q.eq("id", leadId)
  const { data } = await q.order("consult_datetime", { ascending: true }).limit(200)
  const now = Date.now()
  return ((data ?? []) as IntakeLead[]).filter(
    (l) => l.status !== "done" || (l.consult_datetime != null && new Date(l.consult_datetime).getTime() > now)
  )
}

/** Everything the bot can do now. Empty when every job is off. Each task says whether it's a test run. */
export async function botTasks(): Promise<{ mode: BotMode; tasks: BotTask[]; clio_check: boolean }> {
  const admin = createAdminClient()
  const live = botKinds().map(botModeFor).filter((m) => m !== "off")
  const mode: BotMode = live.includes("on") ? "on" : live.length ? "dry" : "off"
  // While a Clio job (text, portal, Grow) is on, live or test, the bot looks at
  // its Clio sign-in on every run, tasks or not (POST /api/intake/bot/session).
  const clio_check = botKinds().some((k) => k !== "lexi" && botModeFor(k) !== "off")
  if (mode === "off" || !admin) return { mode, tasks: [], clio_check }
  const leads = await openLeads(admin)
  await dropMootTexts(admin, leads)
  return { mode, tasks: await tasksFor(admin, leads), clio_check }
}

/**
 * A confirmation text the bot couldn't send is moot once the consult has
 * passed or the booking was canceled: its failure is set aside (skipped, kept
 * in the log) so Intake Recovery doesn't ask anyone to send it.
 */
async function dropMootTexts(admin: Admin, leads: IntakeLead[]) {
  const skip = (ids: string[], note: string) =>
    admin
      .from("intake_steps")
      .update({ state: "skipped", detail: { by: BOT_BY, note } })
      .in("lead_id", ids)
      .eq("step_key", "bot_text")
      .eq("state", "failed")

  const passed = leads.filter((l) => l.consult_datetime && new Date(l.consult_datetime).getTime() < Date.now()).map((l) => l.id)
  if (passed.length) await skip(passed, "The consult has passed, so the text is no longer needed.")

  // Canceled leads aren't among the open ones: find them from their failed texts.
  const { data: failed } = await admin.from("intake_steps").select("lead_id").eq("step_key", "bot_text").eq("state", "failed")
  const failedIds = Array.from(new Set((failed ?? []).map((s) => s.lead_id)))
  if (!failedIds.length) return
  const { data: canceled } = await admin.from("intake_leads").select("id").in("id", failedIds).eq("status", "canceled")
  if (canceled?.length) await skip(canceled.map((l) => l.id), "The booking was canceled, so the text is no longer needed.")
}

export type BotOutcome = "paused" | "none" | "sent" | "done" | "dry" | "needs_staff" | "failed"

/**
 * Record what the bot did for one lead. A pause or a sent text completes the
 * step (and may complete the intake); a test run is noted on the lead; what
 * needs staff or failed goes to Intake Recovery.
 */
export async function recordBotResult(r: { lead_id: string; kind: BotKind; outcome: BotOutcome; note?: string | null; sig?: string | null }) {
  const admin = createAdminClient()
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing")
  const note = r.note?.slice(0, 500) ?? null
  const botKey = `bot_${r.kind}`
  // The bot's Clio sign-in ran out: texts, portals and Grow all wait until
  // someone signs in again. Test runs too, so a sign-in never ends unnoticed.
  if (r.kind !== "lexi" && /saved sign-in has run out/i.test(note ?? "")) await alertClioSignInExpired().catch(() => false)
  if (r.kind === "grow" || r.kind === "portal") return recordJobResult(admin, { ...r, kind: r.kind, note })
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
    // A test run that went through means an earlier failure no longer stands.
    await admin.from("intake_steps").delete().eq("lead_id", r.lead_id).eq("step_key", botKey).eq("state", "failed")
    return { approved: false }
  }
  await logStep(admin, {
    lead_id: r.lead_id,
    step_key: botKey,
    state: r.outcome === "needs_staff" ? "awaiting_human" : "failed",
    detail: { by: BOT_BY },
    error: note ?? (r.outcome === "needs_staff" ? "The bot left this one for staff." : "The bot couldn't finish this step."),
  })
  // A text the bot left for staff (a name or number that doesn't match): tell the team, once per lead.
  if (r.kind === "text" && r.outcome === "needs_staff" && botModeFor("text") === "on")
    await emailTextForStaff(admin, r.lead_id, note ?? "The bot left the confirmation text for staff.").catch(() => false)
  // Lexi follow-ups the bot couldn't pause (a similar name, a page that broke):
  // tell the team, once per lead, while the job is live.
  if (r.kind === "lexi" && botModeFor("lexi") === "on") {
    const why = r.outcome === "needs_staff" ? "needs_staff" : "failed"
    await emailLexi(admin, r.lead_id, why, note ?? "The bot couldn't pause the follow-ups.").catch(() => false)
  }
  return { approved: false }
}

/** The grow and portal jobs' results (see the note at the top). */
async function recordJobResult(
  admin: Admin,
  r: { lead_id: string; kind: "grow" | "portal"; outcome: BotOutcome; note: string | null; sig?: string | null }
) {
  const botKey = `bot_${r.kind}`
  const sig = r.sig ?? null
  if (r.outcome === "dry") {
    await logStep(admin, { lead_id: r.lead_id, step_key: `${botKey}_dry`, state: "done", detail: { by: BOT_BY, note: r.note, sig } })
    await admin.from("intake_steps").delete().eq("lead_id", r.lead_id).eq("step_key", botKey).eq("state", "failed")
    return { approved: false }
  }
  // A test run that didn't finish is a note on the lead, not work for Intake Recovery.
  if ((r.outcome === "needs_staff" || r.outcome === "failed") && botModeFor(r.kind) === "dry") {
    await logStep(admin, {
      lead_id: r.lead_id,
      step_key: `${botKey}_dry`,
      state: "done",
      detail: { by: BOT_BY, note: `didn't finish: ${r.note ?? r.outcome}`, failed: true },
    })
    return { approved: false }
  }
  if (r.outcome === "needs_staff" || r.outcome === "failed") {
    await logStep(admin, {
      lead_id: r.lead_id,
      step_key: botKey,
      state: r.outcome === "needs_staff" ? "awaiting_human" : "failed",
      detail: { by: BOT_BY, sig },
      error: r.note ?? (r.outcome === "needs_staff" ? "The bot left this one for staff." : "The bot couldn't finish this step."),
    })
    return { approved: false }
  }
  if (r.kind === "grow") {
    await logStep(admin, { lead_id: r.lead_id, step_key: DONE_KEY.grow, state: "done", detail: { by: BOT_BY, note: r.note, sig } })
  } else {
    // "sent": the bot opened the portal; "none": the matter already had one.
    const action = r.outcome === "none" ? "found" : "sent"
    await logStep(admin, { lead_id: r.lead_id, step_key: DONE_KEY.portal, state: "done", detail: { by: BOT_BY, action, note: r.note } })
    const { data: invite } = await admin.from("intake_steps").select("id").eq("lead_id", r.lead_id).eq("step_key", "clio_portal_sent").eq("state", "done").limit(1)
    if (!invite?.length) await logStep(admin, { lead_id: r.lead_id, step_key: "clio_portal_sent", state: "done", detail: { by: BOT_BY, action, note: r.note } })
  }
  await admin.from("intake_steps").delete().eq("lead_id", r.lead_id).eq("step_key", botKey)
  if (r.kind === "grow") {
    // The bot may just have converted the Grow matter: pick the Manage matter up
    // now (the automatic intake syncs from Clio first), not when someone next
    // opens the dashboard, and wake the bot for the portal and text that follow.
    // (Tracy Roach, 16 Nov 2026: converted 1:04 PM, linked only at 1:35 PM.)
    const { data: lead } = await admin.from("intake_leads").select("clio_matter_id").eq("id", r.lead_id).maybeSingle()
    if (lead && !lead.clio_matter_id) {
      await runAutoIntake(r.lead_id).catch(() => null)
      await wakeBotFor(r.lead_id).catch(() => false)
    }
  }
  return { approved: await autoSignoff(r.lead_id).catch(() => false) }
}

/**
 * Whether GitHub took the wake-up. A refused one is logged with GitHub's
 * answer (Vercel's logs), so a bad token doesn't fail silently for a day
 * (24-25 Nov 2026: no wake-ups reached the bot).
 */
async function wakeResult(res: Response | Error, what: string): Promise<boolean> {
  if (res instanceof Error) {
    console.error(`[bot wake] ${what}: request failed: ${res.message}`)
    return false
  }
  if (res.ok) return true
  const body = await res.text().catch(() => "")
  console.error(`[bot wake] ${what}: GitHub answered ${res.status}: ${body.slice(0, 300)}`)
  return false
}

/**
 * Wake the bot once when any open lead has something for it: after a sync of
 * all open leads linked matters or cleared checks, so the portal and text go
 * out now instead of at the next hourly run (Mills, 23 Nov 2026).
 */
export async function wakeBotIfWork(): Promise<boolean> {
  const token = process.env.GITHUB_BOT_TOKEN?.trim()
  const admin = createAdminClient()
  if (!token || !admin || !botKinds().some((k) => botModeFor(k) !== "off")) return false
  const tasks = await tasksFor(admin, await openLeads(admin))
  if (!tasks.length) return false
  const res = await fetch(`https://api.github.com/repos/${BOT_REPO()}/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify({ event_type: "intake", client_payload: {} }),
    cache: "no-store",
  }).catch((e) => e as Error)
  return wakeResult(res, "all open leads")
}

/**
 * Wake the bot when this lead has something for it (a new booking to pause
 * Lexi for, a lead now ready for its text). Fire and forget: the hourly run
 * catches whatever a missed wake-up leaves.
 */
export async function wakeBotFor(leadId: string): Promise<boolean> {
  const token = process.env.GITHUB_BOT_TOKEN?.trim()
  const admin = createAdminClient()
  if (!token || !admin || !botKinds().some((k) => botModeFor(k) !== "off")) return false
  const tasks = await tasksFor(admin, await openLeads(admin, leadId))
  if (!tasks.length) return false
  const res = await fetch(`https://api.github.com/repos/${BOT_REPO()}/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify({ event_type: "intake", client_payload: { lead: leadId } }),
    cache: "no-store",
  }).catch((e) => e as Error)
  return wakeResult(res, `lead ${leadId}`)
}
