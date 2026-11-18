// Slack channels the intake posts to. No secrets here, so the lead page's
// client components can name the channel too.

/** #initialconsultations, where every booked consult is announced to the attorney. */
export const INITIAL_CONSULTS_CHANNEL = "C43JU08KG"
/** #clientadvocates: self-schedule alerts, and the free discovery sessions' consult post. */
export const CLIENT_ADVOCATES_CHANNEL = "C08B7R2BH2P"

/** Acuity's "Free Discovery Session with Linda/Shane…" bookings. */
export const isDiscoveryType = (type: string | null | undefined) => /discovery session/i.test(type ?? "")

export type ConsultChannel = { id: string; name: string }

/** Where a booking's consult post goes: discovery sessions to #clientadvocates, every other consult to #initialconsultations. */
export function consultChannel(type: string | null | undefined): ConsultChannel {
  return isDiscoveryType(type)
    ? { id: CLIENT_ADVOCATES_CHANNEL, name: "#clientadvocates" }
    : { id: INITIAL_CONSULTS_CHANNEL, name: "#initialconsultations" }
}

/** A channel's name from its id, for a step logged with one ("#initialconsultations" when unknown). */
export const channelName = (id: string | null | undefined) =>
  id === CLIENT_ADVOCATES_CHANNEL ? "#clientadvocates" : "#initialconsultations"
