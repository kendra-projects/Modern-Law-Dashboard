import { NextResponse, type NextRequest } from "next/server"
import { revalidatePath } from "next/cache"
import { recordBotResult, type BotKind, type BotOutcome } from "@/lib/bot"
import { botAllowed } from "@/lib/bot-auth"

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

// Each job's outcomes: Lexi is paused or had nothing pending; a text is sent;
// the Grow matter is done; a portal is opened (sent) or was already there (none).
const OUTCOMES: Record<BotKind, BotOutcome[]> = {
  lexi: ["paused", "none", "dry", "needs_staff", "failed"],
  text: ["sent", "dry", "needs_staff", "failed"],
  grow: ["done", "dry", "needs_staff", "failed"],
  portal: ["sent", "none", "dry", "needs_staff", "failed"],
}

/** The intake bot reports one lead: { lead_id, kind, outcome, note, sig? }. */
export async function POST(request: NextRequest) {
  if (!botAllowed(request)) return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 })
  const body = (await request.json().catch(() => null)) as { lead_id?: string; kind?: string; outcome?: string; note?: string; sig?: string } | null
  const kind = body?.kind as BotKind | undefined
  if (!body?.lead_id || !kind || !(kind in OUTCOMES) || !OUTCOMES[kind].includes(body.outcome as BotOutcome)) {
    return NextResponse.json({ ok: false, message: "Expected lead_id, kind (lexi|text|grow|portal) and a matching outcome." }, { status: 400 })
  }
  try {
    const r = await recordBotResult({ lead_id: body.lead_id, kind, outcome: body.outcome as BotOutcome, note: body.note ?? null, sig: body.sig ?? null })
    revalidatePath(`/intake/${body.lead_id}`)
    if (r.approved) revalidatePath("/intake")
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "Couldn't record it." }, { status: 500 })
  }
}
