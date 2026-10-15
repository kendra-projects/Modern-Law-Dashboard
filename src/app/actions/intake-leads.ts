"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { TablesInsert } from "@/types/database"
import { getRole, canSeeIntake } from "@/lib/role"
import { planClioCreate, executeClioPlan, sendClioPortalInvite, createFollowUpTasks } from "@/lib/clio-intake"
import { consultDay, followUpPlan } from "@/lib/follow-ups"
import { ADVOCATE_CLIO_NAMES } from "@/lib/intake"
import { PORTAL_SUBJECT, portalInviteText } from "@/lib/client-messages"
import { postMentions, slackEscape } from "@/lib/consult-post"
import { INITIAL_CONSULTS_CHANNEL, postToChannel, slackUserIds } from "@/lib/slack"
import { addGrowNoteTo } from "@/lib/grow-sync"
import { clearFailure, logStep } from "@/lib/intake-step-log"
import { autoIntakeMessage, autoSignoff, runAutoIntake } from "@/lib/auto-intake"

export type ActionResult = { ok: boolean; message: string }

// ── Human gates ──────────────────────────────────────────────────────────────
// These are the parts of the intake flow that a person decides, not an API.
// They only touch our own tables, so they work today, before any Clio/Acuity
// access exists. Each records an intake_steps row so the lead's timeline tells
// the story of who cleared/assigned what.

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

/**
 * Conflict-check gate. A clear result lets the automation continue; a conflict
 * stops the whole lead (nothing downstream should ever run for it).
 */
export async function setConflictDecision(
  leadId: string,
  decision: "clear" | "conflict"
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, message: "Not authenticated." }

  const cleared = decision === "clear"
  const { data: current } = await supabase
    .from("intake_leads")
    .select("status")
    .eq("id", leadId)
    .maybeSingle()
  if (!current) return { ok: false, message: "Lead not found." }
  if (current.status === "canceled") return { ok: false, message: "This lead is canceled." }

  // Clearing only moves an early-stage lead forward; a lead already further
  // along (e.g. matter created) keeps its status. A conflict always stops it.
  const early = ["received", "enriched", "conflict_pending"].includes(current.status)
  const { error } = await supabase
    .from("intake_leads")
    .update({
      conflict_status: decision,
      ...(cleared ? (early ? { status: "conflict_clear" as const } : {}) : { status: "stopped" as const }),
    })
    .eq("id", leadId)

  if (error) return { ok: false, message: "Could not save the conflict decision." }

  await supabase.from("intake_steps").insert({
    lead_id: leadId,
    step_key: "conflict_check",
    state: cleared ? "done" : "failed",
    detail: { decision, by: user.email ?? user.id },
    error: cleared ? null : "Conflict found — lead stopped.",
  })

  revalidatePath(`/intake/${leadId}`)
  revalidatePath("/intake")
  revalidatePath("/")
  return {
    ok: true,
    message: cleared ? "Conflict check cleared." : "Conflict found — lead stopped.",
  }
}

/** Assign the lead to an advocate. Human choice; no API involved. */
export async function assignAdvocate(
  leadId: string,
  advocate: string
): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, message: "Not authenticated." }

  const clean = advocate.trim()
  if (!clean) return { ok: false, message: "Pick an advocate first." }

  const { error } = await supabase
    .from("intake_leads")
    .update({ assigned_advocate: clean })
    .eq("id", leadId)

  if (error) return { ok: false, message: "Could not assign the advocate." }

  // Replaces the earlier row when the advocate is changed.
  await logStep(supabase, {
    lead_id: leadId,
    step_key: "advocate_assigned",
    state: "done",
    detail: { advocate: clean, by: user.email ?? user.id },
  })

  const auto = await runAutoIntake(leadId).catch(() => null)

  revalidatePath(`/intake/${leadId}`)
  revalidatePath("/intake")
  return { ok: true, message: `Assigned to ${clean}.${autoIntakeMessage(auto)}` }
}

/**
 * Recovery: clear a failure that no longer matters (done some other way, or
 * not needed for this lead). The row stays in the lead's history marked
 * dismissed; the step itself is still done from the lead page.
 */
