import "server-only"

import type { ConflictHit, ConflictSearch } from "@/lib/conflict-search"
import { logStep } from "@/lib/intake-step-log"
import { mailConfigured, sendMail } from "@/lib/mail"
import type { createAdminClient } from "@/lib/supabase/admin"
import type { IntakeLead } from "@/types/database"

// When the conflict search can't clear a booking on its own (a match the firm
// should look at, or no opposing party it could search), the person who runs
// conflict checks gets an email: what was found, a button to the lead's
// conflict step, and what to do there. The team inbox, sales@, by default
// (CONFLICT_EMAIL_TO), so anyone on the team can pick it up.
// Once per booking, for bookings from CONFLICT_EMAIL_FROM while the consult is
// still ahead; a send that failed is tried again after an hour.

export const CONFLICT_EMAIL = "conflict_email"
export const conflictEmailTo = () => process.env.CONFLICT_EMAIL_TO?.trim() || "sales@mymodernlaw.com"
const conflictEmailFrom = () => process.env.CONFLICT_EMAIL_FROM?.trim() || "2026-10-15T07:00:00Z"
const RETRY_AFTER = 60 * 60 * 1000

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://modern-law-dashboard.vercel.app"
const TZ = "America/Phoenix"

type Admin = NonNullable<ReturnType<typeof createAdminClient>>
export type ConflictEmailLead = Pick<
  IntakeLead,
  | "id"
  | "created_at"
  | "client_first"
  | "client_last"
  | "opposing_party_name"
  | "consult_datetime"
  | "consult_type"
  | "consulting_attorney"
  | "county"
  | "matter_type"
>

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** A search a person has to finish: it went through, but found a match or couldn't search the opposing party. */
export function needsPerson(x: Pick<ConflictSearch, "errors" | "searched" | "opposing" | "flags">) {
  return !x.errors.length && x.searched.includes("Clio Manage") && x.searched.includes("Clio Grow") && (x.flags > 0 || !x.opposing)
}

// The dashboard's Luxury Evening theme (globals.css), as hex for email clients.
const C = {
  page: "#161413",
  card: "#211e1c",
  ink: "#ede6de",
  muted: "#aca295",
  border: "#3e3832",
  soft: "#2f2b27",
  header: "#110f0e",
  headerText: "#dbd2c7",
  primary: "#fba423",
  onPrimary: "#201813",
  danger: "#f07a7a",
  dangerSoft: "#3a1f1d",
  dangerLine: "#d03939",
  warning: "#fba423",
  warningSoft: "#3a2c17",
}
const SANS = "Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const SERIF = "'Playfair Display',Georgia,'Times New Roman',serif"

