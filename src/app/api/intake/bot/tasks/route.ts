import { NextResponse, type NextRequest } from "next/server"
import { botTasks } from "@/lib/bot"
import { botAllowed } from "@/lib/bot-auth"

export const dynamic = "force-dynamic"

/** What the intake bot should do now (lib/bot.ts). The bot calls this with BOT_SECRET. */
export async function GET(request: NextRequest) {
  if (!botAllowed(request)) return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 })
  try {
    return NextResponse.json({ ok: true, ...(await botTasks()) })
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "Couldn't list the tasks." }, { status: 500 })
  }
}
