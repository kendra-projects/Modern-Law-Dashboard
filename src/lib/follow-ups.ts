// The three follow-up tasks every consult gets (checklist step 11), with due
// dates counted in business days from the consult date. Weekends are skipped;
// the checklist does not skip holidays, so neither does this. Kendra's rule
// (20 Oct 2026): the first follow-up is on the consult day, the second the
// next business day, and the review request with the last follow-up.

const TZ = "America/Phoenix"

/**
 * Whether the dashboard puts these tasks on the Clio Manage matter.
 * CLIO_FOLLOWUP_TASKS=off stops it: the firm works its follow-ups from the
 * Clio Grow checklist (Standard Consult Scheduled Checklist), where staff tick
 * them off. Of the 123 Manage tasks the dashboard made from 8 to 23 Oct, none
 * was ever completed and staff deleted many (checked 27 Oct 2026). The bot
 * sets the Grow tasks' dates instead (lib/bot.ts, the "grow" job).
 */
export const manageFollowUpsOn = () => process.env.CLIO_FOLLOWUP_TASKS?.trim().toLowerCase() !== "off"

/** A follow-up's due time as Clio Grow takes it: 5 pm Arizona on the due day, "MM/DD/YYYY 05:00 PM". */
export function growDue(ymd: string) {
  const [y, m, d] = ymd.split("-")
  return `${m}/${d}/${y} 05:00 PM`
}

export const FOLLOW_UPS = [
  { name: "Post Consultation follow up 1", businessDays: 0 },
  { name: "Post Consultation follow up 2", businessDays: 1 },
  { name: "Review Request", businessDays: 1 },
] as const

/** The consult's calendar date in Arizona, as YYYY-MM-DD. */
export function consultDay(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso)
  )
}

export function addBusinessDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T12:00:00Z`)
  let left = n
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    const w = d.getUTCDay()
    if (w !== 0 && w !== 6) left--
  }
  return d.toISOString().slice(0, 10)
}

/** Each task with its due date (YYYY-MM-DD) for a consult at this time. */
export function followUpPlan(consultIso: string) {
  const day = consultDay(consultIso)
  return FOLLOW_UPS.map((t) => ({ name: t.name, due: addBusinessDays(day, t.businessDays) }))
}
