import "server-only"

import { C, SANS, SERIF, SITE, conflictEmailTo, esc } from "@/lib/conflict-email"
import { logStep } from "@/lib/intake-step-log"
import { lexiConversationUrl } from "@/lib/lexi-followups"
import { mailConfigured, sendMail } from "@/lib/mail"
import type { createAdminClient } from "@/lib/supabase/admin"
import type { IntakeLead } from "@/types/database"

// When the intake bot can't pause a client's Lexi follow-ups on its own (a
// LexiDesk client with a similar but different name on the same phone, or a
// page that timed out), the team gets an email: what the bot saw, a button to
// the lead's Lexi step and what to do. To the team inbox like the conflict
// email (LEXI_EMAIL_TO, else CONFLICT_EMAIL_TO, else sales@). Once per lead.

export const LEXI_EMAIL = "lexi_email"
const lexiEmailTo = () => process.env.LEXI_EMAIL_TO?.trim() || conflictEmailTo()
const LEXIDESK_URL = "https://lexidesk.ai/dashboard"
const TZ = "America/Phoenix"

type Admin = NonNullable<ReturnType<typeof createAdminClient>>
export type LexiEmailLead = Pick<
  IntakeLead,
  "id" | "client_first" | "client_last" | "phone" | "email" | "consult_datetime" | "consulting_attorney" | "assigned_advocate" | "raw_payload"
>

