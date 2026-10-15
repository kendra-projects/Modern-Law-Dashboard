"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { WORKSPACE_COOKIE } from "@/lib/workspace"

export async function signIn(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const email = String(formData.get("email") || "").trim()
  const password = String(formData.get("password") || "")
  const redirectTo = String(formData.get("redirectTo") || "/") || "/"

  if (!email || !password) {
    return { error: "Please enter your email and password." }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: "Invalid credentials. Please try again." }
  }

  // Forget the admin's last workspace so every login starts at the chooser.
  cookies().delete(WORKSPACE_COOKIE)

  // Only a page of this site ("//host" would leave it).
  redirect(redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : "/")
}
