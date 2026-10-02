import "server-only"

import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import type { Role } from "@/types/database"

/**
 * The signed-in user, verified with the auth server. Wrapped in React `cache`
 * so one page render (layouts + page + role checks) asks only once instead of
 * three or four times.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
})

/**
 * The signed-in user's role, from public.profiles.
 * Decides which section of the dashboard they see:
 *   content = existing content pages · intake = consultation-intake pages · admin = both.
 * Defaults to the least-privilege 'content' when no profile row exists.
 */
export const getRole = cache(async (): Promise<Role> => {
  const user = await getCurrentUser()
  if (!user) return "content"
  const supabase = await createClient()

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()

  return data?.role ?? "content"
})

export function canSeeIntake(role: Role) {
  return role === "intake" || role === "admin"
}
export function canSeeContent(role: Role) {
  return role === "content" || role === "admin"
}
