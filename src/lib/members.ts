import "server-only"

import { createHash, randomBytes } from "node:crypto"
import { redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUser } from "@/lib/role"
import { SITE } from "@/lib/conflict-email"
import { sendMail } from "@/lib/mail"
import { canManageRole, canRemove, INVITE_DAYS, managedTeams, type Team } from "@/lib/member-rules"

// Team members: the three main logins (lib/member-rules.ts) invite people by
// email and remove them. Someone invited gets an email with Accept and Reject;
// accepting asks them to set a password, and only then is their login made. The
// link's token is stored only as a hash. Emails go through sendMail (Make).

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex")

export type Member = { id: string; name: string; email: string; role: string; lastOpened: string | null; removable: boolean }
export type PendingInvite = { id: string; name: string; email: string; team: Team; invitedBy: string; sent: string; expired: boolean }
export type LoginEvent = { id: string; name: string; email: string; role: string; at: string }

/** The signed-in main login and its teams; anyone else goes back to the home page. */
export async function requireManager() {
  const user = await getCurrentUser()
  const teams = managedTeams(user?.email)
  if (!user || !teams.length) redirect("/")
  return { email: user.email!, teams }
}

function admin() {
  const client = createAdminClient()
  if (!client) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing")
  return client
}

export async function listMembers(manager: string): Promise<Member[]> {
  const db = admin()
  const [{ data: users, error }, { data: profiles }, { data: events }] = await Promise.all([
    db.auth.admin.listUsers({ perPage: 1000 }),
    db.from("profiles").select("id, role, full_name"),
    db.from("login_events").select("user_id, created_at").order("created_at", { ascending: false }).limit(5000),
  ])
  if (error) throw new Error(error.message)
  const profile = new Map((profiles ?? []).map((p) => [p.id, p]))
  const last = new Map<string, string>()
  for (const e of events ?? []) if (!last.has(e.user_id)) last.set(e.user_id, e.created_at)
  return users.users
    .map((u) => {
      const p = profile.get(u.id)
      const role = p?.role ?? "content"
      const email = u.email ?? ""
      return {
        id: u.id,
        name: p?.full_name ?? (u.user_metadata?.full_name as string | undefined) ?? email.split("@")[0],
        email,
        role,
        lastOpened: last.get(u.id) ?? u.last_sign_in_at ?? null,
        removable: canRemove(manager, { email, role }),
      }
    })
    .filter((m) => canManageRole(manager, m.role))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function listPendingInvites(teams: Team[]): Promise<PendingInvite[]> {
  const { data, error } = await admin()
    .from("member_invites")
    .select("id, full_name, email, role, invited_by, created_at, expires_at")
    .eq("status", "pending")
    .in("role", teams)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((i) => ({
    id: i.id,
    name: i.full_name,
    email: i.email,
    team: i.role as Team,
    invitedBy: i.invited_by,
    sent: i.created_at,
    expired: new Date(i.expires_at).getTime() < Date.now(),
  }))
}

/** Who opened the dashboard, newest first: the admin sees everyone, a team login its own team. */
export async function listLoginEvents(teams: Team[]): Promise<LoginEvent[]> {
  const roles = teams.length === 2 ? ["content", "intake", "admin"] : teams
  const { data, error } = await admin()
    .from("login_events")
    .select("id, full_name, email, role, created_at")
    .in("role", roles)
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) throw new Error(error.message)
  return (data ?? []).map((e) => ({ id: e.id, name: e.full_name ?? e.email.split("@")[0], email: e.email, role: e.role, at: e.created_at }))
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)
const TEAM_NAME: Record<Team, string> = { content: "Content", intake: "Intake" }

export async function sendInviteEmail(x: { to: string; name: string; team: Team; token: string }) {
  const accept = `${SITE}/invite/${x.token}?choice=accept`
  const reject = `${SITE}/invite/${x.token}?choice=reject`
  const team = TEAM_NAME[x.team]
  const subject = `You're invited to the Modern Law dashboard`
  const button = (href: string, label: string, primary: boolean) =>
    `<a href="${esc(href)}" style="display:inline-block;padding:12px 24px;margin-right:8px;border-radius:8px;font:700 14px Arial,sans-serif;text-decoration:none;${
      primary ? "background:#d97706;color:#ffffff" : "background:#ffffff;color:#44403c;border:1px solid #d6d3d1"
    }">${label}</a>`
  const html = `<!doctype html><html lang="en"><body style="margin:0;padding:24px;background:#f5f5f4">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e7e5e4;border-radius:12px">
<tr><td style="padding:28px">
  <h1 style="margin:0 0 12px;font:600 22px Georgia,serif;color:#1c1917">You're invited to the Modern Law dashboard</h1>
  <p style="margin:0 0 8px;font:15px/1.6 Arial,sans-serif;color:#44403c">Hi ${esc(x.name)},</p>
  <p style="margin:0 0 22px;font:15px/1.6 Arial,sans-serif;color:#44403c">You've been invited to join the <b>${team}</b> team on the Modern Law dashboard. If you accept, you'll choose your own password and can then log in with this email address.</p>
  ${button(accept, "Accept", true)}${button(reject, "Reject", false)}
  <p style="margin:22px 0 0;font:13px/1.5 Arial,sans-serif;color:#78716c">This invitation lasts ${INVITE_DAYS} days. If you weren't expecting it, you can reject it or ignore this email.</p>
</td></tr></table>
</td></tr></table></body></html>`
  const text = [
    `Hi ${x.name},`,
    "",
    `You've been invited to join the ${team} team on the Modern Law dashboard.`,
    "",
    `Accept: ${accept}`,
    `Reject: ${reject}`,
    "",
    `This invitation lasts ${INVITE_DAYS} days.`,
  ].join("\n")
  await sendMail({ to: x.to, subject, html, text })
}

export const newInviteToken = () => randomBytes(32).toString("base64url")
