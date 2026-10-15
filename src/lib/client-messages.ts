import type { IntakeLead } from "@/types/database"
import { ADVOCATE_CLIO_NAMES } from "@/lib/intake"

// The two messages every consult gets once it is in Clio (checklist steps 8
// and 9): the confirmation text and the client portal invite. Clio Texting has
// no API, so the dashboard writes the text and staff send it from the matter.

const TZ = "America/Phoenix"

export type ConsultMethod = NonNullable<IntakeLead["method"]>

/** The lead's method, or read from Acuity's location label ("ZOOM: …", "PHONE APPT ONLY: …"). */
export function consultMethod(method: IntakeLead["method"], location: string | null): ConsultMethod | null {
  if (method) return method
  const loc = (location ?? "").trim().toUpperCase()
  if (loc.startsWith("ZOOM")) return "zoom"
  if (loc.startsWith("PHONE")) return "phone"
  return null
}

const zoomLink = (loc: string | null) => loc?.match(/https?:\/\/\S*zoom\.us\/\S+/i)?.[0] ?? null
const phoneNumber = (loc: string | null) => loc?.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/)?.[0] ?? null

/**
 * The confirmation text, in the firm's wording. Returns what is still missing
 * instead of a half-filled message, so nothing goes out with a blank in it.
 */
export function confirmationText(x: {
  firstName: string | null
  advocate: string | null
  datetime: string | null
  method: ConsultMethod | null
  location: string | null
  officeAddress: string | null
}): { text: string | null; missing: string[] } {
  const missing: string[] = []
  if (!x.firstName) missing.push("client first name")
  if (!x.advocate) missing.push("advocate")
  if (!x.datetime) missing.push("consult time")

  let via: string | null = null
  let detail: string | null = null
  if (!x.method) missing.push("consult method")
  else if (x.method === "zoom") {
    via = "via Zoom"
    const link = zoomLink(x.location)
    if (link) detail = `Zoom link: ${link}`
    else missing.push("Zoom link")
  } else if (x.method === "phone") {
    via = "by phone"
    const phone = phoneNumber(x.location)
    if (phone) detail = `Phone: ${phone}`
    else missing.push("phone number")
  } else {
    via = "in person"
    if (x.officeAddress) detail = `Address: ${x.officeAddress}`
    else missing.push("office")
  }

  if (missing.length) return { text: null, missing }

  // A name typed all lowercase ("sarah") reads as "Sarah"; any other casing is kept.
  const first = x.firstName!.trim()
  const name = first === first.toLowerCase() ? first.replace(/(^|[\s'-])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase()) : first
  const when = new Date(x.datetime!)
  const date = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric" }).format(when)
  const time = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(when)
  return {
    text:
      `Hi ${name}! This is ${x.advocate} with Modern Law, we look forward to seeing you on ${date} at ${time} ${via}.\n\n` +
      `${detail}\n\nPlease reply here with any questions.`,
    missing,
  }
}

export const PORTAL_SUBJECT = "Your Modern Law client portal"

/**
 * The portal welcome message, word for word from the invite pinned in Slack's
 * #clientadvocates (2026-06-29), with Slack's link and bold markup turned into
 * plain text for Clio.
 */
export function portalInviteText(firstName: string | null) {
  return [
    `Hi ${firstName?.trim() || "there"},`,
    "Thanks again for scheduling a consultation with us! We've set up a secure client portal for you to make communication and document sharing easy and safe. The portal includes a built-in scanner, so you can upload documents directly from your phone or computer — no extra apps or email attachments needed.",
    "Through the portal, you’ll be able to send and receive messages and documents securely, and you’ll always have 24/7 access to your client file.",
    "Getting Started Guide: https://www.clio.com/wp-content/uploads/2024/04/Clio-for-Clients-2024-Brochure.pdf",
    "Please note that attorneys will not review any documents you upload until your scheduled appointment. This helps protect your privacy and ensures your information is reviewed in the proper context during your meeting.",
    "If you have any questions or run into any issues, please let us know — we’re happy to help!",
  ].join("\n\n")
}

/**
 * Who goes on the client portal: exactly the client, the assigned advocate and
 * the consulting attorney. Never Billing Department or Caitlin.
 */
export function portalMembers(lead: Pick<IntakeLead, "client_first" | "client_last" | "assigned_advocate" | "consulting_attorney">) {
  return {
    client: [lead.client_first, lead.client_last].filter(Boolean).join(" ") || null,
    advocate: lead.assigned_advocate ? ADVOCATE_CLIO_NAMES[lead.assigned_advocate] ?? lead.assigned_advocate : null,
    attorney: lead.consulting_attorney,
  }
}
