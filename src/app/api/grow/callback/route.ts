import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getRole, canSeeIntake } from "@/lib/role"
import { exchangeGrowCode } from "@/lib/grow"

export const dynamic = "force-dynamic"

/** Clio redirects here after the admin approves Grow. Swap the code for tokens. */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const settings = new URL("/intake/settings", req.url)
  const done = (status: string) => {
    settings.searchParams.set("grow", status)
    const res = NextResponse.redirect(settings)
    res.cookies.delete({ name: "grow_oauth_state", path: "/api/grow" })
    return res
  }

  if (!canSeeIntake(await getRole())) return done("forbidden")

  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const expected = req.cookies.get("grow_oauth_state")?.value
  if (url.searchParams.get("error")) return done("declined")
  if (!code || !state || !expected || state !== expected) return done("bad_state")

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  try {
    await exchangeGrowCode(code, user?.email ?? "unknown")
  } catch {
    return done("error")
  }
  return done("connected")
}
