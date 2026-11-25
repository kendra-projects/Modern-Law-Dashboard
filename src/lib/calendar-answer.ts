// What Make's "Lead Intake Calendar" scenario answered (lib/calendar-guest.ts).
// It answers "added", "already" or "others" when it ran to its end. Anything
// else means Make didn't confirm a run: "Accepted" is Make's own reply when the
// scenario is off or its run is queued, and also (as the scenario was built in
// Nov 2026) when it ends without an answer because no event matched; a 5xx is
// a run that failed. So "Accepted" never proves the event is missing, and is
// tried again instead of being read as "not found". "none" is taken if the
// scenario ever answers it. No imports, so scripts/check-intake-fixes.mjs can
// test it.

export type CalendarGuestAnswer =
  | { result: "added" }
  | { result: "already" }
  | { result: "others" }
  | { result: "none" }
  | { result: "unconfirmed"; note: string }

const KNOWN = ["added", "already", "others", "none"] as const

export function readCalendarAnswer(status: number, text: string | null | undefined): CalendarGuestAnswer {
  const answer = (text ?? "").trim().slice(0, 200)
  const known = KNOWN.find((k) => k === answer)
  if (status >= 200 && status < 300 && known) return { result: known }
  return { result: "unconfirmed", note: `Make's calendar scenario didn't confirm it (${status} ${answer || "no answer"}).` }
}
