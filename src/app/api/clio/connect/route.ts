import { NextResponse, type NextRequest } from "next/server"
import { randomBytes } from "crypto"
import { getRole, canSeeIntake } from "@/lib/role"
import { clioAuthorizeUrl, clioConfigured } from "@/lib/clio"

export const dynamic = "force-dynamic"

/** Starts the Clio OAuth flow. Only intake/admin users may connect Clio. */
export async function GET(req: NextRequest) {
  const settings = new URL("/intake/settings", req.url)

  if (!canSeeIntake(await getRole())) {
    return NextResponse.redirect(new URL("/", req.url))
  }
  if (!clioConfigured()) {
    settings.searchParams.set("clio", "not_configured")
    return NextResponse.redirect(settings)
  }

  // Random state, echoed back by Clio and checked in the callback (CSRF guard).
  const state = randomBytes(24).toString("hex")
  const res = NextResponse.redirect(clioAuthorizeUrl(state))
  res.cookies.set("clio_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/clio",
    maxAge: 600,
  })
  return res
}