export async function dismissStep(stepId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, message: "Not authenticated." }
  if (!canSeeIntake(await getRole())) return { ok: false, message: "Not allowed." }

  const { data: row } = await supabase.from("intake_steps").select("lead_id, state, detail").eq("id", stepId).maybeSingle()
  if (!row) return { ok: false, message: "Step not found." }
  if (row.state !== "failed") return { ok: false, message: "Only failed steps can be dismissed." }

  const detail = { ...((row.detail ?? {}) as Record<string, unknown>), dismissed_by: user.email ?? user.id }
  const { error } = await supabase
    .from("intake_steps")
    .update({ state: "skipped", detail, updated_at: new Date().toISOString() })
    .eq("id", stepId)
  if (error) return { ok: false, message: "Could not dismiss it." }

  revalidatePath("/intake/recovery")
  revalidatePath(`/intake/${row.lead_id}`)
  return { ok: true, message: "Dismissed." }
}

/**
 * Final sign-off: a person confirms the intake is complete. Replaces the Slack
 * "one required human sign-off". Needs the conflict cleared and a Clio matter.
 */
export async function approveIntake(leadId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, message: "Not authenticated." }
  if (!canSeeIntake(await getRole())) return { ok: false, message: "Not allowed." }

  const { data: lead } = await supabase
    .from("intake_leads")
    .select("status, conflict_status, clio_matter_id")
    .eq("id", leadId)
    .maybeSingle()
  if (!lead) return { ok: false, message: "Lead not found." }
  if (lead.status === "done") return { ok: true, message: "Already approved." }
  if (["canceled", "stopped", "failed"].includes(lead.status))
    return { ok: false, message: `This lead is ${lead.status}.` }
  if (lead.conflict_status !== "clear") return { ok: false, message: "Clear the conflict check first." }
  if (!lead.clio_matter_id) return { ok: false, message: "Create it in Clio first." }

  const { error } = await supabase.from("intake_leads").update({ status: "done" }).eq("id", leadId)
  if (error) return { ok: false, message: "Could not save the approval." }

  await supabase.from("intake_steps").insert({
    lead_id: leadId,
    step_key: "final_signoff",
    state: "done",
    detail: { by: user.email ?? user.id },
  })

  revalidatePath(`/intake/${leadId}`)
  revalidatePath("/intake")
  revalidatePath("/")
  return { ok: true, message: "Approved. Intake complete." }
}

/**
 * Open the client's portal in Clio and send the firm's welcome message; Clio
 * emails the invite. Writes to the live Clio and reaches the client, so it only
 * runs from the button, once per lead (clio_portal_id).
 */
export async function sendPortalInvite(leadId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, message: "Not authenticated." }
  if (!canSeeIntake(await getRole())) return { ok: false, message: "Not allowed." }

  const { data: lead } = await supabase.from("intake_leads").select("*").eq("id", leadId).maybeSingle()
  if (!lead) return { ok: false, message: "Lead not found." }
  if (lead.clio_portal_id) return { ok: true, message: "The portal invite was already sent." }
  if (["canceled", "stopped", "failed"].includes(lead.status)) return { ok: false, message: `This lead is ${lead.status}.` }
  if (lead.conflict_status !== "clear") return { ok: false, message: "Clear the conflict check first." }
  if (!lead.clio_matter_id || !lead.clio_client_contact_id) return { ok: false, message: "Create it in Clio first." }

  // Staff may have opened the portal by hand and marked it sent.
  const { data: marked } = await supabase
    .from("intake_steps")
    .select("id")
    .eq("lead_id", leadId)
    .eq("step_key", "clio_portal_sent")
    .eq("state", "done")
    .limit(1)
  if (marked?.length) return { ok: true, message: "The portal invite was already marked as sent." }

  try {
    const r = await sendClioPortalInvite({
      matterId: lead.clio_matter_id,
      contactId: lead.clio_client_contact_id,
      advocate: lead.assigned_advocate ? ADVOCATE_CLIO_NAMES[lead.assigned_advocate] ?? lead.assigned_advocate : null,
      attorney: lead.consulting_attorney,
      subject: PORTAL_SUBJECT,
      body: portalInviteText(lead.client_first),
    })
    await supabase
      .from("intake_leads")
      .update({ clio_portal_id: String(r.conversationId ?? r.messageId) })
      .eq("id", leadId)
    await logStep(supabase, {
      lead_id: leadId,
      step_key: "clio_portal_sent",
      state: "done",
      detail: {
        action: "sent",
        conversation_id: r.conversationId,
        members: r.members,
        notes: r.notes,
        by: user.email ?? user.id,
      },
    })
    await clearFailure(supabase, leadId, "clio_portal")
    revalidatePath(`/intake/${leadId}`)
    return { ok: true, message: ["Portal invite sent.", ...r.notes].join(" ") }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Clio rejected the portal invite."
    await logStep(supabase, {
      lead_id: leadId,
      step_key: "clio_portal",
      state: "failed",
      detail: { by: user.email ?? user.id },
      error: msg,
    })
    revalidatePath(`/intake/${leadId}`)
    return { ok: false, message: msg }
  }
}

