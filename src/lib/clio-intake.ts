import "server-only"

import { clioFetch, clioStatus } from "@/lib/clio"
import type { IntakeLead } from "@/types/database"

// Read-only Clio lookups for one intake lead, plus a dry-run preview of what the
// automation would create. Nothing here writes to Clio.

export const CLIO_APP = "https://app.clio.com/nc/#"

export type ClioContact = {
  id: number
  name: string
  type?: string
  is_client?: boolean
  created_at?: string
  primary_email_address?: string | null
  primary_phone_number?: string | null
}
export type ClioMatter = {
  id: number
  display_number: string
  description: string | null
  status: string
  open_date: string | null
  created_at: string
  practice_area?: { name?: string } | null
}

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").slice(-10)

/**
 * Find the lead's person in Clio. Email first (exact match on the primary
 * email), then phone (last 10 digits). LexiDesk often creates this contact
 * before we ever see the lead, so this is the duplicate guard.
 */
export async function findClioContact(lead: Pick<IntakeLead, "email" | "phone">) {
  const fields = "id,name,type,is_client,created_at,primary_email_address,primary_phone_number"
  const search = async (q: string) =>
    (await clioFetch<{ data: ClioContact[] }>(
      `/api/v4/contacts?query=${encodeURIComponent(q)}&fields=${fields}&limit=10`
    )).data

  if (lead.email) {
    const email = lead.email.trim().toLowerCase()
    const hit = (await search(email)).find(
      (c) => c.primary_email_address?.trim().toLowerCase() === email
    )
    if (hit) return { contact: hit, matchedBy: "email" as const }
  }
  const phone = digits(lead.phone)
  if (phone.length === 10) {
    const hit = (await search(phone)).find((c) => digits(c.primary_phone_number) === phone)
    if (hit) return { contact: hit, matchedBy: "phone" as const }
  }
  return { contact: null, matchedBy: null }
}

export async function contactMatters(contactId: number) {
  const fields = "id,display_number,description,status,open_date,created_at,practice_area{name}"
  return (
    await clioFetch<{ data: ClioMatter[] }>(
      `/api/v4/matters?client_id=${contactId}&fields=${encodeURIComponent(fields)}&order=${encodeURIComponent("created_at(desc)")}&limit=10`
    )
  ).data
}

/**
 * Acuity "Type of matter?" → Clio practice area. Confirmed by the firm on
 * 2026-09-29 (Termination was added to Clio for this). Keys are lower-case and
 * include Acuity's stored typo "Terminatino".
 */
const PRACTICE_AREAS: Record<string, string> = {
  "divorce w/ children": "Divorce with Children",
  "divorce w/o children": "Divorce without Children",
  enforcement: "Enforcement",
  establishment: "Establishment",
  juvenile: "Juvenile",
  modification: "Modification",
  "orders of protection": "Orders of Protection",
  "pre/post nups": "Pre & Post Nup",
  termination: "Termination",
  terminatino: "Termination",
  "third party rights": "Third Party Rights",
  "trust & estates": "Trusts & Estates",
  other: "Other",
}

/** The Clio practice area name for a lead's matter type, or null when unknown. */
export function practiceAreaName(matterType: string | null | undefined) {
  const t = matterType?.trim()
  if (!t) return null
  return PRACTICE_AREAS[t.toLowerCase()] ?? null
}

/** The matter title the intake checklist uses: "IC with Hillary Ryan". */
export function matterDescription(lead: Pick<IntakeLead, "consult_type" | "consulting_attorney">) {
  const kind = lead.consult_type ?? "IC"
  return lead.consulting_attorney ? `${kind} with ${lead.consulting_attorney}` : kind
}

export type ClioLookup =
  | { state: "not_connected" }
  | { state: "error"; message: string }
  | {
      state: "ok"
      contact: ClioContact | null
      matchedBy: "email" | "phone" | null
      matters: ClioMatter[]
      /** A matter opened for this person recently: likely already made by staff. */
      recentMatter: ClioMatter | null
    }

