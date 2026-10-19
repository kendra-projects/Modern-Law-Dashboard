import { NextResponse, type NextRequest } from "next/server"
import { botTasks } from "@/lib/bot"
import { botAllowed } from "@/lib/bot-auth"
import { remindClioSignIn } from "@/lib/clio-signin-alert"
import { checkClioConnection } from "@/lib/team-alerts"
import { emailMatterWaits } from "@/lib/auto-intake"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

/** What the intake bot should do now (lib/bot.ts). The bot calls this with BOT_SECRET. */
export async function GET(request: NextRequest) {
  if (!botAllowed(request)) return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 })
  try {
    // The bot asks every hour, so this is also when the hourly alerts run: the
    // bot's Clio sign-in reminder, Clio's connection to the dashboard, and
    // bookings still waiting for their Clio Grow matter.
    const admin = createAdminClient()
    await Promise.all([
      remindClioSignIn().catch(() => false),
      admin ? checkClioConnection(admin).catch(() => false) : false,
      emailMatterWaits().catch(() => 0),
    ])
    return NextResponse.json({ ok: true, ...(await botTasks()) })
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "Couldn't list the tasks." }, { status: 500 })
  }
}