/**
 * Checklist step 11: the three follow-up tasks on the Clio matter, due one and
 * two business days after the consult, assigned to the advocate. Writes to
 * the live Clio, so it only runs from the button, once per lead.
 */
export async function createFollowUps(leadId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, message: "Not authenticated." }
  if (!canSeeIntake(await getRole())) return { ok: false, message: "Not allowed." }

  const { data: lead } = await supabase.from("intake_leads").select("*").eq("id", leadId).maybeSingle()
  if (!lead) return { ok: false, message: "Lead not found." }
  if (["canceled", "stopped", "failed"].includes(lead.status)) return { ok: false, message: `This lead is ${lead.status}.` }
  if (lead.conflict_status !== "clear") return { ok: false, message: "Clear the conflict check first." }
  if (!lead.clio_matter_id) return { ok: false, message: "Create it in Clio first." }
  if (!lead.assigned_advocate) return { ok: false, message: "Assign an advocate first." }

  const { data: done } = await supabase
    .from("intake_steps")
    .select("id")
    .eq("lead_id", leadId)
    .eq("step_key", "clio_tasks")
    .eq("state", "done")
    .limit(1)
  if (done?.length) return { ok: true, message: "Follow-up tasks are already in Clio." }

  const { data: appt } = await supabase
    .from("appointments")
    .select("datetime")
    .eq("lead_id", leadId)
    .eq("canceled", false)
    .order("datetime", { ascending: false })
    .limit(1)
    .maybeSingle()
  const consultAt = lead.consult_datetime ?? appt?.datetime
  if (!consultAt) return { ok: false, message: "The consult date isn't known yet." }

  try {
    const r = await createFollowUpTasks({
      matterId: lead.clio_matter_id,
      advocate: ADVOCATE_CLIO_NAMES[lead.assigned_advocate] ?? lead.assigned_advocate,
      consultDay: consultDay(consultAt),
      tasks: followUpPlan(consultAt),
    })
    // Same key as a failed attempt, so this replaces it.
    await logStep(supabase, {
      lead_id: leadId,
      step_key: "clio_tasks",
      state: "done",
      detail: { action: "created", assignee: r.assignee, created: r.created, skipped: r.skipped, by: user.email ?? user.id },
    })
    revalidatePath(`/intake/${leadId}`)
    const extra = r.skipped.length ? ` Already in Clio: ${r.skipped.join(", ")}.` : ""
    return { ok: true, message: `Created ${r.created.length} follow-up task${r.created.length === 1 ? "" : "s"} for ${r.assignee}.${extra}` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Clio rejected the tasks."
    await logStep(supabase, {
      lead_id: leadId,
      step_key: "clio_tasks",
      state: "failed",
      detail: { by: user.email ?? user.id },
      error: msg,
    })
    revalidatePath(`/intake/${leadId}`)
    return { ok: false, message: msg }
  }
}

/**
 * Record that staff checked the client's LexiDesk follow-ups: paused them, or
 * found none pending. LexiDesk has no API, so the pause itself is done there.
 */
export async function markLexiFollowUps(leadId: string, result: "paused" | "none"): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, message: "Not authenticated." }
  if (!canSeeIntake(await getRole())) return { ok: false, message: "Not allowed." }

  const { data: already } = await supabase
    .from("intake_steps")
    .select("id")
    .eq("lead_id", leadId)
    .eq("step_key", "lexi_followups")
    .eq("state", "done")
    .limit(1)
  if (already?.length) return { ok: true, message: "Already recorded." }

  const { error } = await supabase.from("intake_steps").insert({
    lead_id: leadId,
    step_key: "lexi_followups",
    state: "done",
    detail: { by: user.email ?? user.id, result },
  })
  if (error) return { ok: false, message: "Could not save." }

  revalidatePath(`/intake/${leadId}`)
  return { ok: true, message: result === "paused" ? "Lexi follow-ups marked as paused." : "Recorded: nothing was pending in Lexi." }
}

/**
 * Record that staff sent the confirmation text or the portal invite from Clio,
 * or posted the consult in Slack themselves. Only our own log; the message
 * itself went out there.
 */