export async function lookupLeadInClio(lead: IntakeLead): Promise<ClioLookup> {
  const status = await clioStatus()
  if (!status.connected) return { state: "not_connected" }
  try {
    const { contact, matchedBy } = await findClioContact(lead)
    const matters = contact ? await contactMatters(contact.id) : []
    const since = Date.now() - 21 * 24 * 60 * 60 * 1000
    const recentMatter = matters.find((m) => new Date(m.created_at).getTime() >= since) ?? null
    return { state: "ok", contact, matchedBy, matters, recentMatter }
  } catch (e) {
    return { state: "error", message: e instanceof Error ? e.message : "Clio lookup failed" }
  }
}

// ── Writing to Clio ─────────────────────────────────────────────────────────
// Everything below creates records in the firm's live Clio. It only runs from
// an explicit "Create in Clio" click (server action), and it is idempotent:
// a lead that already has clio_matter_id is never created twice, and a matter
// staff made recently for the same client is reused instead of duplicated.

type ClioCustomField = {
  id: number
  name: string
  field_type: string
  picklist_options?: { id: number; option: string; deleted_at?: string | null }[]
}

async function matterCustomField(name: string): Promise<ClioCustomField | null> {
  const fields = "id,name,field_type,picklist_options{id,option,deleted_at}"
  const res = await clioFetch<{ data: ClioCustomField[] }>(
    `/api/v4/custom_fields?parent_type=Matter&query=${encodeURIComponent(name)}&fields=${encodeURIComponent(fields)}&limit=50`
  )
  const want = name.trim().toLowerCase()
  return res.data.find((f) => f.name.trim().toLowerCase() === want) ?? null
}

const nameWords = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim().split(" ").filter(Boolean)

/**
 * The enabled Clio user with this name. Exact match first; then a user whose
 * every name word is in it, because Acuity sometimes carries an extra surname
 * ("Eilen Castellano Tatis" is Clio's "Eilen Castellano") or an accent Clio
 * doesn't ("Peláez"). A loose match counts only when exactly one user fits.
 */
async function clioUser(name: string | null | undefined): Promise<{ id: number; name: string } | null> {
  if (!name?.trim()) return null
  const res = await clioFetch<{ data: { id: number; name: string; enabled?: boolean }[] }>(
    `/api/v4/users?fields=id,name,enabled&limit=200`
  )
  const users = res.data.filter((u) => u.enabled !== false)
  const want = nameWords(name)
  const exact = users.find((u) => nameWords(u.name).join(" ") === want.join(" "))
  if (exact) return exact
  const loose = users.filter((u) => {
    const w = nameWords(u.name)
    return w.length >= 2 && w.every((t) => want.includes(t))
  })
  return loose.length === 1 ? loose[0] : null
}

async function clioUserId(name: string | null | undefined): Promise<number | null> {
  return (await clioUser(name))?.id ?? null
}

function splitName(full: string) {
  const parts = full.trim().split(/\s+/)
  if (parts.length === 1) return { first_name: parts[0], last_name: "" }
  return { first_name: parts.slice(0, -1).join(" "), last_name: parts[parts.length - 1] }
}

export type ClioPlan = {
  contact: { reuseId: number; name: string } | { create: Record<string, unknown>; name: string }
  matter:
    | { reuseId: number; display: string }
    | { create: Record<string, unknown>; description: string }
  opposingParty: string
  notes: string[]
}

