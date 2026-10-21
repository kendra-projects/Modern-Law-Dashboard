import "server-only"

import { clioFetch, clioStatus } from "@/lib/clio"
import { contactMatters, findClioContact, matterTaskNames } from "@/lib/clio-intake"
import { FOLLOW_UPS } from "@/lib/follow-ups"
import { createAdminClient } from "@/lib/supabase/admin"
import { clearFailure, logStep } from "@/lib/intake-step-log"
import type { IntakeLead } from "@/types/database"

// Staff still do parts of the intake straight in Clio. This brings that work
// back to the dashboard: it READS Clio and only writes our own tables, so the
// lead's progress is right whether the work was done here or in Clio.
// Clio Texting has no API, so a text sent from Clio can't be seen here.
// Found: the contact, the matter, the client portal and the follow-up tasks.

const EARLY: IntakeLead["status"][] = ["received", "enriched", "conflict_pending", "conflict_clear"]
const DAY = 24 * 60 * 60 * 1000

type Lead = Pick<
  IntakeLead,
  "id" | "client_first" | "client_last" | "email" | "phone" | "status" | "created_at" | "clio_client_contact_id" | "clio_matter_id" | "clio_portal_id"
>

type Conversation = { id: number; memberships?: { member?: { id: number; type: string } | null }[] | null }

/** What changed for one lead, for the caller to report. */
export async function syncLeadFromClio(lead: Lead): Promise<string[]> {
  const admin = createAdminClient()
  if (!admin) return []
  const changes: string[] = []
  // Replaces a failed attempt of the same step (e.g. tasks that failed from the
  // dashboard and were then made by hand).
  const log = (step_key: string, detail: Record<string, unknown>) =>
    logStep(admin, { lead_id: lead.id, step_key, state: "done", detail: { action: "detected", ...detail } })

  let contactId = lead.clio_client_contact_id
  if (!contactId) {
    const { contact } = await findClioContact(lead)
    if (contact) {
      contactId = String(contact.id)
      await admin.from("intake_leads").update({ clio_client_contact_id: contactId }).eq("id", lead.id)
      await log("clio_contact", { contact_id: contact.id })
      changes.push("contact")
    }
  }

  let matterId = lead.clio_matter_id
  if (!matterId && contactId) {
    // The consult's matter is one opened for this person around or after the
    // booking. Only link when exactly one fits; otherwise staff pick it with the
    // Link button on the lead page, which shows every matter.
    const since = new Date(lead.created_at).getTime() - 3 * DAY
    const fits = (await contactMatters(Number(contactId))).filter(
      (m) => new Date(m.created_at).getTime() >= since && m.status !== "Closed"
    )
    if (fits.length === 1) {
      matterId = String(fits[0].id)
      await admin
        .from("intake_leads")
        .update({ clio_matter_id: matterId, ...(EARLY.includes(lead.status) ? { status: "matter_created" as const } : {}) })
        .eq("id", lead.id)
      await log("clio_matter", { matter_id: fits[0].id, display: fits[0].display_number })
      // Staff made it in Clio themselves, so a failed automatic create is settled.
      await clearFailure(admin, lead.id, "clio_create")
      changes.push("matter")
    }
  }

  if (matterId && contactId && !lead.clio_portal_id) {
    const fields = encodeURIComponent("id,memberships{member}")
    const res = await clioFetch<{ data: Conversation[] }>(
      `/api/v4/conversations?for_user=true&matter_id=${matterId}&fields=${fields}&limit=50`
    )
    // A portal is a conversation on the matter with the client in it.
    const portal = res.data.find((c) =>
      (c.memberships ?? []).some((m) => m.member && m.member.type !== "User" && String(m.member.id) === contactId)
    )
    if (portal) {
      await admin.from("intake_leads").update({ clio_portal_id: String(portal.id) }).eq("id", lead.id)
      const { data: marked } = await admin
        .from("intake_steps")
        .select("id")
        .eq("lead_id", lead.id)
        .eq("step_key", "clio_portal_sent")
        .eq("state", "done")
        .limit(1)
      if (!marked?.length) await log("clio_portal_sent", { conversation_id: portal.id })
      await clearFailure(admin, lead.id, "clio_portal")
      changes.push("portal")
    }
  }

  if (matterId) {
    const { data: logged } = await admin
      .from("intake_steps")
      .select("id")
      .eq("lead_id", lead.id)
      .eq("step_key", "clio_tasks")
      .eq("state", "done")
      .limit(1)
    if (!logged?.length) {
      const names = await matterTaskNames(matterId)
      if (FOLLOW_UPS.every((t) => names.has(t.name.toLowerCase()))) {
        await log("clio_tasks", {})
        changes.push("tasks")
      }
    }
  }

  return changes
}

/**
 * Sync the open leads that still have something Clio could fill in: those
 * without a matter first (up to four Clio reads each), then those waiting on
 * a portal (two reads each). Capped so a run stays inside Clio's rate limit;
 * newest first, since that is where staff are working.
 */
export async function syncOpenLeadsFromClio() {
  const admin = createAdminClient()
  if (!admin || !(await clioStatus()).connected) return { checked: 0, changed: 0 }
  const open = () =>
    admin
      .from("intake_leads")
      .select("id, client_first, client_last, email, phone, status, created_at, clio_client_contact_id, clio_matter_id, clio_portal_id")
      .not("status", "in", "(canceled,stopped,failed)")
      .gte("created_at", new Date(Date.now() - 30 * DAY).toISOString())
      .order("created_at", { ascending: false })
  const [{ data: noMatter }, { data: noPortal }] = await Promise.all([
    open().is("clio_matter_id", null).limit(6),
    open().not("clio_matter_id", "is", null).is("clio_portal_id", null).limit(10),
  ])
  const leads = [...(noMatter ?? []), ...(noPortal ?? [])]

  let changed = 0
  for (const lead of leads) {
    try {
      if ((await syncLeadFromClio(lead)).length) changed++
    } catch {
      // One lead failing to read (a Clio hiccup) shouldn't stop the rest.
    }
  }
  return { checked: leads.length, changed }
}
