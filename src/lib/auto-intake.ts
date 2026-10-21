import "server-only"

import { autoAssignAdvocate } from "@/lib/advocate-auto"
import { consultLocation } from "@/lib/attorney-zoom"
import { clioStatus } from "@/lib/clio"
import {
  createFollowUpTasks,
  executeClioPlan,
  findClioContact,
  planClioCreate,
  sendClioPortalInvite,
} from "@/lib/clio-intake"
import { syncLeadFromClio } from "@/lib/clio-sync"
import { consultMethod, PORTAL_SUBJECT, portalInviteText } from "@/lib/client-messages"
import { consultPost, postMentions, slackEscape } from "@/lib/consult-post"
import { consultDay, followUpPlan } from "@/lib/follow-ups"
import { growState, nameDiffers } from "@/lib/grow-note"
import { ADVOCATE_CLIO_NAMES } from "@/lib/intake"
import { clearFailure, logStep } from "@/lib/intake-step-log"
import { INITIAL_CONSULTS_CHANNEL, messageText, postToChannel, slackConfigured, slackUserIds } from "@/lib/slack"
import { syncSlackPosts } from "@/lib/slack-sync"
import { createAdminClient } from "@/lib/supabase/admin"
import type { IntakeLead, IntakeStep } from "@/types/database"

// The intake steps that have an API, done on their own as soon as a booking is
// ready for them: the Clio contact and matter, the portal invite, the
// #initialconsultations post, the follow-up tasks, and the sign-off once staff
// have done the rest. Staff are left with what no API allows: the conflict
// check on a self-scheduled booking, the Clio text and pausing Lexi.
//
// AUTO_INTAKE=on does the work; AUTO_INTAKE=log only records what it would do
// (a test run on real bookings); anything else leaves the lead page buttons as
// the only way. Only bookings made from AUTO_INTAKE_FROM onwards, and only
// while the consult is still ahead, so switching it on never reaches back into
// leads staff already handled. Each step calls the same function as its
// button, after the Clio and Slack sync has picked up anything done by hand,
// so nothing is made twice. A step that can't run yet waits for the next
// trigger: the booking, the conflict decision, the advocate, a lead page
// opening, or the open-leads sync. A booking nobody was assigned to gets the
// free advocate first, with ADVOCATE_AUTO=on (lib/advocate-auto.ts).

export type AutoIntakeMode = "off" | "log" | "on"

export function autoIntakeMode(): AutoIntakeMode {
  const v = (process.env.AUTO_INTAKE ?? "").trim().toLowerCase()
  return v === "on" || v === "log" ? v : "off"
}

/** Midnight in Arizona on the day this shipped, unless AUTO_INTAKE_FROM says otherwise. */
export const autoIntakeFrom = () => process.env.AUTO_INTAKE_FROM?.trim() || "2026-10-16T07:00:00Z"

/**
 * Whether the dashboard may open the Clio Manage matter itself. Off
 * (CLIO_AUTO_MATTER=off) when the firm wants every matter pushed from Clio Grow
 * with "Convert to Clio Manage", which keeps Grow and Manage linked. The
 * dashboard then waits for that matter and picks it up (lib/clio-sync.ts)
 * instead of opening a second, unlinked one in Manage. The rest of the
 * automation (portal, Slack, tasks, sign-off) still runs once the matter is
 * there. The lead page has no button to open one in Manage any more: it lists
 * what goes on the Grow matter, and links a matter when several fit.
 */
export const clioAutoMatter = () => process.env.CLIO_AUTO_MATTER?.trim().toLowerCase() !== "off"

export type AutoIntakeResult = { mode: "log" | "on"; done: string[]; waiting: string[]; failed: string[] }

type Admin = NonNullable<ReturnType<typeof createAdminClient>>
type Steps = Pick<IntakeStep, "step_key" | "state" | "detail" | "error" | "created_at" | "updated_at">[]
type State = {
  lead: IntakeLead
  steps: Steps
  portal: boolean
  slack: boolean
  tasks: boolean
  text: boolean
  lexi: boolean
}

const BY = "Automatic"
const CLOSED: IntakeLead["status"][] = ["canceled", "stopped", "failed", "done"]
// A run that died (a timeout) frees the lead after this long.
const LOCK = "auto_lock"
const LOCK_TTL = 3 * 60 * 1000
// A step the automation tried and Clio or Slack refused (an attorney who isn't
// a Clio user, say) waits this long before the automation tries it again, so
// one stuck lead doesn't spend every sync on the same error. Its button on the
// lead page works any time.
const RETRY_AFTER = 60 * 60 * 1000
// Clio's rate limit (50 a minute) clears within a minute: try again sooner.
const RETRY_BUSY = 3 * 60 * 1000
const busy = (error: string | null) => /failed \(429\)|rate limit/i.test(error ?? "")

