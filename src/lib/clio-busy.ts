// Clio allows 50 API requests a minute for the whole connection and answers
// 429 when that is used up, saying how long to wait: a Retry-After header and
// "Rate limit of 50 exceeded. Retry in 16 seconds." in the body. lib/clio.ts
// waits out a short wait and tries again; these helpers read the wait and word
// the error when a call isn't sent at all. No imports, so
// scripts/check-intake-fixes.mjs can test them.

/**
 * How long Clio asked us to wait, in ms: the Retry-After header (seconds or a
 * date), else "Retry in N seconds" in the body. Null when neither says.
 */
export function clioRetryAfterMs(header: string | null | undefined, body: string | null | undefined, now = Date.now()): number | null {
  const h = header?.trim()
  if (h) {
    if (/^\d+(\.\d+)?$/.test(h)) return Math.round(Number(h) * 1000)
    const at = Date.parse(h)
    if (!Number.isNaN(at)) return Math.max(0, at - now)
  }
  const m = body?.match(/retry in (\d+(?:\.\d+)?)\s*s/i)
  return m ? Math.round(Number(m[1]) * 1000) : null
}

/**
 * The error for a call this server held back because Clio had just said to
 * wait. Shaped like Clio's own 429 ("... failed (429) {...}"), so the steps
 * that retry on Clio's rate limit (lib/auto-intake.ts) and the readable
 * message on Intake Recovery treat it the same way.
 */
export function clioHeldBackMessage(method: string, path: string, waitMs: number): string {
  const seconds = Math.max(1, Math.ceil(waitMs / 1000))
  const body = JSON.stringify({
    error: { type: "RateLimited", message: `Not sent: Clio had just asked this server to wait. Retry in ${seconds} seconds.` },
  })
  return `Clio ${method} ${path.split("?")[0]} failed (429) ${body}`
}