export async function markClientMessage(leadId: string, kind: "text" | "portal" | "slack"): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, message: "Not authenticated." }
  if (!canSeeIntake(await getRole())) return { ok: false, message: "Not allowed." }

  const stepKey = kind === "text" ? "clio_text_sent" : kind === "portal" ? "clio_portal_sent" : "slack_posted"
  const { data: lead } = await supabase.from("intake_leads").select("clio_matter_id").eq("id", leadId).maybeSingle()
  if (!lead) return { ok: false, message: "Lead not found." }
  if (kind !== "slack" && !lead.clio_matter_id) return { ok: false, message: "Create it in Clio first." }

  const { data: already } = await supabase
    .from("intake_steps")
    .select("id")
    .eq("lead_id", leadId)
    .eq("step_key", stepKey)
    .eq("state", "done")
    .limit(1)
  if (already?.length) return { ok: true, message: "Already marked as sent." }

  const { error } = await supabase.from("intake_steps").insert({
    lead_id: leadId,
    step_key: stepKey,
    state: "done",
    detail: { by: user.email ?? user.id },
  })
  if (error) return { ok: false, message: "Could not save." }
  // Done by hand, so an earlier failed attempt no longer needs anyone.
  if (kind === "slack") await clearFailure(supabase, leadId, "slack_post")
  if (kind === "portal") await clearFailure(supabase, leadId, "clio_portal")

  const approved = await autoSignoff(leadId).catch(() => false)
  revalidatePath(`/intake/${leadId}`)
  if (approved) revalidatePath("/intake")
  const base = kind === "text" ? "Text marked as sent." : kind === "portal" ? "Portal invite marked as sent." : "Slack post marked as done."
  return { ok: true, message: approved ? `${base} Every step is done, so the intake was approved.` : base }
}

/**
 * Checklist step 10: announce the consult in #initialconsultations. Staff
 * check and edit the drafted text first (the post is the human sign-off);
 * the attorney's and advocate's @names become real mentions here.
 */
export async function postConsultToSlack(leadId: string, text: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, message: "Not authenticated." }
  if (!canSeeIntake(await getRole())) return { ok: false, message: "Not allowed." }
  if (!text.trim()) return { ok: false, message: "The post is empty." }

  const { data: lead } = await supabase
    .from("intake_leads")
    .select("conflict_status, consulting_attorney, assigned_advocate")
    .eq("id", leadId)
    .maybeSingle()
  if (!lead) return { ok: false, message: "Lead not found." }
  if (lead.conflict_status !== "clear") return { ok: false, message: "Clear the conflict check first." }

  const { data: already } = await supabase
    .from("intake_steps")
    .select("id")
    .eq("lead_id", leadId)
    .eq("step_key", "slack_posted")
    .eq("state", "done")
    .limit(1)
  if (already?.length) return { ok: true, message: "Already posted." }

  const by = user.email ?? user.id
  try {
    const people = postMentions(lead)
    const ids = await slackUserIds(people.map((p) => p.name))
    let body = slackEscape(text.trim())
    for (const p of people) if (ids[p.name]) body = body.split(p.token).join(`<@${ids[p.name]}>`)

    const posted = await postToChannel(INITIAL_CONSULTS_CHANNEL, body)
    await logStep(supabase, {
      lead_id: leadId,
      step_key: "slack_posted",
      state: "done",
      detail: { by, action: "sent", ts: posted.ts, link: posted.link },
    })
    await clearFailure(supabase, leadId, "slack_post")
    revalidatePath(`/intake/${leadId}`)
    const untagged = people.filter((p) => !ids[p.name]).map((p) => p.name)
    return {
      ok: true,
      message: untagged.length
        ? `Posted in #initialconsultations. Not found in Slack, so not tagged: ${untagged.join(", ")}.`
        : "Posted in #initialconsultations.",
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Slack post failed."
    await logStep(supabase, { lead_id: leadId, step_key: "slack_post", state: "failed", error: msg, detail: { by } })
    revalidatePath(`/intake/${leadId}`)
    return { ok: false, message: msg }
  }
}

/**
 * Booking note in Clio Grow, from the lead page: staff picked the client's
 * matter (or pasted its link) because the automatic match couldn't be sure.
 * Adds a note only; nothing else on the Grow matter changes.
 */
export async function addGrowNote(leadId: string, matterRef: string): Promise<ActionResult> {
  const { user } = await requireUser()
  if (!user) return { ok: false, message: "Not authenticated." }
  if (!canSeeIntake(await getRole())) return { ok: false, message: "Not allowed." }
  const r = await addGrowNoteTo(leadId, matterRef, user.email ?? user.id)
  revalidatePath(`/intake/${leadId}`)
  return r
}

// ── Create in Clio ──────────────────────────────────────────────────────────
// Writes to the firm's live Clio: contact (reused if it already exists), matter
// (reused if staff made one for this client in the last 3 weeks), and the
// opposing party as a related contact. Idempotent per lead via clio_matter_id.

