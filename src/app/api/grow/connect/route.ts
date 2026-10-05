import { NextResponse, type NextRequest } from "next/server"
import { randomBytes } from "crypto"
import { getRole, canSeeIntake } from "@/lib/role"
import { growAuthorizeUrl, growConfigured } from "@/lib/grow"

export const dynamic = "force-dynamic"

/** Starts the Clio Grow OAuth flow. Only intake/admin users may connect Grow. */
export async function GET(req: NextRequest) {
  const settings = new URL("/intake/settings", req.url)

  if (!canSeeIntake(await getRole())) {
    return NextResponse.redirect(new URL("/", req.url))
  }
  if (!growConfigured()) {
    settings.searchParams.set("grow", "not_configured")
    return NextResponse.redirect(settings)
  }

  // Random state, echoed back by Clio and checked in the callback (CSRF guard).
  const state = randomBytes(24).toString("hex")
  const res = NextResponse.redirect(growAuthorizeUrl(state))
  res.cookies.set("grow_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/grow",
    maxAge: 600,
  })
  return res
}