export function conflictEmail(lead: ConflictEmailLead, search: ConflictSearch) {
  const client = [lead.client_first, lead.client_last].filter(Boolean).join(" ") || "New client"
  const consult = lead.consult_type === "LSS" ? "Limited Scope Strategy Session" : "Initial Consultation"
  const when = lead.consult_datetime
    ? new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(
        new Date(lead.consult_datetime)
      )
    : null
  const link = `${SITE}/intake/${lead.id}?step=conflict`
  const flagged = search.hits.filter((h) => h.flag)
  const match = flagged.length > 0
  const opposing =
    search.opposing ?? (lead.opposing_party_name?.trim() ? `${lead.opposing_party_name.trim()} (not a full name)` : "Not provided")

  const subject = `${match ? "Possible conflict" : "Conflict check needed"}: ${client}${when ? ` (consult ${when})` : ""}`
  const badge = match
    ? { text: "Possible conflict", fg: C.danger, bg: C.dangerSoft }
    : { text: "Opposing party missing", fg: C.warning, bg: C.warningSoft }
  const summary = match
    ? `The automatic search found ${flagged.length === 1 ? "a record" : `${flagged.length} records`} in Clio that may be a conflict. The intake is on hold until you decide.`
    : "The booking has no usable opposing party name, so the check can't be cleared automatically. The intake is on hold until you decide."

  const facts: [string, string | null][] = [
    ["Consultation", [consult, when && `${when} (Arizona)`].filter(Boolean).join(", ")],
    ["Attorney", lead.consulting_attorney],
    ["Client", client],
    ["Opposing party", opposing],
    ["County", lead.county],
    ["Matter type", lead.matter_type],
  ]
  const side = (h: ConflictHit) => (h.side === "client" ? "Same name as the client" : "Same name as the opposing party")
  const why = (h: ConflictHit) => h.roles.filter((r) => r.flag).map((r) => r.text)

  const steps = match
    ? [
        "Review the match in Clio: location, case and the other people on it.",
        "Different person: click <b>No conflict</b>. The intake continues automatically.",
        "Same person or unsure: click <b>Conflict, stop</b>, then contact the client to cancel or refer the consultation and cancel it in Acuity.",
      ]
    : [
        "Get the opposing party's full name from the Lexi conversation, Clio Grow or the client.",
        "Run Clio's conflict check on that name from the review page.",
        "No match: click <b>No conflict</b>. A match: click <b>Conflict, stop</b>.",
      ]

  const label = (t: string) =>
    `<div style="font:700 11px ${SANS};color:${C.muted};letter-spacing:1px;text-transform:uppercase;padding-bottom:8px">${t}</div>`
  const row = (k: string, v: string) =>
    `<tr><td style="padding:7px 0;width:132px;vertical-align:top;font:13px ${SANS};color:${C.muted}">${esc(k)}</td>` +
    `<td style="padding:7px 0;vertical-align:top;font:600 14px ${SANS};color:${C.ink}">${esc(v)}</td></tr>`
  const hit = (h: ConflictHit, i: number) =>
    `<tr><td style="padding:12px 14px;${i ? `border-top:1px solid ${C.border}` : ""}">` +
    `<div style="font:600 14px ${SANS};color:${C.ink}">${
      h.url ? `<a href="${esc(h.url)}" style="color:${C.primary};text-decoration:none">${esc(h.name)}</a>` : esc(h.name)
    }</div>` +
    `<div style="font:12px ${SANS};color:${C.muted};padding-top:2px">${side(h)}</div>` +
    `<div style="font:13px/1.5 ${SANS};color:${C.ink};padding-top:6px">${why(h).map(esc).join("<br>")}</div></td></tr>`
  const step = (s: string, i: number) =>
    `<tr><td style="width:30px;vertical-align:top;padding:6px 0"><div style="width:20px;height:20px;border-radius:10px;background:${C.soft};color:${C.primary};font:700 12px/20px ${SANS};text-align:center">${i + 1}</div></td>` +
    `<td style="vertical-align:top;padding:6px 0;font:14px/1.55 ${SANS};color:${C.ink}">${s.replace(/<b>/g, `<b style="color:${C.primary}">`)}</td></tr>`

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>${esc(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Playfair+Display:wght@600&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:${C.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(summary)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.card};border:1px solid ${C.border};border-radius:14px;overflow:hidden">
<tr><td style="background:${C.header};padding:18px 28px;border-bottom:1px solid ${C.border}">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="padding-right:12px;vertical-align:middle"><img src="${SITE}/logo-white.png" width="36" height="37" alt="ML" style="display:block"></td>
    <td style="vertical-align:middle"><div style="font:600 17px ${SERIF};color:${C.ink}">Modern Law</div><div style="font:12px ${SANS};color:${C.headerText};letter-spacing:.4px">Operations Dashboard &middot; Intake</div></td>
  </tr></table>
</td></tr>
<tr><td style="padding:28px 28px 8px">
  <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${badge.bg};color:${badge.fg};font:600 12px ${SANS};letter-spacing:.3px">${badge.text}</span>
  <h1 style="margin:14px 0 8px;font:600 24px/1.25 ${SERIF};color:${C.ink}">Conflict check needs your decision</h1>
  <p style="margin:0;font:15px/1.6 ${SANS};color:${C.muted}">${esc(summary)}</p>
</td></tr>
<tr><td style="padding:16px 28px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.border};border-bottom:1px solid ${C.border}">
${facts
  .filter(([, v]) => v)
  .map(([k, v]) => row(k, v!))
  .join("")}
</table></td></tr>
${
  match
    ? `<tr><td style="padding:22px 28px 4px">${label("Found in Clio")}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.border};border-left:3px solid ${C.dangerLine};border-radius:8px;border-collapse:separate">${flagged
        .map(hit)
        .join("")}</table></td></tr>`
    : ""
}
<tr><td style="padding:24px 28px 8px">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:${C.primary}">
    <a href="${esc(link)}" style="display:inline-block;padding:12px 22px;font:700 14px ${SANS};color:${C.onPrimary};text-decoration:none;border-radius:8px">Review conflict check &rarr;</a>
  </td></tr></table>
</td></tr>
<tr><td style="padding:18px 28px 26px">${label("What to do")}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${steps.map(step).join("")}</table></td></tr>
<tr><td style="padding:14px 28px;background:${C.soft};border-top:1px solid ${C.border};font:12px/1.5 ${SANS};color:${C.muted}">
  Automated message from the Modern Law Operations Dashboard. Sign in with the intake team login if prompted.
</td></tr>
</table>
</td></tr></table>
</body></html>`

  const text = [
    `${match ? "POSSIBLE CONFLICT" : "CONFLICT CHECK NEEDED"}: ${client}`,
    summary,
    "",
    ...facts.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
    ...(match ? ["", "Found in Clio:", ...flagged.map((h) => `- ${h.name} (${side(h).toLowerCase()}): ${why(h).join("; ")}${h.url ? ` ${h.url}` : ""}`)] : []),
    "",
    `Review conflict check: ${link}`,
    "",
    "What to do:",
    ...steps.map((s, i) => `${i + 1}. ${s.replace(/<\/?b>/g, "")}`),
  ].join("\n")

  return { subject, html, text }
}

/** Email the conflict check to the team, once per booking. Returns true when it sent. */
export async function emailConflict(admin: Admin, lead: ConflictEmailLead, search: ConflictSearch): Promise<boolean> {
  if (!mailConfigured() || !needsPerson(search)) return false
  if (Date.parse(lead.created_at) < Date.parse(conflictEmailFrom())) return false
  if (lead.consult_datetime && Date.parse(lead.consult_datetime) <= Date.now()) return false

  const { data: row } = await admin
    .from("intake_steps")
    .select("state, updated_at")
    .eq("lead_id", lead.id)
    .eq("step_key", CONFLICT_EMAIL)
    .maybeSingle()
  if (row?.state === "done") return false
  if (row?.state === "failed" && Date.now() - Date.parse(row.updated_at) < RETRY_AFTER) return false

  const to = conflictEmailTo()
  const mail = conflictEmail(lead, search)
  try {
    await sendMail({ to, ...mail })
    await logStep(admin, {
      lead_id: lead.id,
      step_key: CONFLICT_EMAIL,
      state: "done",
      detail: { by: "Automatic", to, flags: search.flags, reason: search.flags ? "match" : "no_opposing", search_at: search.at },
    })
    return true
  } catch (e) {
    await logStep(admin, {
      lead_id: lead.id,
      step_key: CONFLICT_EMAIL,
      state: "failed",
      detail: { by: "Automatic", to },
      error: e instanceof Error ? e.message.slice(0, 300) : "The email didn't go out.",
    })
    return false
  }
}
