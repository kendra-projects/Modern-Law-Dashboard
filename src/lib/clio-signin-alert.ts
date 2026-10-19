import "server-only"

import { C, SANS, SERIF, SITE, esc } from "@/lib/conflict-email"
import { mailConfigured, sendMail } from "@/lib/mail"
import { createAdminClient } from "@/lib/supabase/admin"

// The intake bot sends confirmation texts through a Clio session a person signs
// in to by hand in the bot's Codespace (`npm run clio-login`, modern-law-bot
// README). Each sign-in is a commit on the bot repo's `clio-session` branch,
// and Clio ends the session after about 30 days. The developer, not the firm,
// gets an email 25 days after the last sign-in (CLIO_SIGNIN_REMIND_DAYS), and
// right away if the bot finds the session already ran out, both with the steps
// to sign in again. Each goes once per sign-in (table bot_alerts).

const BOT_REPO = () => process.env.BOT_REPO?.trim() || "abdulqayyum3116-art/modern-law-bot"
export const botAlertTo = () => process.env.BOT_ALERT_EMAIL?.trim() || "abdulqayyum3116@gmail.com"
// The Codespace itself (github.dev opens it, starting it if stopped). GitHub
// deletes a Codespace left unused for about 30 days, so the email keeps the
// github.com/codespaces route as the fallback.
const codespaceUrl = () => process.env.CLIO_CODESPACE_URL?.trim() || "https://fluffy-dollop-r7gq77qxgxqwh5jgj.github.dev/"
const remindAfterDays = () => Number(process.env.CLIO_SIGNIN_REMIND_DAYS || 25)
const SESSION_DAYS = 30
const DAY = 24 * 60 * 60 * 1000
const TZ = "America/Phoenix"

type Kind = "reminder" | "expired"
type Admin = NonNullable<ReturnType<typeof createAdminClient>>

/** The last sign-in: the newest commit on the bot repo's clio-session branch. */
async function lastSignIn(): Promise<{ sha: string; at: Date } | null> {
  const token = process.env.GITHUB_BOT_TOKEN?.trim()
  if (!token) return null
  const res = await fetch(`https://api.github.com/repos/${BOT_REPO()}/branches/clio-session`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    cache: "no-store",
  }).catch(() => null)
  if (!res?.ok) return null
  const j = (await res.json().catch(() => null)) as { commit?: { sha?: string; commit?: { committer?: { date?: string } } } } | null
  const sha = j?.commit?.sha
  const date = j?.commit?.commit?.committer?.date
  return sha && date ? { sha, at: new Date(date) } : null
}

const day = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" }).format(d)

