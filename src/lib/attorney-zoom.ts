import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, IntakeLead } from "@/types/database"

// Each attorney meets every consult in their own Zoom room, a personal link
// that doesn't change, and staff bookings carry it in Acuity's location. A
// self-scheduled booking leaves the location blank (Acuity's default is Zoom),
// so its link comes from the attorney's recent bookings instead: the link used
// most in their last 10, which skips a one-off meeting and follows a new room
// once the attorney switches to it.

type Db = SupabaseClient<Database>

const RECENT = 10
const zoomIn = (loc: string | null) => loc?.match(/https?:\/\/\S*zoom\.us\/\S+/i)?.[0] ?? null

/** Zoom adds ?omn=<occurrence> to some copies of the same room link. */
function roomLink(link: string) {
  try {
    const url = new URL(link)
    url.searchParams.delete("omn")
    return url.toString()
  } catch {
    return link
  }
}

/** The attorney's usual Zoom room link, from their recent Acuity bookings. */
export async function attorneyZoomLink(db: Db, attorney: string | null): Promise<string | null> {
  if (!attorney) return null
  const { data } = await db
    .from("appointments")
    .select("location")
    .eq("attorney", attorney)
    .ilike("location", "%zoom.us%")
    .order("datetime", { ascending: false })
    .limit(RECENT)
  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    const link = zoomIn(row.location)
    if (link) counts.set(roomLink(link), (counts.get(roomLink(link)) ?? 0) + 1)
  }
  // Map keeps the newest first, so a tie goes to the more recent link.
  let best: string | null = null
  counts.forEach((n, link) => {
    if (!best || n > counts.get(best)!) best = link
  })
  return best
}

/**
 * The consult's location for the client messages: Acuity's own, or, for a Zoom
 * consult whose booking has no link, "ZOOM: <the attorney's room link>".
 */
export async function consultLocation(
  db: Db,
  lead: Pick<IntakeLead, "method" | "consulting_attorney">,
  location: string | null
): Promise<{ location: string | null; zoomFromAttorney: boolean }> {
  const blank = !location?.trim()
  const zoom = lead.method === "zoom" || (!lead.method && blank)
  if (!zoom || zoomIn(location)) return { location, zoomFromAttorney: false }
  const link = await attorneyZoomLink(db, lead.consulting_attorney)
  return link ? { location: `ZOOM: ${link}`, zoomFromAttorney: true } : { location, zoomFromAttorney: false }
}