async function load(admin: Admin, leadId: string): Promise<State | null> {
  const [{ data: lead }, { data: steps }] = await Promise.all([
    admin.from("intake_leads").select("*").eq("id", leadId).maybeSingle(),
    admin.from("intake_steps").select("step_key, state, detail, error, created_at, updated_at").eq("lead_id", leadId),
  ])
  if (!lead) return null
  const rows = (steps ?? []) as Steps
  const done = (key: string) => rows.some((s) => s.step_key === key && s.state === "done")
  return {
    lead,
    steps: rows,
    portal: Boolean(lead.clio_portal_id) || done("clio_portal_sent"),
    slack: done("slack_posted"),
    tasks: done("clio_tasks"),
    text: done("clio_text_sent"),
    lexi: done("lexi_followups"),
  }
}

/** Bookings the automation is for: new Acuity consults, still open, conflict clear, consult ahead. */
function inScope(lead: IntakeLead) {
  return (
    lead.source === "acuity" &&
    !CLOSED.includes(lead.status) &&
    new Date(lead.created_at).getTime() >= new Date(autoIntakeFrom()).getTime() &&
    lead.conflict_status === "clear" &&
    Boolean(lead.consulting_attorney) &&
    Boolean(lead.consult_datetime) &&
    new Date(lead.consult_datetime!).getTime() > Date.now()
  )
}

/** The advocate's Clio name, only for the four real advocates. */
const advocateOf = (lead: IntakeLead) =>
  lead.assigned_advocate ? ADVOCATE_CLIO_NAMES[lead.assigned_advocate] ?? null : null

/** The automation's own attempt at this step failed within RETRY_AFTER. */
function backingOff(s: State, failureKey: string) {
  return s.steps.some(
    (x) =>
      x.step_key === failureKey &&
      x.state === "failed" &&
      (x.detail as { by?: string } | null)?.by === BY &&
      Date.now() - new Date(x.updated_at).getTime() < (busy(x.error) ? RETRY_BUSY : RETRY_AFTER)
  )
}

/** The automation picked the advocate after staff had posted the consult in Slack by hand. */
function advocateNoteDue(s: State) {
  const step = (key: string) => s.steps.find((x) => x.step_key === key)
  return (
    Boolean(advocateOf(s.lead)) &&
    (step("advocate_assigned")?.detail as { by?: string } | null)?.by === BY &&
    (step("slack_posted")?.detail as { action?: string } | null)?.action === "detected" &&
    !step("slack_advocate_note") &&
    !backingOff(s, "slack_advocate_note_failed")
  )
}

/** Is there anything the automation could still do, without asking Clio or Slack? */
function workLeft(s: State) {
  const advocate = Boolean(advocateOf(s.lead))
  const slack = (advocate && !s.slack && !backingOff(s, "slack_post")) || advocateNoteDue(s)
  // With auto matter creation off, a matterless lead waits for the Grow-pushed
  // matter; only the Slack post (which needs no matter) is work the automation
  // can still do.
  if (!s.lead.clio_matter_id) return clioAutoMatter() ? !backingOff(s, "clio_create") || slack : slack
  return (
    slack ||
    (advocate && !s.portal && !backingOff(s, "clio_portal")) ||
    (advocate && !s.tasks && !backingOff(s, "clio_tasks"))
  )
}

/** One run per lead at a time: Acuity can resend a booking while the first run is still writing. */
async function takeLock(admin: Admin, leadId: string) {
  const now = new Date().toISOString()
  const { error } = await admin
    .from("intake_steps")
    .insert({ lead_id: leadId, step_key: LOCK, state: "running", created_at: now, updated_at: now })
  if (!error) return true
  const { data } = await admin
    .from("intake_steps")
    .update({ updated_at: now })
    .eq("lead_id", leadId)
    .eq("step_key", LOCK)
    .lt("updated_at", new Date(Date.now() - LOCK_TTL).toISOString())
    .select("id")
  return Boolean(data?.length)
}

/**
 * Do (or, in log mode, list) every intake step that can be done for this lead
 * now. Returns null when the lead isn't one for the automation or nothing is
 * left to do.
 */
