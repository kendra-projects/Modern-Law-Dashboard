import "server-only"

import nodemailer from "nodemailer"

// Email from the dashboard. Two ways, the first that is set up wins:
// - MAIL_WEBHOOK_URL: a Make scenario's custom webhook that sends the email
//   with the Gmail connected in Make and answers "sent" once Gmail took it.
//   Any other answer (Make queues the call while the scenario is off) counts
//   as not sent, so the dashboard tries again later.
// - SMTP: a Gmail account with an app password (SMTP_USER, SMTP_PASS);
//   SMTP_HOST and SMTP_PORT change the server, MAIL_FROM the sender's name.
// With neither, nothing is sent.

const webhook = () => process.env.MAIL_WEBHOOK_URL?.trim() || null

export const mailConfigured = () => Boolean(webhook() || (process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim()))

export async function sendMail(x: { to: string; subject: string; html: string; text: string }) {
  const hook = webhook()
  if (hook) {
    const res = await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(x),
      cache: "no-store",
    })
    const answer = (await res.text()).trim().slice(0, 200)
    if (!res.ok || answer !== "sent") throw new Error(`Make's email scenario didn't send it (${res.status} ${answer || "no answer"}).`)
    return { id: "make" }
  }

  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASS?.replace(/\s+/g, "")
  if (!user || !pass) throw new Error("Email isn't set up (MAIL_WEBHOOK_URL, or SMTP_USER and SMTP_PASS).")
  const port = Number(process.env.SMTP_PORT || 465)
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user, pass },
  })
  const info = await transport.sendMail({
    from: process.env.MAIL_FROM?.trim() || `Modern Law Dashboard <${user}>`,
    to: x.to,
    subject: x.subject,
    html: x.html,
    text: x.text,
  })
  return { id: info.messageId }
}
