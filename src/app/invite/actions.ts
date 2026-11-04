"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { hashToken } from "@/lib/members"
import { WORKSPACE_COOKIE } from "@/lib/workspace"

async function openInvite(token: string) {
  const db = createAdminClient()
  if (!db) return null
  const { data } = await db.from("member_invites").select("*").eq("token_hash", hashToken(token)).maybeSingle()
  if (!data || data.status !== "pending" || new Date(data.expires_at).getTime() < Date.now()) return null
  return { db, invite: data }
}

const CLOSED = "This invitation is no longer open. Please ask for a new one."

export async function acceptInvite(
  _prev: { error: string } | null,
  form: FormData
): Promise<{ error: string } | null> {
  const token = String(form.get("token") || "")
  const password = String(form.get("password") || "")
  if (password.length < 8) return { error: "Please choose a password of at least 8 characters." }
  if (password !== String(form.get("confirm") || "")) return { error: "The two passwords don't match." }

  const open = await openInvite(token)
  if (!open) return { error: CLOSED }
  const { db, invite } = open

  const { data: made, error } = await db.auth.admin.createUser({
    email: invite.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: invite.full_name },
  })
  if (error || !made.user) {
    return { error: /already|registered|exists/i.test(error?.message ?? "") ? "This email already has access. Please log in instead." : "Your account couldn't be set up. Please try again." }
  }

  // New logins start on the content team by default, so set the right team
  // before they can use it, or take the login away again.
  const { error: roleError } = await db.from("profiles").upsert({ id: made.user.id, role: invite.role as "content" | "intake", full_name: invite.full_name })
  if (roleError) {
    await db.auth.admin.deleteUser(made.user.id)
    return { error: "Your account couldn't be set up. Please try again." }
  }

  await db.from("member_invites").update({ status: "accepted", responded_at: new Date().toISOString() }).eq("id", invite.id)

  const supabase = await createClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: invite.email, password })
  if (signInError) redirect("/login")
  cookies().delete(WORKSPACE_COOKIE)
  redirect("/")
}

export async function rejectInvite(form: FormData) {
  const token = String(form.get("token") || "")
  const open = await openInvite(token)
  if (open) await open.db.from("member_invites").update({ status: "rejected", responded_at: new Date().toISOString() }).eq("id", open.invite.id)
  redirect(`/invite/${encodeURIComponent(token)}?done=rejected`)
}
