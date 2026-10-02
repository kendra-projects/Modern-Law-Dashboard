// The three follow-up tasks every consult gets (checklist step 11), with due
// dates counted in business days from the consult date. Weekends are skipped;
// the checklist does not skip holidays, so neither does this.

const TZ = "America/Phoenix"

export const FOLLOW_UPS = [
  { name: "Post Consultation follow up 1", businessDays: 1 },
  { name: "Post Consultation follow up 2", businessDays: 2 },
  { name: "Review Request", businessDays: 2 },
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