/** Resolve everything needed (read-only). Used for the preview and the write. */
export async function planClioCreate(lead: IntakeLead): Promise<ClioPlan> {
  const notes: string[] = []
  const { contact } = await findClioContact(lead)
  const matters = contact ? await contactMatters(contact.id) : []
  const since = Date.now() - 21 * 24 * 60 * 60 * 1000
  const recent = matters.find((m) => new Date(m.created_at).getTime() >= since) ?? null
  const fullName = [lead.client_first, lead.client_last].filter(Boolean).join(" ") || "Unknown"

  const plan: ClioPlan = {
    contact: contact
      ? { reuseId: contact.id, name: contact.name }
      : {
          name: fullName,
          create: {
            type: "Person",
            first_name: lead.client_first ?? fullName,
            last_name: lead.client_last ?? "",
            ...(lead.email ? { email_addresses: [{ name: "Home", address: lead.email, default_email: true }] } : {}),
            ...(lead.phone ? { phone_numbers: [{ name: "Mobile", number: lead.phone, default_number: true }] } : {}),
          },
        },
    matter: { description: matterDescription(lead), create: {} },
    // Opposing Party Name is the one required matter field; the checklist
    // uses "N/A" when there isn't one (e.g. Trusts & Estates).
    opposingParty: lead.opposing_party_name?.trim() || "N/A",
    notes,
  }

  if (recent) {
    plan.matter = { reuseId: recent.id, display: recent.display_number }
    return plan
  }

  const opField = await matterCustomField("Opposing Party Name")
  if (!opField) throw new Error('Clio custom field "Opposing Party Name" not found')
  const customFieldValues: Record<string, unknown>[] = [
    { custom_field: { id: opField.id }, value: plan.opposingParty },
  ]

  if (lead.county) {
    const countyField = await matterCustomField("What County is your case in?")
    const opt = countyField?.picklist_options?.find(
      (o) => !o.deleted_at && o.option.trim().toLowerCase() === lead.county!.trim().toLowerCase()
    )
    if (countyField && opt) customFieldValues.push({ custom_field: { id: countyField.id }, value: opt.id })
    else notes.push(`County "${lead.county}" not matched in Clio, left blank`)
  }

  const originating = await clioUserId(lead.consulting_attorney)
  if (lead.consulting_attorney && !originating)
    notes.push(`No Clio user named "${lead.consulting_attorney}", originating attorney left blank`)

  // A matter type that isn't in the mapping may already be a Clio name
  // (typed on a manual lead), so that is tried as-is.
  const areaName = practiceAreaName(lead.matter_type) ?? lead.matter_type?.trim()
  let practiceArea: number | null = null
  if (areaName) {
    const areas = await clioFetch<{ data: { id: number; name: string }[] }>(
      "/api/v4/practice_areas?fields=id,name&limit=200"
    )
    practiceArea = areas.data.find((a) => a.name.trim().toLowerCase() === areaName.toLowerCase())?.id ?? null
    if (!practiceArea) notes.push(`No Clio practice area for "${lead.matter_type}", left blank`)
  }

  plan.matter = {
    description: matterDescription(lead),
    create: {
      description: matterDescription(lead),
      status: "Pending",
      ...(originating ? { originating_attorney: { id: originating } } : {}),
      ...(practiceArea ? { practice_area: { id: practiceArea } } : {}),
      custom_field_values: customFieldValues,
    },
  }
  return plan
}

// The firm's standing rule: these never go on a client portal, whatever the
// matter or Grow's "Assigned to" says.
const NEVER_ON_PORTAL = ["billing department", "caitlin lindahl"]

/**
 * Open the client portal on a matter: one Clio for Clients conversation with
 * the client, the advocate and the consulting attorney, starting with the
 * firm's welcome message. Clio emails the client their invite. The attorney is
 * required (the checklist insists on it); a missing advocate is left off and
 * reported, as the checklist allows.
 */
export async function sendClioPortalInvite(x: {
  matterId: string
  contactId: string
  advocate: string | null
  attorney: string | null
  subject: string
  body: string
}) {
  const notes: string[] = []
  const attorney = await clioUser(x.attorney)
  if (!attorney) throw new Error(x.attorney ? `No Clio user matches the attorney "${x.attorney}"` : "The lead has no consulting attorney")
  const advocate = await clioUser(x.advocate)
  if (!advocate) notes.push(x.advocate ? `No Clio user matches "${x.advocate}", advocate left off` : "No advocate assigned, left off")

  const users = [attorney, advocate].filter((u): u is { id: number; name: string } => Boolean(u))
  for (const u of users)
    if (NEVER_ON_PORTAL.includes(u.name.trim().toLowerCase())) throw new Error(`${u.name} can never be on a client portal`)

  const fields = encodeURIComponent("id,conversation{id}")
  const res = await clioFetch<{ data: { id: number; conversation?: { id: number } | null } }>(
    `/api/v4/conversation_messages?fields=${fields}`,
    {
      method: "POST",
      body: JSON.stringify({
        data: {
          subject: x.subject,
          body: x.body,
          matter: { id: Number(x.matterId) },
          receivers: [
            { type: "Contact", id: Number(x.contactId) },
            ...Array.from(new Set(users.map((u) => u.id))).map((id) => ({ type: "User", id })),
          ],
        },
      }),
    }
  )
  return {
    messageId: res.data.id,
    conversationId: res.data.conversation?.id ?? null,
    members: [attorney.name, advocate?.name].filter(Boolean) as string[],
    notes,
  }
}