export async function runAutoIntake(leadId: string): Promise<AutoIntakeResult | null> {
  const mode = autoIntakeMode()
  const admin = createAdminClient()
  if (mode === "off" || !admin) return null

  let first = await load(admin, leadId)
  if (!first || !inScope(first.lead)) return null
  if (mode === "on" && !advocateOf(first.lead) && (await autoAssignAdvocate(admin, first.lead).catch(() => null))) {
    first = (await load(admin, leadId)) ?? first
  }
  if (!workLeft(first)) return null
  if (!(await takeLock(admin, leadId))) return null

  try {
    // What staff already did straight in Clio or Slack counts first.
    await Promise.all([syncLeadFromClio(first.lead).catch(() => []), syncSlackPosts([first.lead]).catch(() => [])])
    const s = await load(admin, leadId)
    if (!s || !inScope(s.lead)) return null
    return await work(admin, s, mode)
  } finally {
    await admin.from("intake_steps").delete().eq("lead_id", leadId).eq("step_key", LOCK)
  }
}

async function work(admin: Admin, s: State, mode: "log" | "on"): Promise<AutoIntakeResult> {
  const dry = mode === "log"
  const lead = s.lead
  const done: string[] = []
  const waiting: string[] = []
  const failed: string[] = []
  const step = (step_key: string, state: IntakeStep["state"], detail: Record<string, unknown>, error?: string) =>
    logStep(admin, { lead_id: lead.id, step_key, state, detail: { ...detail, by: BY }, error: error ?? null })
  const why = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback)

  const advocate = advocateOf(lead)
  // The lead page's warning: Acuity and Grow are typed separately, so a typo
  // can split one client into two spellings. Nothing goes to the client or the
  // team under a name that might be wrong.
  const grow = growState(s.steps).noted
  const nameIssue =
    grow && nameDiffers(lead.client_first, lead.client_last, grow.clientName)
      ? `Clio Grow spells the name "${grow.clientName}"`
      : null

  // ── Clio contact and matter ──
  let matterId = lead.clio_matter_id
  let contactId = lead.clio_client_contact_id
  let matterComing = false
  if (!matterId) {
    if (!clioAutoMatter()) waiting.push("Clio matter: waiting for the matter pushed from Clio Grow (Convert to Clio Manage)")
    else if (backingOff(s, "clio_create")) waiting.push("Clio matter: tries again an hour after the last error")
    else if (!(await clioStatus()).connected) waiting.push("Clio matter: Clio is not connected")
    else {
      try {
        // A contact with this email or phone under another name is someone
        // else sharing it (a spouse, a parent who booked): staff decide.
        const found = await findClioContact(lead)
        if (found.other) waiting.push(`Clio matter: the Clio contact with this ${found.other.by} is "${found.other.contact.name}"`)
        else if (dry) {
          done.push("create the Clio contact and matter")
          matterComing = true
        } else {
          const plan = await planClioCreate(lead)
          const r = await executeClioPlan(plan)
          matterId = String(r.matterId)
          contactId = String(r.contactId)
          await admin
            .from("intake_leads")
            .update({
              clio_client_contact_id: contactId,
              clio_matter_id: matterId,
              clio_op_contact_id: r.opContactId ? String(r.opContactId) : null,
              status: "matter_created",
            })
            .eq("id", lead.id)
          await step("clio_contact", "done", { contact_id: r.contactId, action: "reuseId" in plan.contact ? "reused" : "created" })
          await step("clio_matter", "done", { matter_id: r.matterId, display: r.display, action: r.reused ? "reused" : "created", notes: plan.notes })
          if (r.opError) await step("clio_opposing_party", "failed", { matter_id: r.matterId }, r.opError)
          else if (r.opContactId) await step("clio_opposing_party", "done", { contact_id: r.opContactId })
          await clearFailure(admin, lead.id, "clio_create")
          done.push(r.reused ? `linked Clio matter ${r.display}` : `created Clio matter ${r.display}`)
        }
      } catch (e) {
        const msg = why(e, "Clio rejected the entry.")
        if (!dry) await step("clio_create", "failed", { phase: "auto" }, msg)
        failed.push(`Clio matter: ${msg}`)
      }
    }
  }
  const hasMatter = Boolean(matterId && contactId) || matterComing

  // A matter linked in this run can already carry the client's portal and
  // tasks: a second booking for the same person reuses the first booking's
  // matter. The sync before this run couldn't see them without the matter, so
  // look again before sending anything.
  let portalDone = s.portal
  let tasksDone = s.tasks
  if (!dry && matterId && contactId && matterId !== lead.clio_matter_id) {
    await syncLeadFromClio({ ...lead, clio_matter_id: matterId, clio_client_contact_id: contactId, clio_portal_id: null }).catch(() => [])
    const fresh = await load(admin, lead.id)
    if (fresh) {
      portalDone = fresh.portal
      tasksDone = fresh.tasks
    }
  }

  // ── Client portal invite ──
  if (!portalDone) {
    if (!hasMatter) waiting.push("Portal invite: needs the Clio matter")
    else if (!advocate) waiting.push("Portal invite: needs the advocate")
    else if (nameIssue) waiting.push(`Portal invite: ${nameIssue}`)
    else if (backingOff(s, "clio_portal")) waiting.push("Portal invite: tries again an hour after the last error")
    else if (dry) done.push("send the portal invite")
    else {
      try {
        const r = await sendClioPortalInvite({
          matterId: matterId!,
          contactId: contactId!,
          advocate,
          attorney: lead.consulting_attorney,
          subject: PORTAL_SUBJECT,
          body: portalInviteText(lead.client_first),
        })
        await admin.from("intake_leads").update({ clio_portal_id: String(r.conversationId ?? r.messageId) }).eq("id", lead.id)
        await step("clio_portal_sent", "done", { action: "sent", conversation_id: r.conversationId, members: r.members, notes: r.notes })
        await clearFailure(admin, lead.id, "clio_portal")
        done.push("sent the portal invite")
      } catch (e) {
        const msg = why(e, "Clio rejected the portal invite.")
        await step("clio_portal", "failed", {}, msg)
        failed.push(`Portal invite: ${msg}`)
      }
    }
  }

  // ── #initialconsultations post ──
  if (!s.slack) {
    if (!slackConfigured()) waiting.push("Slack post: Slack is not connected")
    else if (!advocate) waiting.push("Slack post: needs the advocate")
    else if (nameIssue) waiting.push(`Slack post: ${nameIssue}`)
    else if (backingOff(s, "slack_post")) waiting.push("Slack post: tries again an hour after the last error")
    else {
      const { data: appt } = await admin
        .from("appointments")
        .select("datetime, end_time, location, paid:raw->>paid, notes:raw->>notes")
        .eq("lead_id", lead.id)
        .eq("canceled", false)
        .order("datetime", { ascending: false })
        .limit(1)
        .maybeSingle()
      const a = appt as { datetime: string | null; end_time: string | null; location: string | null; paid: string | null; notes: string | null } | null
      const { location } = await consultLocation(admin, lead, a?.location ?? null)
      const post = consultPost({
        lead,
        method: consultMethod(lead.method, location),
        start: lead.consult_datetime ?? a?.datetime ?? null,
        end: a?.end_time ?? null,
        feePaid: a?.paid ?? null,
        description: lead.description ?? a?.notes ?? null,
      })
      if (!post.text) waiting.push(`Slack post: needs the ${post.missing.join(" and ")}`)
      else if (dry) done.push("post in #initialconsultations")
      else {
        try {
          const people = postMentions(lead)
          const ids = await slackUserIds(people.map((p) => p.name))
          let body = slackEscape(post.text)
          for (const p of people) if (ids[p.name]) body = body.split(p.token).join(`<@${ids[p.name]}>`)
          const posted = await postToChannel(INITIAL_CONSULTS_CHANNEL, body)
          await step("slack_posted", "done", { action: "sent", ts: posted.ts, link: posted.link })
          await clearFailure(admin, lead.id, "slack_post")
          done.push("posted in #initialconsultations")
        } catch (e) {
          const msg = why(e, "Slack post failed.")
          await step("slack_post", "failed", {}, msg)
          failed.push(`Slack post: ${msg}`)
        }
      }
    }
  }

  // ── The advocate, in the thread of a post staff made without one ──
  // Staff post self-scheduled consults by hand with "Assigned Advocate:
  // @Client" (who booked). Once the automation picks the advocate, it says so
  // under that post and tags them, so Slack never lacks the advocate.
  if (advocateNoteDue(s) && slackConfigured() && !dry) {
    const ts = (s.steps.find((x) => x.step_key === "slack_posted")?.detail as { ts?: string } | null)?.ts
    try {
      const text = ts ? await messageText(INITIAL_CONSULTS_CHANNEL, ts) : null
      const line = text?.match(/Assigned Advocate:[ \t]*([^\r\n]*)/i)?.[1]?.trim() ?? ""
      if (!ts || !text || !/^@?(client|other)?$/i.test(line)) {
        // The post is gone, or already names someone: nothing to add.
        await step("slack_advocate_note", "done", { skipped: !text ? "post not found" : `post names ${line}` })
      } else {
        const name = ADVOCATE_CLIO_NAMES[lead.assigned_advocate!] ?? lead.assigned_advocate!
        const ids = await slackUserIds([name])
        const who = ids[name] ? `<@${ids[name]}>` : name
        const posted = await postToChannel(
          INITIAL_CONSULTS_CHANNEL,
          `Assigned Advocate: ${who} (picked automatically by the dashboard)`,
          ts
        )
        await step("slack_advocate_note", "done", { ts: posted.ts, link: posted.link, advocate: lead.assigned_advocate })
        await clearFailure(admin, lead.id, "slack_advocate_note_failed")
        done.push("added the advocate under the Slack post")
      }
    } catch (e) {
      const msg = why(e, "Slack didn't take the reply.")
      await step("slack_advocate_note_failed", "failed", {}, msg)
      failed.push(`Slack advocate reply: ${msg}`)
    }
  }

  // ── Follow-up tasks ──
  if (!tasksDone) {
    if (!hasMatter) waiting.push("Follow-up tasks: need the Clio matter")
    else if (!advocate) waiting.push("Follow-up tasks: need the advocate")
    else if (backingOff(s, "clio_tasks")) waiting.push("Follow-up tasks: try again an hour after the last error")
    else if (dry) done.push("create the follow-up tasks")
    else {
      try {
        const consultAt = lead.consult_datetime!
        const r = await createFollowUpTasks({
          matterId: matterId!,
          advocate,
          consultDay: consultDay(consultAt),
          tasks: followUpPlan(consultAt),
        })
        await step("clio_tasks", "done", { action: "created", assignee: r.assignee, created: r.created, skipped: r.skipped })
        done.push("created the follow-up tasks")
      } catch (e) {
        const msg = why(e, "Clio rejected the tasks.")
        await step("clio_tasks", "failed", {}, msg)
        failed.push(`Follow-up tasks: ${msg}`)
      }
    }
  }

  // One row per lead says what the automation did, or would do in a test run.
  if (dry) await step("auto_intake", "pending", { mode: "log", done, waiting, failed })
  else if (done.length || failed.length) await step("auto_intake", "done", { mode: "on", done, waiting, failed })
  if (!dry) await autoSignoff(lead.id)
  return { mode, done, waiting, failed }
}