export function signInEmail(kind: Kind, signedIn: Date) {
  const days = Math.floor((Date.now() - signedIn.getTime()) / DAY)
  const endsBy = new Date(signedIn.getTime() + SESSION_DAYS * DAY)
  const expired = kind === "expired"
  const repo = `https://github.com/${BOT_REPO()}`
  const codespaces = "https://github.com/codespaces"
  const codespace = codespaceUrl()

  const subject = expired
    ? "Action needed: the intake bot's Clio sign-in ran out"
    : `Reminder: sign the intake bot in to Clio again by ${day(endsBy)}`
  const summary = expired
    ? `The bot found its Clio sign-in has ended (last signed in ${day(signedIn)}). Confirmation texts are on hold until someone signs in again; the waiting ones go out within the hour after.`
    : `The bot last signed in to Clio on ${day(signedIn)}, ${days} days ago. Clio ends the sign-in after about ${SESSION_DAYS} days, around ${day(endsBy)}, and then confirmation texts stop. Sign in again before then.`
  const steps = [
    `Click <b>Open the Codespace</b> above (it starts if it was stopped). If the link doesn't open it: <a href="${codespaces}" style="color:${C.primary}">github.com/codespaces</a> → the modern-law-bot Codespace, or if there is none, the <a href="${repo}" style="color:${C.primary}">bot repo</a> → Code → Codespaces → Create codespace on main.`,
    "When it has loaded, paste this in the Terminal and press Enter:",
    "Ports tab → port <b>6080</b> → the globe icon → <b>Connect</b>, password <b>vscode</b>. Clio's sign-in page is open on that desktop.",
    "Sign in with Kendra's Clio login and the code from her phone (or a backup code). On the code page tick <b>Don't ask again for 30 days</b>.",
    "When the Terminal says <b>Done</b>, stop the Codespace (github.com/codespaces → … → Stop; don't delete it). The bot uses the new sign-in from its next run.",
  ]
  const command = "npm run clio-login"

  const label = (t: string) =>
    `<div style="font:700 11px ${SANS};color:${C.muted};letter-spacing:1px;text-transform:uppercase;padding-bottom:8px">${t}</div>`
  const step = (s: string, i: number) =>
    `<tr><td style="width:30px;vertical-align:top;padding:6px 0"><div style="width:20px;height:20px;border-radius:10px;background:${C.soft};color:${C.primary};font:700 12px/20px ${SANS};text-align:center">${i + 1}</div></td>` +
    `<td style="vertical-align:top;padding:6px 0;font:14px/1.55 ${SANS};color:${C.ink}">${s.replace(/<b>/g, `<b style="color:${C.primary}">`)}${
      i === 1
        ? `<div style="margin-top:8px;padding:10px 12px;background:${C.page};border:1px solid ${C.border};border-radius:6px;font:600 14px 'SFMono-Regular',Consolas,Menlo,monospace;color:${C.ink}">${command}</div>`
        : ""
    }</td></tr>`
  const button = (href: string, text: string, primary: boolean) =>
    `<td style="border-radius:8px;${primary ? `background:${C.primary}` : `border:1px solid ${C.border}`}">` +
    `<a href="${esc(href)}" style="display:inline-block;padding:12px 22px;font:700 14px ${SANS};color:${primary ? C.onPrimary : C.ink};text-decoration:none;border-radius:8px">${text}</a></td>`
  const badge = expired ? { text: "Texts on hold", fg: C.danger, bg: C.dangerSoft } : { text: `${days} days since sign-in`, fg: C.warning, bg: C.warningSoft }

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
    <td style="vertical-align:middle"><div style="font:600 17px ${SERIF};color:${C.ink}">Modern Law</div><div style="font:12px ${SANS};color:${C.headerText};letter-spacing:.4px">Intake bot &middot; for the developer</div></td>
  </tr></table>
</td></tr>
<tr><td style="padding:28px 28px 8px">
  <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${badge.bg};color:${badge.fg};font:600 12px ${SANS};letter-spacing:.3px">${badge.text}</span>
  <h1 style="margin:14px 0 8px;font:600 24px/1.25 ${SERIF};color:${C.ink}">${expired ? "Sign the bot in to Clio again" : "Time to sign the bot in to Clio again"}</h1>
  <p style="margin:0;font:15px/1.6 ${SANS};color:${C.muted}">${esc(summary)}</p>
</td></tr>
<tr><td style="padding:22px 28px 8px">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>${button(codespace, "Open the Codespace &rarr;", true)}<td style="width:10px"></td>${button(`${repo}#signing-in-to-clio-codespace`, "Steps in the README", false)}</tr></table>
</td></tr>
<tr><td style="padding:18px 28px 26px">${label("How to sign in (about 5 minutes)")}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${steps.map(step).join("")}</table></td></tr>
<tr><td style="padding:14px 28px;background:${C.soft};border-top:1px solid ${C.border};font:12px/1.5 ${SANS};color:${C.muted}">
  Sent by the Modern Law dashboard to the developer only, never to the firm. ${expired ? "Sent once for this sign-in." : "One reminder per sign-in; if it runs out you get one more email."}
</td></tr>
</table>
</td></tr></table>
</body></html>`

  const strip = (s: string) => s.replace(/<a [^>]*>([^<]*)<\/a>/g, "$1").replace(/<\/?b>/g, "")
  const text = [
    subject,
    summary,
    "",
    `Open the Codespace: ${codespace}`,
    `All Codespaces: ${codespaces}`,
    `Bot repo: ${repo}`,
    "",
    "How to sign in:",
    ...steps.map((s, i) => `${i + 1}. ${strip(s)}${i === 1 ? `\n   ${command}` : ""}`),
  ].join("\n")

  return { subject, html, text }
}

/** Send this kind of email for this sign-in once. Returns true when it sent. */
async function alertOnce(admin: Admin, kind: Kind, session: { sha: string; at: Date }) {
  if (!mailConfigured()) return false
  const { data: sent } = await admin.from("bot_alerts").select("id").eq("kind", kind).eq("session_sha", session.sha).limit(1)
  if (sent?.length) return false
  const to = botAlertTo()
  await sendMail({ to, ...signInEmail(kind, session.at) })
  await admin.from("bot_alerts").insert({ kind, session_sha: session.sha, sent_to: to })
  return true
}

/** The timer: once the last sign-in is CLIO_SIGNIN_REMIND_DAYS old, remind the developer. Runs with the bot's hourly check. */
export async function remindClioSignIn(): Promise<boolean> {
  const admin = createAdminClient()
  const session = await lastSignIn()
  if (!admin || !session) return false
  if (Date.now() - session.at.getTime() < remindAfterDays() * DAY) return false
  return alertOnce(admin, "reminder", session)
}

/** The bot found the sign-in already ran out: tell the developer now. */
export async function alertClioSignInExpired(): Promise<boolean> {
  const admin = createAdminClient()
  const session = await lastSignIn()
  if (!admin || !session) return false
  return alertOnce(admin, "expired", session)
}
