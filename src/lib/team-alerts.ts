import "server-only"

import { C, SANS, SERIF, SITE, conflictEmailTo, esc } from "@/lib/conflict-email"
import { botAlertTo } from "@/lib/clio-signin-alert"
import { clioFetch, clioStatus } from "@/lib/clio"
import { logStep } from "@/lib/intake-step-log"
import { mailConfigured, sendMail } from "@/lib/mail"
import type { createAdminClient } from "@/lib/supabase/admin"
import type { IntakeLead } from "@/types/database"

// Emails for intake work the automation can't finish without a person: a
// confirmation text the bot left for staff, a consult no advocate is free
// for, and Clio disconnected from the dashboard. (No email for a booking still
// waiting for its Clio Grow matter: the firm converts it only once the lead
// becomes a client, which can take days.) To the team inbox (TEAM_EMAIL_TO, else CONFLICT_EMAIL_TO,
// else sales@); a lost Clio connection also goes to the developer. A lead's
// email goes once per lead and kind (logged as its own step); the connection
// email at most once a day while it stays broken. Same theme as the conflict
// email.

export const teamEmailTo = () => process.env.TEAM_EMAIL_TO?.trim() || conflictEmailTo()
// The "send the text by hand" email goes to the developer for now, to see how
// many there are (19 Oct 2026); set TEXT_EMAIL_TO to the team inbox to hand it over.
const textEmailTo = () => process.env.TEXT_EMAIL_TO?.trim() || botAlertTo()
const TZ = "America/Phoenix"
const CLIO_APP = "https://app.clio.com/nc/#"

type Admin = NonNullable<ReturnType<typeof createAdminClient>>
type Lead = Pick<
  IntakeLead,
  "id" | "client_first" | "client_last" | "phone" | "email" | "consult_datetime" | "consulting_attorney" | "assigned_advocate" | "matter_type" | "clio_matter_id" | "created_at"
>
const LEAD_COLS = "id, client_first, client_last, phone, email, consult_datetime, consulting_attorney, assigned_advocate, matter_type, clio_matter_id, created_at"

const clientOf = (l: Lead) => [l.client_first, l.client_last].filter(Boolean).join(" ") || "New client"
const whenOf = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso))
    : null
const leadFacts = (l: Lead): [string, string | null][] => [
  ["Client", clientOf(l)],
  ["Phone", l.phone],
  ["Email", l.email],
  ["Consultation", whenOf(l.consult_datetime) && `${whenOf(l.consult_datetime)} (Arizona)`],
  ["Attorney", l.consulting_attorney],
  ["Advocate", l.assigned_advocate],
  ["Matter type", l.matter_type],
]

type Mail = { subject: string; html: string; text: string }

