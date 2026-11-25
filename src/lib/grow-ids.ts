// Clio Grow matter ids. Clio's Grow API (api.clio.com/grow, lib/grow.ts) looks
// matters up by their number (72026832). A grow.clio.com/matters/... address
// copied from the browser carries a ULID instead (01M3D3YD8B410HXRPC7NJZM9FN),
// which the API answers with 404. A ULID's first 10 characters are the time it
// was made (milliseconds since 1970, in Crockford base 32), so a pasted link is
// matched to the client's matter made at that time (lib/grow-sync.ts,
// addGrowNoteTo). No imports, so scripts/check-intake-fixes.mjs can test it.

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

/** A Grow API matter id: digits only. */
export const isGrowNumber = (s: string) => /^\d+$/.test(s)

/** A ULID as Grow's web addresses use it (26 characters, Crockford base 32). */
export const isGrowUlid = (s: string) => /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i.test(s)

/** When the ULID was made, in ms since 1970; null when it isn't a ULID. */
export function ulidTime(ulid: string): number | null {
  if (!isGrowUlid(ulid)) return null
  let t = 0
  for (const ch of ulid.slice(0, 10).toUpperCase()) t = t * 32 + CROCKFORD.indexOf(ch)
  return t
}

/** How far a matter's created_at may be from its ULID's time and still count as that matter. */
export const ULID_MATCH_MS = 60_000

/**
 * The one matter a pasted ULID stands for: a matter whose own data carries the
 * ULID, else the one matter of this client made within ULID_MATCH_MS of the
 * ULID's time. Null when that isn't exactly one, so nothing is guessed.
 */
export function matchGrowUlid<M extends { id: string | number; created_at: string }>(ulid: string, all: M[], clients: M[]): M | null {
  const text = ulid.toUpperCase()
  const carries = all.filter((m) => JSON.stringify(m).toUpperCase().includes(text))
  if (carries.length === 1) return carries[0]
  const at = ulidTime(ulid)
  if (at == null) return null
  const near = clients.filter((m) => Math.abs(Date.parse(m.created_at) - at) <= ULID_MATCH_MS)
  return near.length === 1 ? near[0] : null
}

/** Grow answered 404 for a matter (or its notes): the matter was deleted or merged in Grow. */
export const growMatterGone = (message: string) => /^Clio Grow (?:GET|POST) \/matters\/[^/\s]+(?:\/notes)? failed \(404\)/.test(message)
