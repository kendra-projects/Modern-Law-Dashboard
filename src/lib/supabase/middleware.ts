import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import type { Database } from "@/types/database"

// `/api/make-health` is reachable unauthenticated so a scheduler (Vercel Cron
// or any external cron) is not redirected to /login. The route handler itself
// is the gate: it requires CRON_SECRET, or a signed-in user.
const PUBLIC_ROUTES = ["/login", "/auth", "/api/make-health", "/api/intake"]

/**
 * Refreshes the Supabase session on every request and enforces route
 * protection. Unauthenticated users are redirected to /login; already
 * authenticated users are bounced away from /login.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getClaims() verifies the JWT signature locally against the project's
  // published ES256 key (JWKS, cached), and refreshes the session only when the
  // access token has expired. Unlike getUser() it doesn't make a round trip to
  // the auth server (in Tokyo) on every request, which was the single biggest
  // cost of each page load. Still a real signature check, not a blind
  // getSession() read.
  const { data } = await supabase.auth.getClaims()
  const user = data?.claims ?? null

  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_ROUTES.some((r) => pathname.startsWith(r))

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    // Back to the same page after signing in, query included (an email's
    // link to a lead's step, say).
    url.search = ""
    url.searchParams.set("redirectedFrom", pathname + request.nextUrl.search)
    return NextResponse.redirect(url)
  }

  if (user && pathname === "/login") {
    // The token can still verify locally after its session was revoked (e.g.
    // signed out on another device). The pages check with the auth server and
    // send such a user back here, so check the same way before bouncing to
    // "/", or the two redirect each other forever. A dead session is cleared
    // and the login form shows.
    const { data: live } = await supabase.auth.getUser()
    if (!live.user) {
      await supabase.auth.signOut({ scope: "local" })
      return response
    }
    const url = request.nextUrl.clone()
    url.pathname = "/"
    url.search = ""
    return NextResponse.redirect(url)
  }

  return response
}
