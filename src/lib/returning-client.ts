import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { clioFetch } from "@/lib/clio"
import { findClioContact } from "@/lib/clio-intake"
import { logStep } from "@/lib/intake-step-log"
import type { Database, IntakeLead, IntakeStep } from "@/types/database"

// A returning client: someone who already has an open or pending matter in
// Clio Manage when they book again. Only a person can tell whether the new
// booking is the same case (a client who meets with the attorney now and then
// for one case: another Limited Scope Strategy Session on the matter she has)
// or a new one (a separate case that needs its own Grow and Manage matter).
// (Kendra, 13 Nov 2026: Carla Magee's LSS was converted into a second Manage
// matter although her August LSS matter was still pending.)
//
// The check runs before the bot works the Grow matter (lib/bot.ts) and when
// the lead page opens. It records one intake_steps row, "returning_client":
//   awaiting_human  open matters found; staff decide on the lead page
//   done            decided: decision "same" (linked to that matter),
//                   "new" (the bot goes on as usual) or "none" (no open matter)
// While it waits, and for "same", the bot neither creates nor converts a Grow
// matter. Anyone with Intake access decides. Staff close the extra Grow lead by
// hand. Closed matters (an old divorce) don't count.

export const RETURNING = "returning_client"

export type OpenMatter = {
  id: string
  display: string
  status: string
  attorney: string | null
  opened: string | null
  /** Same originating attorney as this booking: a hint, not a decision. */
  same_attorney: boolean
}
export type ReturningDetail = {
  matters?: OpenMatter[]
  decision?: "same" | "new" | "none"
  matter_id?: string
  display?: string
  by?: string
  at?: string
}
export type ReturningState = "unchecked" | "none" | "waiting" | "same" | "new"

type Db = SupabaseClient<Database>
type Lead = Pick<
  IntakeLead,
  "id" | "created_at" | "email" | "phone" | "client_first" | "client_last" | "clio_client_contact_id" | "clio_matter_id" | "consulting_attorney"
>
type Matter = {
  id: number
  display_number: string
  status: string
  open_date: string | null
  pending_date: string | null
  created_at: string
  originating_attorney?: { name?: string | null } | null
}

/** Where the lead stands, from its steps. */
export function returningState(steps: Pick<IntakeStep, "step_key" | "state" | "detail">[]): ReturningState {
  const row = steps.find((s) => s.step_key === RETURNING)
  if (!row) return "unchecked"
  if (row.state === "awaiting_human") return "waiting"
  return ((row.detail ?? {}) as ReturningDetail).decision ?? "none"
}

export function returningDetail(steps: Pick<IntakeStep, "step_key" | "detail">[]): ReturningDetail | null {
  return (steps.find((s) => s.step_key === RETURNING)?.detail as ReturningDetail | null) ?? null
}

const words = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim()

/** The client's open and pending Clio matters from before this booking. */
export async function openMattersBefore(contactId: string | number, lead: Lead): Promise<OpenMatter[]> {
  const fields = "id,display_number,status,open_date,pending_date,created_at,originating_attorney{name}"
  const list = (
    await clioFetch<{ data: Matter[] }>(
      `/api/v4/matters?client_id=${contactId}&fields=${encodeURIComponent(fields)}&order=${encodeURIComponent("created_at(desc)")}&limit=25`
    )
  ).data
  return earlierOpenMatters(list, lead)
}

/** Of a client's Clio matters, the open and pending ones made before this booking. */
export function earlierOpenMatters(list: Matter[], lead: Lead): OpenMatter[] {
  const booked = Date.parse(lead.created_at)
  return list
    .filter((m) => /^(open|pending)$/i.test(m.status))
    // A matter made for this booking (by staff or a convert) isn't an earlier one.
    .filter((m) => String(m.id) !== lead.clio_matter_id && Date.parse(m.created_at) < booked)
    .map((m) => ({
      id: String(m.id),
      display: m.display_number,
      status: m.status,
      attorney: m.originating_attorney?.name ?? null,
      opened: m.open_date ?? m.pending_date ?? m.created_at?.slice(0, 10) ?? null,
      same_attorney: Boolean(lead.consulting_attorney && m.originating_attorney?.name && words(m.originating_attorney.name) === words(lead.consulting_attorney)),
    }))
}

/**
 * Check once whether the client has earlier open or pending matters, and
 * record the answer. Returns the lead's state; throws when Clio can't be read,
 * so callers hold off rather than convert blind.
 */
export async function checkReturningClient(db: Db, lead: Lead, steps: Pick<IntakeStep, "step_key" | "state" | "detail">[]): Promise<ReturningState> {
  const now = returningState(steps)
  if (now !== "unchecked") return now
  const contactId = lead.clio_client_contact_id ?? (await findClioContact(lead)).contact?.id ?? null
  // No Clio contact for this client: nobody to have an earlier matter.
  const matters = contactId ? await openMattersBefore(contactId, lead) : []
  const at = new Date().toISOString()
  if (!matters.length) {
    await logStep(db, { lead_id: lead.id, step_key: RETURNING, state: "done", detail: { decision: "none", by: "Automatic", at } })
    return "none"
  }
  await logStep(db, { lead_id: lead.id, step_key: RETURNING, state: "awaiting_human", detail: { matters, by: "Automatic", at } })
  return "waiting"
}

/** Shown where a portal or text waits on the decision. */
export const RETURNING_MESSAGE = "Returning client: decide same case or new case first (top of this page), so this goes on the right matter."

/** The bot may create or convert a Grow matter for this lead. */
export const growMayProceed = (state: ReturningState) => state === "none" || state === "new"
