import type { IntakeLead } from "@/types/database"
import { ADVOCATE_CLIO_NAMES } from "@/lib/intake"
import type { ConsultMethod } from "@/lib/client-messages"

// The #initialconsultations post (checklist step 10), in the format the team
// uses there (Zapier drafts it in #intake-testing and staff copy it over):
//
//   @Attorney ZOOM Initial Consultation Self Scheduled for First Last
//   October 6, 2026
//   10:30am to 11:30am
//   phone / email / Fee Paid? / Description / Matter Type / Source / OP /
//   Conflict Check / Qualified Lead / Assigned Advocate
//
// The attorney and advocate are written as @Name here; posting swaps them for
// real Slack mentions so both are notified.

const TZ = "America/Phoenix"

type Lead = Pick<
  IntakeLead,
  | "client_first"
  | "client_last"
  | "consulting_attorney"
  | "assigned_advocate"
  | "consult_type"
  | "office"
  | "self_scheduled"
  | "phone"
  | "email"
  | "matter_type"
  | "referral_source"
  | "opposing_party_name"
  | "conflict_status"
  | "qualified"
>

/** The @names in the post and who they stand for (advocates go by first name). */
export function postMentions(lead: Pick<Lead, "consulting_attorney" | "assigned_advocate">) {
  const out: { token: string; name: string }[] = []
  if (lead.consulting_attorney) out.push({ token: `@${lead.consulting_attorney}`, name: lead.consulting_attorney })
  if (lead.assigned_advocate)
    out.push({ token: `@${lead.assigned_advocate}`, name: ADVOCATE_CLIO_NAMES[lead.assigned_advocate] ?? lead.assigned_advocate })
  // Longest first, so "@Linda Diamond" is never half-replaced by "@Linda".
  return out.sort((a, b) => b.token.length - a.token.length)
}

// Acuity hands form answers over HTML-escaped ("&amp;") and notes with CRLF line ends.
const plain = (s: string) =>
  s
    .replace(/\r\n?/g, "\n")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim()

/** Slack reads &, < and > as markup, so plain text has to escape them. */
export const slackEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

// "10:30am", the way the posts write times.
const clock = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" })
    .format(d)
    .replace(/\s*([AP])M$/i, (_, p: string) => `${p.toLowerCase()}m`)

export function consultPost(x: {
  lead: Lead
  method: ConsultMethod | null
  start: string | null
  end: string | null
  feePaid: string | null
  description: string | null
}): { text: string | null; missing: string[] } {
  const { lead } = x
  const missing: string[] = []
  if (!lead.consulting_attorney) missing.push("consulting attorney")
  if (!x.start) missing.push("consult time")
  if (missing.length) return { text: null, missing }

  // Acuity leaves the location blank for its default, Zoom; Zapier's draft
  // says ZOOM for those too.
  const how = x.method === "phone" ? "PHONE" : x.method === "in_person" ? `IN PERSON${lead.office ? ` @ ${lead.office}` : ""}` : "ZOOM"
  const kind = lead.consult_type === "LSS" ? "Limited Scope Strategy Session" : "Initial Consultation"
  const name = [lead.client_first, lead.client_last].filter(Boolean).join(" ")
  const start = new Date(x.start!)
  const date = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "long", day: "numeric", year: "numeric" }).format(start)
  const time = x.end ? `${clock(start)} to ${clock(new Date(x.end))}` : clock(start)
  const yes = (v: boolean | null) => (v == null ? "" : v ? "Yes" : "No")

  const lines = [
    `@${lead.consulting_attorney} ${how} ${kind} ${lead.self_scheduled ? "Self Scheduled" : "Scheduled"} for ${name}`,
    date,
    time,
    lead.phone ?? "",
    lead.email ?? "",
    `Fee Paid? ${x.feePaid ?? ""}`,
    "Description:",
    x.description ? plain(x.description) : "",
    `Matter Type: ${lead.matter_type ?? ""}`,
    `Source: ${lead.referral_source ?? ""}`,
    `OP: ${lead.opposing_party_name || "N/A"}`,
    `Conflict Check: ${lead.conflict_status === "clear" ? "yes" : lead.conflict_status === "conflict" ? "no" : ""}`,
    ...(lead.qualified == null ? [] : [`Qualified Lead: ${yes(lead.qualified)}`]),
    `Assigned Advocate: ${lead.assigned_advocate ? `@${lead.assigned_advocate}` : ""}`,
  ]
  return { text: lines.join("\n"), missing }
}
