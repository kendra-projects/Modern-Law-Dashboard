import "server-only"

import { fetchAcuityAppointment } from "@/lib/acuity"
import type { IntakeLead } from "@/types/database"

// Kendra's walkthrough step: open the consult on the attorney's Google calendar
// and add the client as a guest if they aren't one. Acuity puts the event on the
// attorney's own calendar (its calendar's first email), with the client's email in
// the description. The Make scenario "Lead Intake Calendar" finds that event and
// adds the guest. An event that already has other guests is left for staff, because
// rewriting its guest list could reset their answers. Off until
// CALENDAR_GUEST_WEBHOOK_URL and CALENDAR_GUEST_FROM are set; only bookings made from
// that time on are touched, so no older client gets a surprise invite.

export function calendarGuestOn(createdAt: string) {
  const from = process.env.CALENDAR_GUEST_FROM?.trim()
  return Boolean(process.env.CALENDAR_GUEST_WEBHOOK_URL?.trim() && from) && new Date(createdAt) >= new Date(from!)
}

type Lead = Pick<IntakeLead, "external_id" | "email" | "consult_datetime">

/** Add the client to the consult's event. "none": no such event; "others": it has other guests. */
export async function addCalendarGuest(lead: Lead): Promise<"added" | "already" | "others" | "none"> {
  const appt = await fetchAcuityAppointment(lead.external_id!)
  if (!appt?.calendarID) throw new Error("Couldn't read the Acuity appointment.")
  const auth = Buffer.from(`${process.env.ACUITY_USER_ID}:${process.env.ACUITY_API_KEY}`).toString("base64")
  const res = await fetch("https://acuityscheduling.com/api/v1/calendars", {
    headers: { Authorization: `Basic ${auth}` },
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Couldn't read Acuity's calendars (${res.status}).`)
  const calendars = (await res.json()) as { id: number; email?: string | null }[]
  const calendar = calendars.find((c) => c.id === appt.calendarID)?.email?.split(",")[0]?.trim()
  if (!calendar) throw new Error("Acuity's calendar has no email.")

  const at = new Date(lead.consult_datetime!).getTime()
  const hook = await fetch(process.env.CALENDAR_GUEST_WEBHOOK_URL!.trim(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret: process.env.INTAKE_WEBHOOK_SECRET ?? "",
      calendar,
      email: lead.email,
      timeMin: new Date(at - 60_000).toISOString(),
      timeMax: new Date(at + 60_000).toISOString(),
    }),
    cache: "no-store",
  })
  const answer = (await hook.text()).trim().slice(0, 200)
  if (!hook.ok) throw new Error(`Make's calendar scenario failed (${hook.status} ${answer}).`)
  return answer === "added" || answer === "already" || answer === "others" ? answer : "none"
}
