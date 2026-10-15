import "server-only"

import nodemailer from "nodemailer"

// Email from the dashboard, over SMTP. Set up for a Gmail account with an app
// password (SMTP_USER, SMTP_PASS); SMTP_HOST and SMTP_PORT change the server,
// MAIL_FROM the sender's name. Without SMTP_USER and SMTP_PASS nothing is sent.

export const mailConfigured = () => Boolean(process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim())

export async function sendMail(x: { to: string; subject: string; html: string; text: string }) {
  const user = process.env.SMTP_USER?.trim()
  const pass = process.env.SMTP_PASS?.replace(/\s+/g, "")
  if (!user || !pass) throw new Error("Email isn't set up (SMTP_USER and SMTP_PASS are missing).")
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
