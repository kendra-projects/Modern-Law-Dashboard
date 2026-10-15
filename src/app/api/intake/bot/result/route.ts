import { NextResponse, type NextRequest } from "next/server"
import { revalidatePath } from "next/cache"
import { recordBotResult, type BotOutcome } from "@/lib/bot"
import { botAllowed } from "@/lib/bot-auth"

export const dynamic = "force-dynamic"

const OUTCOMES: BotOutcome[] = ["paused", "none", "sent", "dry", "needs_staff", "failed"]

/** The intake bot reports one lead: { lead_id, kind: "lexi" | "text", outcome, note }. */
export async function POST(request: NextRequest) {
  if (!botAllowed(request)) return NextResponse.json({ ok: false, message: "Unauthorized." }, { status: 401 })
  const body = (await request.json().catch(() => null)) as { lead_id?: string; kind?: string; outcome?: string; note?: string } | null
  if (
    !body?.lead_id ||
    (body.kind !== "lexi" && body.kind !== "text") ||
    !OUTCOMES.includes(body.outcome as BotOutcome) ||
    // Lexi is paused or had nothing pending; a text is sent.
    (body.kind === "lexi" && body.outcome === "sent") ||
    (body.kind === "text" && (body.outcome === "paused" || body.outcome === "none"))
  ) {
    return NextResponse.json({ ok: false, message: "Expected lead_id, kind (lexi|text) and a matching outcome." }, { status: 400 })
  }
  try {
    const r = await recordBotResult({ lead_id: body.lead_id, kind: body.kind, outcome: body.outcome as BotOutcome, note: body.note ?? null })
    revalidatePath(`/intake/${body.lead_id}`)
    if (r.approved) revalidatePath("/intake")
    return NextResponse.json({ ok: true, ...r })
  } catch (e) {
    return NextResponse.json({ ok: false, message: e instanceof Error ? e.message : "Couldn't record it." }, { status: 500 })
  }
}