export function lexiEmail(lead: LexiEmailLead, why: "needs_staff" | "failed", note: string) {
  const client = [lead.client_first, lead.client_last].filter(Boolean).join(" ") || "New client"
  const when = lead.consult_datetime
    ? new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(
        new Date(lead.consult_datetime)
      )
    : null
  const link = `${SITE}/intake/${lead.id}?step=lexi`
  const lexi = lexiConversationUrl(lead) ?? LEXIDESK_URL
  const unsure = why === "needs_staff"

  const subject = `${unsure ? "Check Lexi follow-ups" : "Lexi follow-ups not paused"}: ${client}${when ? ` (consult ${when})` : ""}`
  const badge = unsure ? "Needs a person" : "Bot couldn't finish"
  const summary = unsure
    ? "The bot found Lexi follow-ups that may belong to this client but didn't pause them, because the details don't match exactly. Lexi may keep texting the client until someone checks."
    : "The bot couldn't pause this client's Lexi follow-ups (LexiDesk didn't load or looked different). It tries again within the hour, but Lexi may keep texting the client until then."
  const facts: [string, string | null][] = [
    ["Client", client],
    ["Phone", lead.phone],
    ["Email", lead.email],
    ["Consultation", when && `${when} (Arizona)`],
    ["Attorney", lead.consulting_attorney],
    ["Advocate", lead.assigned_advocate],
  ]
  const steps = unsure
    ? [
        `Open LexiDesk and search the client's phone or email.`,
        "Same person (a different spelling or nickname): click <b>Pause</b> on any conversation showing Scheduled Follow-up Active, then <b>Paused</b> on the dashboard.",
        "A different person: leave it and click <b>Nothing pending</b> on the dashboard.",
      ]
    : [
        `Open LexiDesk and search the client's name, phone or email.`,
        "Click <b>Pause</b> on any conversation showing Scheduled Follow-up Active.",
        "On the dashboard click <b>Paused</b>, or <b>Nothing pending</b> if there was none.",
      ]

  const label = (t: string) =>
    `<div style="font:700 11px ${SANS};color:${C.muted};letter-spacing:1px;text-transform:uppercase;padding-bottom:8px">${t}</div>`
  const row = (k: string, v: string) =>
    `<tr><td style="padding:7px 0;width:132px;vertical-align:top;font:13px ${SANS};color:${C.muted}">${esc(k)}</td>` +
    `<td style="padding:7px 0;vertical-align:top;font:600 14px ${SANS};color:${C.ink}">${esc(v)}</td></tr>`
  const step = (s: string, i: number) =>
    `<tr><td style="width:30px;vertical-align:top;padding:6px 0"><div style="width:20px;height:20px;border-radius:10px;background:${C.soft};color:${C.primary};font:700 12px/20px ${SANS};text-align:center">${i + 1}</div></td>` +
    `<td style="vertical-align:top;padding:6px 0;font:14px/1.55 ${SANS};color:${C.ink}">${s.replace(/<b>/g, `<b style="color:${C.primary}">`)}</td></tr>`
  const button = (href: string, text: string, primary: boolean) =>
    `<td style="border-radius:8px;${primary ? `background:${C.primary}` : `border:1px solid ${C.border}`}">` +
    `<a href="${esc(href)}" style="display:inline-block;padding:12px 22px;font:700 14px ${SANS};color:${primary ? C.onPrimary : C.ink};text-decoration:none;border-radius:8px">${text}</a></td>`

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
  <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${C.warningSoft};color:${C.warning};font:600 12px ${SANS};letter-spacing:.3px">${badge}</span>
  <h1 style="margin:14px 0 8px;font:600 24px/1.25 ${SERIF};color:${C.ink}">Lexi follow-ups need a check</h1>
  <p style="margin:0;font:15px/1.6 ${SANS};color:${C.muted}">${esc(summary)}</p>
</td></tr>
<tr><td style="padding:16px 28px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.border};border-bottom:1px solid ${C.border}">
${facts
  .filter(([, v]) => v)
  .map(([k, v]) => row(k, v!))
  .join("")}
</table></td></tr>
<tr><td style="padding:22px 28px 4px">${label("What the bot saw")}<div style="border:1px solid ${C.border};border-left:3px solid ${C.warning};border-radius:8px;padding:12px 14px;font:14px/1.55 ${SANS};color:${C.ink}">${esc(note)}</div></td></tr>
<tr><td style="padding:24px 28px 8px">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>${button(link, "Open the lead &rarr;", true)}<td style="width:10px"></td>${button(lexi, "Open LexiDesk", false)}</tr></table>
</td></tr>
<tr><td style="padding:18px 28px 26px">${label("What to do")}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${steps.map(step).join("")}</table></td></tr>
<tr><td style="padding:14px 28px;background:${C.soft};border-top:1px solid ${C.border};font:12px/1.5 ${SANS};color:${C.muted}">
  Automated message from the Modern Law Operations Dashboard. Sign in with the intake team login if prompted.
</td></tr>
</table>
</td></tr></table>
</body></html>`

  const text = [
    `${unsure ? "CHECK LEXI FOLLOW-UPS" : "LEXI FOLLOW-UPS NOT PAUSED"}: ${client}`,
    summary,
    "",
    ...facts.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
    "",
    `What the bot saw: ${note}`,
    "",
    `Open the lead: ${link}`,
    `Open LexiDesk: ${lexi}`,
    "",
    "What to do:",
    ...steps.map((s, i) => `${i + 1}. ${s.replace(/<\/?b>/g, "")}`),
  ].join("\n")

  return { subject, html, text }
}

/** Email the team that the bot left a lead's Lexi follow-ups, once per lead. Returns true when it sent. */
export async function emailLexi(admin: Admin, leadId: string, why: "needs_staff" | "failed", note: string): Promise<boolean> {
  if (!mailConfigured()) return false
  const [{ data: lead }, { data: row }] = await Promise.all([
    admin
      .from("intake_leads")
      .select("id, client_first, client_last, phone, email, consult_datetime, consulting_attorney, assigned_advocate, raw_payload")
      .eq("id", leadId)
      .maybeSingle(),
    admin.from("intake_steps").select("state").eq("lead_id", leadId).eq("step_key", LEXI_EMAIL).maybeSingle(),
  ])
  if (!lead || row?.state === "done") return false

  const to = lexiEmailTo()
  try {
    await sendMail({ to, ...lexiEmail(lead as LexiEmailLead, why, note) })
    await logStep(admin, { lead_id: leadId, step_key: LEXI_EMAIL, state: "done", detail: { by: "Automatic", to, reason: why } })
    return true
  } catch (e) {
    await logStep(admin, {
      lead_id: leadId,
      step_key: LEXI_EMAIL,
      state: "failed",
      detail: { by: "Automatic", to },
      error: e instanceof Error ? e.message.slice(0, 300) : "The email didn't go out.",
    })
    return false
  }
}
