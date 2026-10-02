import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { syncMakeHealth } from "@/lib/make-health"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Pulls failed Make.com executions into `system_logs` so they surface on the
 * dashboard's Activity & Logs page instead of only in the client's inbox.
 *
 * Two callers are allowed, because this runs both unattended and on demand:
 *  - a scheduler (Vercel Cron, or any external cron) presenting CRON_SECRET
 *  - a signed-in dashboard user (the app pings this while someone is watching)
 *
 * This path is listed in the middleware's PUBLIC_ROUTES so an unauthenticated
 * scheduler is not bounced to /login — which is exactly why the secret check
 * below is the real gate.
 */
type Caller =
  | { kind: "scheduler" }
  | { kind: "dashboard"; client: Awaited<ReturnType<typeof createClient>> }
  | null

async function authorize(request: NextRequest): Promise<Caller> {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get("authorization") ?? ""
  const presented = auth.startsWith("Bearer ") ? auth.slice(7).trim() : ""

  // Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically.
  if (secret && presented && presented === secret) return { kind: "scheduler" }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // A signed-in user can write system_logs under normal RLS, so hand the
  // session client to the sync — no service_role key needed for this path.
  if (user) return { kind: "dashboard", client: supabase }

  return null
}

async function run(request: NextRequest) {
  const caller = await authorize(request)
  if (!caller) {
    return NextResponse.json(
      { ok: false, message: "Unauthorized." },
      { status: 401 }
    )
  }

  const params = request.nextUrl.searchParams
  const hours = Number(params.get("hours"))
  const result = await syncMakeHealth({
    lookbackHours: Number.isFinite(hours) && hours > 0 ? hours : undefined,
    dryRun: params.get("dryRun") === "1",
    client: caller.kind === "dashboard" ? caller.client : null,
  })

  return NextResponse.json(
    { caller: caller.kind, ...result },
    { status: result.ok ? 200 : 500 }
  )
}

export async function GET(request: NextRequest) {
  return run(request)
}

export async function POST(request: NextRequest) {
  return run(request)
}