/** Names of the tasks already on a matter (lower-case), so none is made twice. */
export async function matterTaskNames(matterId: string) {
  const res = await clioFetch<{ data: { name: string }[] }>(`/api/v4/tasks?matter_id=${matterId}&fields=name&limit=200`)
  return new Set(res.data.map((t) => t.name.trim().toLowerCase()))
}

/**
 * Put the consult's follow-up tasks on the matter, assigned to the advocate.
 * A task that already exists there (staff made it by hand) is left alone.
 */
export async function createFollowUpTasks(x: {
  matterId: string
  advocate: string
  consultDay: string
  tasks: { name: string; due: string }[]
}) {
  const assignee = await clioUser(x.advocate)
  if (!assignee) throw new Error(`No Clio user matches the advocate "${x.advocate}"`)
  if (NEVER_ON_PORTAL.includes(assignee.name.trim().toLowerCase())) throw new Error(`${assignee.name} is not an advocate`)

  const existing = await matterTaskNames(x.matterId)
  const created: { name: string; due: string; id: number }[] = []
  const skipped: string[] = []
  for (const t of x.tasks) {
    if (existing.has(t.name.toLowerCase())) {
      skipped.push(t.name)
      continue
    }
    const res = await clioFetch<{ data: { id: number } }>("/api/v4/tasks?fields=id", {
      method: "POST",
      body: JSON.stringify({
        data: {
          name: t.name,
          description: `Follow-up for the consultation on ${x.consultDay}. Set by the intake dashboard.`,
          due_at: t.due,
          priority: "Normal",
          matter: { id: Number(x.matterId) },
          assignee: { id: assignee.id, type: "User" },
        },
      }),
    })
    created.push({ ...t, id: res.data.id })
  }
  return { assignee: assignee.name, created, skipped }
}

/**
 * Carry out the plan in Clio. Returns the ids it ended up with. Throws with a
 * readable message on the first failure; the caller logs it as a failed step.
 */
export async function executeClioPlan(plan: ClioPlan) {
  const post = <T>(path: string, data: Record<string, unknown>) =>
    clioFetch<{ data: T }>(path, { method: "POST", body: JSON.stringify({ data }) })

  const contactId =
    "reuseId" in plan.contact
      ? plan.contact.reuseId
      : (await post<{ id: number }>("/api/v4/contacts?fields=id", plan.contact.create)).data.id

  if ("reuseId" in plan.matter) {
    return {
      contactId,
      matterId: plan.matter.reuseId,
      display: plan.matter.display,
      reused: true as const,
      opContactId: null,
      opError: null,
    }
  }

  const matter = (
    await post<{ id: number; display_number: string }>("/api/v4/matters?fields=id,display_number", {
      ...plan.matter.create,
      client: { id: contactId },
    })
  ).data

  // Opposing party as a related contact on the matter (how the firm links them).
  // The matter already exists at this point, so a failure here is reported,
  // not thrown: losing the matter id would make a retry create a duplicate.
  let opContactId: number | null = null
  let opError: string | null = null
  if (plan.opposingParty && plan.opposingParty !== "N/A") try {
    const found = await clioFetch<{ data: { id: number; name: string; type: string }[] }>(
      `/api/v4/contacts?query=${encodeURIComponent(plan.opposingParty)}&type=Person&fields=id,name,type&limit=10`
    )
    const exact = found.data.find(
      (c) => c.name.trim().toLowerCase() === plan.opposingParty.trim().toLowerCase()
    )
    opContactId =
      exact?.id ??
      (await post<{ id: number }>("/api/v4/contacts?fields=id", {
        type: "Person",
        ...splitName(plan.opposingParty),
      })).data.id
    await post("/api/v4/relationships?fields=id", {
      description: "Opposing Party",
      matter: { id: matter.id },
      contact: { id: opContactId },
    })
  } catch (e) {
    opError = e instanceof Error ? e.message : "Linking the opposing party failed"
  }

  return {
    contactId,
    matterId: matter.id,
    display: matter.display_number,
    reused: false as const,
    opContactId,
    opError,
  }
}