/**
 * Approve the intake once every step is done, the ones staff did by hand (the
 * Clio text, Lexi) included, so nobody has to click Approve. Returns true when
 * it approved.
 */
export async function autoSignoff(leadId: string): Promise<boolean> {
  const admin = createAdminClient()
  if (autoIntakeMode() !== "on" || !admin) return false
  const s = await load(admin, leadId)
  if (!s) return false
  const lead = s.lead
  const ready =
    lead.source === "acuity" &&
    !CLOSED.includes(lead.status) &&
    new Date(lead.created_at).getTime() >= new Date(autoIntakeFrom()).getTime() &&
    lead.conflict_status === "clear" &&
    Boolean(lead.clio_matter_id) &&
    s.portal &&
    s.slack &&
    s.tasks &&
    s.text &&
    s.lexi
  if (!ready) return false
  const { error } = await admin.from("intake_leads").update({ status: "done" }).eq("id", leadId)
  if (error) return false
  await logStep(admin, { lead_id: leadId, step_key: "final_signoff", state: "done", detail: { by: BY } })
  return true
}

/** For the open-leads sync: retry leads the automation could still move on. */
export async function runAutoIntakeForOpenLeads(limit = 2) {
  const admin = createAdminClient()
  if (autoIntakeMode() !== "on" || !admin) return { checked: 0, ran: 0 }
  const { data } = await admin
    .from("intake_leads")
    .select("id")
    .eq("source", "acuity")
    .eq("conflict_status", "clear")
    .not("status", "in", "(canceled,stopped,failed,done)")
    .gte("created_at", autoIntakeFrom())
    .gt("consult_datetime", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(15)
  let checked = 0
  let ran = 0
  for (const { id } of data ?? []) {
    if (ran >= limit) break
    checked++
    const r = await runAutoIntake(id).catch(() => null)
    if (r && (r.done.length || r.failed.length)) ran++
  }
  return { checked, ran }
}

/** A sentence for the lead page's toast after a gate opened the way. */
export function autoIntakeMessage(r: AutoIntakeResult | null): string {
  if (!r) return ""
  if (r.mode === "log") return r.done.length ? ` Test run: it would ${r.done.join(", ")}.` : ""
  const parts = [
    r.done.length ? `Done automatically: ${r.done.join(", ")}.` : "",
    r.failed.length ? `Didn't go through: ${r.failed.join("; ")}.` : "",
  ].filter(Boolean)
  return parts.length ? ` ${parts.join(" ")}` : ""
}