/** One email in the dashboard's Luxury Evening theme. Steps may hold <b>, <a> and a <code>…</code> line. */
export function teamEmail(x: {
  subject: string
  badge: string
  tone: "warning" | "danger"
  title: string
  summary: string
  facts?: [string, string | null][]
  noteLabel?: string
  note?: string | null
  buttons: { href: string; text: string }[]
  steps: string[]
  footer: string
}): Mail {
  const fg = x.tone === "danger" ? C.danger : C.warning
  const bg = x.tone === "danger" ? C.dangerSoft : C.warningSoft
  const facts = (x.facts ?? []).filter(([, v]) => v) as [string, string][]
  const label = (t: string) =>
    `<div style="font:700 11px ${SANS};color:${C.muted};letter-spacing:1px;text-transform:uppercase;padding-bottom:8px">${t}</div>`
  const row = (k: string, v: string) =>
    `<tr><td style="padding:7px 0;width:132px;vertical-align:top;font:13px ${SANS};color:${C.muted}">${esc(k)}</td>` +
    `<td style="padding:7px 0;vertical-align:top;font:600 14px ${SANS};color:${C.ink}">${esc(v)}</td></tr>`
  const styled = (s: string) =>
    s
      .replace(/<b>/g, `<b style="color:${C.primary}">`)
      .replace(/<a href="/g, `<a style="color:${C.primary}" href="`)
      .replace(
        /<code>([^<]*)<\/code>/g,
        `<div style="margin-top:8px;padding:10px 12px;background:${C.page};border:1px solid ${C.border};border-radius:6px;font:600 14px 'SFMono-Regular',Consolas,Menlo,monospace;color:${C.ink}">$1</div>`
      )
  const step = (s: string, i: number) =>
    `<tr><td style="width:30px;vertical-align:top;padding:6px 0"><div style="width:20px;height:20px;border-radius:10px;background:${C.soft};color:${C.primary};font:700 12px/20px ${SANS};text-align:center">${i + 1}</div></td>` +
    `<td style="vertical-align:top;padding:6px 0;font:14px/1.55 ${SANS};color:${C.ink}">${styled(s)}</td></tr>`
  const button = (b: { href: string; text: string }, i: number) =>
    `${i ? `<td style="width:10px"></td>` : ""}<td style="border-radius:8px;${i ? `border:1px solid ${C.border}` : `background:${C.primary}`}">` +
    `<a href="${esc(b.href)}" style="display:inline-block;padding:12px 22px;font:700 14px ${SANS};color:${i ? C.ink : C.onPrimary};text-decoration:none;border-radius:8px">${esc(b.text)}${i ? "" : " &rarr;"}</a></td>`

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>${esc(x.subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Playfair+Display:wght@600&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:${C.page}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(x.summary)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.card};border:1px solid ${C.border};border-radius:14px;overflow:hidden">
<tr><td style="background:${C.header};padding:18px 28px;border-bottom:1px solid ${C.border}">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="padding-right:12px;vertical-align:middle"><img src="${SITE}/logo-white.png" width="36" height="37" alt="ML" style="display:block"></td>
    <td style="vertical-align:middle"><div style="font:600 17px ${SERIF};color:${C.ink}">Modern Law</div><div style="font:12px ${SANS};color:${C.headerText};letter-spacing:.4px">Operations Dashboard &middot; Intake</div></td>
  </tr></table>
</td></tr>
<tr><td style="padding:28px 28px 8px">
  <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${bg};color:${fg};font:600 12px ${SANS};letter-spacing:.3px">${esc(x.badge)}</span>
  <h1 style="margin:14px 0 8px;font:600 24px/1.25 ${SERIF};color:${C.ink}">${esc(x.title)}</h1>
  <p style="margin:0;font:15px/1.6 ${SANS};color:${C.muted}">${esc(x.summary)}</p>
</td></tr>
${
  facts.length
    ? `<tr><td style="padding:16px 28px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.border};border-bottom:1px solid ${C.border}">${facts
        .map(([k, v]) => row(k, v))
        .join("")}</table></td></tr>`
    : ""
}
${
  x.note
    ? `<tr><td style="padding:22px 28px 4px">${label(x.noteLabel ?? "Details")}<div style="border:1px solid ${C.border};border-left:3px solid ${fg};border-radius:8px;padding:12px 14px;font:14px/1.55 ${SANS};color:${C.ink}">${esc(x.note)}</div></td></tr>`
    : ""
}
<tr><td style="padding:24px 28px 8px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${x.buttons.map(button).join("")}</tr></table></td></tr>
<tr><td style="padding:18px 28px 26px">${label("What to do")}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${x.steps.map(step).join("")}</table></td></tr>
<tr><td style="padding:14px 28px;background:${C.soft};border-top:1px solid ${C.border};font:12px/1.5 ${SANS};color:${C.muted}">${esc(x.footer)}</td></tr>
</table>
</td></tr></table>
</body></html>`

  const plain = (s: string) =>
    s
      .replace(/<a href="([^"]*)"[^>]*>([^<]*)<\/a>/g, "$2 ($1)")
      .replace(/<code>([^<]*)<\/code>/g, "\n   $1")
      .replace(/<\/?b>/g, "")
  const text = [
    x.subject,
    x.summary,
    "",
    ...facts.map(([k, v]) => `${k}: ${v}`),
    ...(x.note ? ["", `${x.noteLabel ?? "Details"}: ${x.note}`] : []),
    "",
    ...x.buttons.map((b) => `${b.text}: ${b.href}`),
    "",
    "What to do:",
    ...x.steps.map((s, i) => `${i + 1}. ${plain(s)}`),
  ].join("\n")

  return { subject: x.subject, html, text }
}

const FOOTER = "Automated message from the Modern Law Operations Dashboard, sent once for this booking. Sign in with the intake team login if prompted."

/** Email the team about one lead, once per kind (logged as step `stepKey`). Returns true when it sent. */
async function emailLeadOnce(
  admin: Admin,
  leadId: string,
  stepKey: string,
  build: (lead: Lead) => Mail,
  detail: Record<string, unknown> = {},
  to = teamEmailTo()
) {
  if (!mailConfigured()) return false
  const [{ data: lead }, { data: row }] = await Promise.all([
    admin.from("intake_leads").select(LEAD_COLS).eq("id", leadId).maybeSingle(),
    admin.from("intake_steps").select("state").eq("lead_id", leadId).eq("step_key", stepKey).maybeSingle(),
  ])
  if (!lead || row?.state === "done") return false
  try {
    await sendMail({ to, ...build(lead as Lead) })
    await logStep(admin, { lead_id: leadId, step_key: stepKey, state: "done", detail: { by: "Automatic", to, ...detail } })
    return true
  } catch (e) {
    await logStep(admin, {
      lead_id: leadId,
      step_key: stepKey,
      state: "failed",
      detail: { by: "Automatic", to, ...detail },
      error: e instanceof Error ? e.message.slice(0, 300) : "The email didn't go out.",
    })
    return false
  }
}

export const TEXT_EMAIL = "text_email"
export const ADVOCATE_EMAIL = "advocate_email"

