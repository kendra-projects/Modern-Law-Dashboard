import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { WORKSPACE_COOKIE } from "@/lib/workspace"

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  // Local: end only this browser's session. The logins are shared, and a
  // global sign out would log everyone else out too.
  await supabase.auth.signOut({ scope: "local" })
  const res = NextResponse.redirect(new URL("/login", request.url), { status: 303 })
  res.cookies.delete(WORKSPACE_COOKIE)
  return res
}
