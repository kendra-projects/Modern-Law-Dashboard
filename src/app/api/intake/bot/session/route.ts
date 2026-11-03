import { NextResponse, type NextRequest } from "next/server"
import { botAllowed } from "@/lib/bot-auth"
import { alertClioSignInExpired } from "@/lib/clio-signin-alert"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

type Look = "ok" | "expired" | "unknown"
const LOOKS: Look[] = ["ok", "expired", "unknown"]

/**
 * The bot's look at its Clio sign-in, every run while a Clio job is on:
 * { manage, grow }, each ok | expired | unknown. When it has ended the
 * developer gets the sign-in email at once (once per sign-in).
 */
export async function POST(request: NextRequest) {
  if (!botAllowed(request)) return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 })
  const body = (await request.json().catch(() => null)) as { manage?: string; grow?: string } | null
  const manage = body?.manage as Look | undefined
  const grow = body?.grow as Look | undefined
  if (!manage || !grow || !LOOKS.includes(manage) || !LOOKS.includes(grow)) {
    return NextResponse.json({ ok: false, message: "Expected manage and grow, each ok, expired or unknown." }, { status: 400 })
  }
  const alerted = manage === "expired" || grow === "expired" ? await alertClioSignInExpired().catch(() => false) : false
  return NextResponse.json({ ok: true, alerted })
}
