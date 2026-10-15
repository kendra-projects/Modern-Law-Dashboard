import "server-only"

import { timingSafeEqual } from "node:crypto"
import type { NextRequest } from "next/server"

/** The intake bot's routes sit under the public /api/intake, so each checks BOT_SECRET itself. */
export function botAllowed(request: NextRequest) {
  const secret = process.env.BOT_SECRET?.trim()
  if (!secret) return false
  const given = Buffer.from(request.headers.get("authorization") ?? "")
  const want = Buffer.from(`Bearer ${secret}`)
  return given.length === want.length && timingSafeEqual(given, want)
}