/** The bot left the confirmation text for staff (the number or name in Clio doesn't match the booking, say). */
export function emailTextForStaff(admin: Admin, leadId: string, note: string) {
  return emailLeadOnce(admin, leadId, TEXT_EMAIL, (l) => {
    const when = whenOf(l.consult_datetime)
    const buttons = [{ href: `${SITE}/intake/${l.id}?step=text`, text: "Open the lead" }]
    if (l.clio_matter_id) buttons.push({ href: `${CLIO_APP}/matters/${l.clio_matter_id}/communications?tab=3`, text: "Open the matter's texts" })
    return teamEmail({
      subject: `Send the confirmation text by hand: ${clientOf(l)}${when ? ` (consult ${when})` : ""}`,
      badge: "Text not sent",
      tone: "warning",
      title: "Confirmation text needs a person",
      summary: "The bot didn't send this client's confirmation text because something didn't match. Send it from the Clio matter so the client has the consult details.",
      facts: leadFacts(l),
      noteLabel: "Why the bot stopped",
      note,
      buttons,
      steps: [
        "Open the lead and go to <b>Confirmation text</b>, then click <b>Copy &amp; open in Clio</b>.",
        "Check the client's name and phone in Clio against the booking and fix them if needed. Paste the text and send it.",
        "Click <b>Mark sent</b> on the dashboard.",
      ],
      footer: FOOTER,
    })
  }, { reason: note.slice(0, 200) }, textEmailTo())
}

/** Nobody was free to take the consult, so it has no advocate yet. */
export function emailNoAdvocate(admin: Admin, leadId: string, why: string | null) {
  return emailLeadOnce(admin, leadId, ADVOCATE_EMAIL, (l) => {
    const when = whenOf(l.consult_datetime)
    return teamEmail({
      subject: `Pick an advocate: ${clientOf(l)}${when ? ` (consult ${when})` : ""}`,
      badge: "No advocate yet",
      tone: "warning",
      title: "This consult needs an advocate",
      summary: "The dashboard couldn't find a free advocate for this consult, so the portal invite, Slack post, follow-up tasks and confirmation text are waiting for one.",
      facts: leadFacts(l),
      noteLabel: "What the dashboard checked",
      note: why,
      buttons: [{ href: `${SITE}/intake/${l.id}?step=advocate`, text: "Open the lead" }],
      steps: [
        "Open the lead and go to <b>Assign the advocate</b>.",
        "Pick who takes this consult. The rest of the intake then runs on its own.",
      ],
      footer: FOOTER,
    })
  }, { why })
}

/**
 * Is the dashboard's Clio connection still working? A refused sign-in (401,
 * 403, a refresh Clio won't take, or no connection at all) emails the team
 * and the developer, at most once a day until it's reconnected. A busy or
 * down Clio (429, 5xx, network) doesn't count. Runs with the bot's hourly call.
 */
export async function checkClioConnection(admin: Admin): Promise<boolean> {
  if (!mailConfigured()) return false
  let reason: string | null = null
  if (!(await clioStatus()).connected) reason = "The dashboard has no Clio connection (it was disconnected in Intake Settings or never set up)."
  else {
    try {
      await clioFetch("/api/v4/users/who_am_i.json?fields=id")
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/\((401|403)\)|invalid_grant|invalid_token|unauthori[sz]ed|not connected/i.test(msg)) {
        const code = msg.match(/\((40[13])\)/)?.[1]
        reason = `Clio refused the dashboard's sign-in${code ? ` (error ${code})` : ""}: the connection was revoked or has expired.`
      }
    }
  }
  if (!reason) return false

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date())
  const { data: sent } = await admin.from("bot_alerts").select("id").eq("kind", "clio_connection").eq("session_sha", today).limit(1)
  if (sent?.length) return false

  const mail = teamEmail({
    subject: "Clio is disconnected from the dashboard",
    badge: "Clio disconnected",
    tone: "danger",
    title: "Reconnect Clio to the dashboard",
    summary:
      "The dashboard can't sign in to Clio Manage any more. Until it's reconnected, new bookings don't get their Clio matter picked up, portal invite, follow-up tasks or conflict search.",
    noteLabel: "What Clio answered",
    note: reason,
    buttons: [{ href: `${SITE}/intake/settings`, text: "Open Intake Settings" }],
    steps: [
      "Open <b>Intake Settings</b> on the dashboard (an admin or intake login).",
      "Click <b>Reconnect Clio</b>, sign in with a Clio admin account (Kendra's) and click <b>Allow</b>.",
      "That's all: the dashboard catches up on the waiting bookings within the hour.",
    ],
    footer: "Automated message from the Modern Law Operations Dashboard, sent at most once a day until Clio is reconnected.",
  })
  const to = Array.from(new Set([teamEmailTo(), botAlertTo()]))
  for (const addr of to) await sendMail({ to: addr, ...mail })
  await admin.from("bot_alerts").insert({ kind: "clio_connection", session_sha: today, sent_to: to.join(", ") })
  return true
}
