// ─────────────────────────────────────────────────────────────────────────────
// Acuity → intake_leads mapping (locked from the live account, 2026-09-22)
//
// The client's "CRM" is Acuity Scheduling. Every consult — whether booked by
// LexiDesk (via the Acuity API), self-scheduled, or entered by staff — becomes
// an Acuity appointment with a Client and a set of Intake Form answers. So the
// real trigger is an Acuity webhook (not LexiDesk), and the data we need lives in
// Acuity's form fields, addressed by numeric field id.
//
// This file is the single source of truth for those ids + option lists. When the
// Acuity API key arrives, the webhook handler reads an appointment's `forms[]`
// and maps each answer's `id` through the tables below into an intake_lead.
// Nothing here calls Acuity — it's pure data, safe to keep before access exists.
// Field ids/options are copied verbatim from the live account (see
// `new project/crm-findings.md`).
// ─────────────────────────────────────────────────────────────────────────────

/** Acuity form ids (Intake Form Questions). */
export const ACUITY_FORMS = {
  selfScheduling: 2158340, // client-facing main public intake
  internalIntake: 2151090, // "MODERN LAW Intake Form" — staff lead qualification
  lexidesk: 3048209, // "Lexidesk Internal Form" — system-stamped ids
} as const

/**
 * Acuity field id → our intake_leads column. Two forms carry the meaningful
 * fields; both are folded into one lead. Values still need normalizing (see the
 * option maps below) before they match our enums.
 */
export const ACUITY_FIELD_TO_COLUMN: Record<number, string> = {
  // Self Scheduling Form (client)
  12060472: "opposing_party_name", // "legal name of your Opposing Party"
  16919767: "referral_source", // "How did you hear about us?"
  16919788: "referral_name", // "who referred you" (no column yet — stash in raw_payload)
  12060476: "description", // "Brief description of why you are scheduling"
  17656926: "minor_children", // yes/no (no column yet)
  13200526: "county", // "What County is your case in?"
  // MODERN LAW Intake Form (staff)
  12016550: "assigned_advocate", // "Intake by which Team Member"
  12016728: "referral_source", // "Referral Source" (staff copy)
  12016776: "matter_type", // "Type of matter?"
  16141672: "opposing_party_name", // "Opposing Party Name" (staff copy)
  12016778: "conflict_status", // "Conflict Check Completed?" (yes/no → clear/pending)
  12016790: "priority_score", // "On a Scale of 1-5 rate the lead"
  12016798: "qualified", // "Is this a qualified lead?" (yes/no)
  // Lexidesk Internal Form (system) — kept for traceability, stored in raw_payload
  17201254: "lexidesk_client_id",
  17201255: "lexidesk_conversation_id",
  17201256: "lexidesk_conversation_url",
  17201257: "lexidesk_appointment_offer_id",
}

/** "Type of matter?" (field 12016776) — verbatim options, incl. Acuity's typos. */
export const ACUITY_MATTER_TYPES = [
  "Divorce w/ Children",
  "Divorce w/o Children",
  "Enforcement",
  "Establishment",
  "Juvenile",
  "Modification",
  "Orders of Protection",
  "Pre/Post Nups",
  "Terminatino", // sic — as stored in Acuity
  "Third Party Rights",
  "Trust & Estates",
  "Other",
] as const

/** Referral options shared by both referral fields (16919767 / 12016728). */
export const ACUITY_REFERRAL_SOURCES = [
  "Attorney Referral",
  "Legal Services Referral",
  "Personal Referral",
  "Rehire",
  "Current/Former Client Referral",
  "Google",
  "Other",
  "TikTok",
  "YouTube",
  "Facebook",
  "Facebook Group",
  "Community Partner Referral",
  "Instagram",
  "N/A",
  "Non-Profit Referral",
  "Staff Referral",
  "Yelp",
  "Thumbtack",
  "Podcast",
  "ChatGPT/AI",
] as const

/** Arizona counties (field 13200526) — the routing proxy for office/jurisdiction. */
export const ACUITY_COUNTIES = [
  "Apache", "Cochise", "Coconino", "Gila", "Graham", "Greenlee", "La Paz",
  "Maricopa", "Mohave", "Navajo", "Pima", "Pinal", "Santa Cruz", "Yavapai",
  "Yuma", "Unknown",
] as const

/** yes/no → our conflict_status. Acuity only says whether the check was done. */
export function conflictFromYesNo(v: string | null | undefined): "pending" | "clear" {
  return String(v).trim().toLowerCase() === "yes" ? "clear" : "pending"
}

/** yes/no → boolean, for qualified. */
export function yesNoToBool(v: string | null | undefined): boolean | null {
  const s = String(v).trim().toLowerCase()
  if (s === "yes") return true
  if (s === "no") return false
  return null
}
