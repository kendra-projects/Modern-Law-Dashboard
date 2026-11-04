"use server"

import { revalidatePath } from "next/cache"
import { getCurrentUser, getRole } from "@/lib/role"
import { createAdminClient } from "@/lib/supabase/admin"
import { canRemove, INVITE_DAYS, managedTeams, validEmail, type Team } from "@/lib/member-rules"
import { hashToken, newInviteToken, sendInviteEmail } from "@/lib/members"

type Result = { ok: true; message: string } | { ok: false; message: string }

export async function inviteMember(input: { name: string; email: string; team: Team }): Promise<Result> {
  const user = await getCurrentUser()
  const teams = managedTeams(user?.email)
  const db = createAdminClient()
  if (!user || !db) return { ok: false, message: "You aren't allowed to add members." }
  if (!teams.includes(input.team)) return { ok: false, message: "You can't add people to that team." }

  const name = input.name.trim().slice(0, 120)
  const email = input.email.trim().toLowerCase()
  if (!name) return { ok: false, message: "Please enter their name." }
  if (!validEmail(email)) return { ok: false, message: "That email address doesn't look right." }

  const { data: users, error: listError } = await db.auth.admin.listUsers({ perPage: 1000 })
  if (listError) return { ok: false, message: "Couldn't check the current members. Please try again." }
  if (users.users.some((u) => u.email?.toLowerCase() === email)) return { ok: false, message: "This person already has access." }

  // Adding someone again replaces their earlier invitation and its link.
  await db.from("member_invites").update({ status: "canceled", responded_at: new Date().toISOString() }).eq("email", email).eq("status", "pending")

  const token = newInviteToken()
  const { data: invite, error } = await db
    .from("member_invites")
    .insert({
      token_hash: hashToken(token),
      email,
      full_name: name,
      role: input.team,
      invited_by: user.email!,
      expires_at: new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString(),
    })
    .select("id")
    .single()
  if (error || !invite) return { ok: false, message: "Couldn't create the invitation. Please try again." }

  try {
    await sendInviteEmail({ to: email, name, team: input.team, token })
  } catch {
    await db.from("member_invites").delete().eq("id", invite.id)
    return { ok: false, message: "The invitation email couldn't be sent, so nothing was added. Please try again." }
  }
  revalidatePath("/members")
  return { ok: true, message: `Invitation sent to ${email}.` }
}

export async function cancelInvite(id: string): Promise<Result> {
  const user = await getCurrentUser()
  const db = createAdminClient()
  if (!user || !db) return { ok: false, message: "You aren't allowed to do that." }
  const { data: invite } = await db.from("member_invites").select("role, status").eq("id", id).maybeSingle()
  if (!invite || invite.status !== "pending") return { ok: false, message: "That invitation is no longer open." }
  if (!managedTeams(user.email).includes(invite.role as Team)) return { ok: false, message: "You can't change that team." }
  const { error } = await db.from("member_invites").update({ status: "canceled", responded_at: new Date().toISOString() }).eq("id", id).eq("status", "pending")
  if (error) return { ok: false, message: "Couldn't cancel the invitation. Please try again." }
  revalidatePath("/members")
  return { ok: true, message: "Invitation canceled." }
}

export async function removeMember(id: string): Promise<Result> {
  const user = await getCurrentUser()
  const db = createAdminClient()
  if (!user || !db) return { ok: false, message: "You aren't allowed to remove members." }
  const [{ data: target }, { data: profile }] = await Promise.all([
    db.auth.admin.getUserById(id),
    db.from("profiles").select("role").eq("id", id).maybeSingle(),
  ])
  const email = target?.user?.email
  if (!email) return { ok: false, message: "That member wasn't found." }
  // Checked here on the server, whatever the page showed.
  if (id === user.id || !canRemove(user.email, { email, role: profile?.role ?? "content" })) {
    return { ok: false, message: "You can't remove this person." }
  }
  const { error } = await db.auth.admin.deleteUser(id)
  if (error) return { ok: false, message: "Couldn't remove them. Please try again." }
  revalidatePath("/members")
  return { ok: true, message: `${email} no longer has access.` }
}

const SAME_OPEN_MS = 5 * 60_000

/** Called once when someone opens the dashboard in a tab. Never gets in the way of the page. */
export async function recordDashboardOpen() {
  try {
    const user = await getCurrentUser()
    const db = createAdminClient()
    if (!user?.email || !db) return
    const { data: recent } = await db
      .from("login_events")
      .select("id")
      .eq("user_id", user.id)
      .gte("created_at", new Date(Date.now() - SAME_OPEN_MS).toISOString())
      .limit(1)
    if (recent?.length) return
    const [role, { data: profile }] = await Promise.all([getRole(), db.from("profiles").select("full_name").eq("id", user.id).maybeSingle()])
    await db.from("login_events").insert({
      user_id: user.id,
      email: user.email,
      full_name: profile?.full_name ?? (user.user_metadata?.full_name as string | undefined) ?? null,
      role,
    })
  } catch {
    // The history is a record, not part of using the dashboard.
  }
}