export async function createInClio(leadId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser()
  if (!user) return { ok: false, message: "Not authenticated." }
  if (!canSeeIntake(await getRole())) return { ok: false, message: "Not allowed." }

  const { data: lead } = await supabase.from("intake_leads").select("*").eq("id", leadId).maybeSingle()
  if (!lead) return { ok: false, message: "Lead not found." }
  if (lead.clio_matter_id) return { ok: true, message: "Already linked to a Clio matter." }
  if (lead.status === "canceled" || lead.status === "stopped")
    return { ok: false, message: `This lead is ${lead.status}; nothing was created.` }

  const step = (step_key: string, state: "done" | "failed", detail: Record<string, unknown>, error?: string) =>
    logStep(supabase, { lead_id: leadId, step_key, state, detail: { ...detail, by: user.email ?? user.id }, error: error ?? null })

  let plan
  try {
    plan = await planClioCreate(lead)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Couldn't prepare the Clio entry."
    await step("clio_create", "failed", { phase: "plan" }, msg)
    revalidatePath(`/intake/${leadId}`)
    return { ok: false, message: msg }
  }

  try {
    const r = await executeClioPlan(plan)
    await supabase
      .from("intake_leads")
      .update({
        clio_client_contact_id: String(r.contactId),
        clio_matter_id: String(r.matterId),
        clio_op_contact_id: r.opContactId ? String(r.opContactId) : null,
        status: "matter_created",
      })
      .eq("id", leadId)

    await step("clio_contact", "done", { contact_id: r.contactId, action: "reuseId" in plan.contact ? "reused" : "created" })
    await step("clio_matter", "done", { matter_id: r.matterId, display: r.display, action: r.reused ? "reused" : "created", notes: plan.notes })
    if (r.opError) await step("clio_opposing_party", "failed", { matter_id: r.matterId }, r.opError)
    else if (r.opContactId) await step("clio_opposing_party", "done", { contact_id: r.opContactId })
    await clearFailure(supabase, leadId, "clio_create")

    revalidatePath(`/intake/${leadId}`)
    revalidatePath("/intake")
    const base = r.reused ? `Linked to existing Clio matter ${r.display}.` : `Created Clio matter ${r.display}.`
    const extra = [r.opError ? `Opposing party not linked: ${r.opError}` : "", ...plan.notes].filter(Boolean).join(" ")
    return { ok: !r.opError, message: extra ? `${base} ${extra}` : base }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Clio rejected the entry."
    await step("clio_create", "failed", { phase: "write" }, msg)
    revalidatePath(`/intake/${leadId}`)
    return { ok: false, message: msg }
  }
}

// ── Manual lead entry ────────────────────────────────────────────────────────
// Lets the team create a lead by hand (advocate-scheduled bookings, or testing
// the queue before LexiDesk is wired). Same table LexiDesk posts to, source
// "manual" so we can always tell them apart.

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key)
  if (typeof v !== "string") return null
  const t = v.trim()
  return t.length ? t : null
}

export async function createManualLead(formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser()
  if (!user) redirect("/login")

  const priorityRaw = str(formData, "priority_score")
  const priority = priorityRaw ? Number(priorityRaw) : null

  const insert: TablesInsert<"intake_leads"> = {
    source: "manual",
    status: "received",
    client_first: str(formData, "client_first"),
    client_last: str(formData, "client_last"),
    email: str(formData, "email"),
    phone: str(formData, "phone"),
    method: (str(formData, "method") as TablesInsert<"intake_leads">["method"]) ?? null,
    office: (str(formData, "office") as TablesInsert<"intake_leads">["office"]) ?? null,
    consult_type:
      (str(formData, "consult_type") as TablesInsert<"intake_leads">["consult_type"]) ?? null,
    matter_type: str(formData, "matter_type"),
    opposing_party_name: str(formData, "opposing_party_name"),
    consulting_attorney: str(formData, "consulting_attorney"),
    county: str(formData, "county"),
    description: str(formData, "description"),
    priority_score: priority != null && Number.isFinite(priority) ? priority : null,
  }

  const { data, error } = await supabase
    .from("intake_leads")
    .insert(insert)
    .select("id")
    .maybeSingle()

  if (error) {
    // Surface nothing sensitive; the form page shows a generic failure via ?error.
    redirect("/intake/new?error=1")
  }

  revalidatePath("/intake")
  revalidatePath("/")
  redirect(data?.id ? `/intake/${data.id}` : "/intake")
}
