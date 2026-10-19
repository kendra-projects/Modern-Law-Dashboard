import type { IntakeStep } from "@/types/database"

// Plain-language wording for intake step rows, shared by the lead timeline and
// the Intake Activity log so the same event always reads the same way.

export type StepDetail = {
  by?: string
  action?: string
  display?: string
  advocate?: string
  decision?: string
  notes?: string[]
  result?: string
  matter_name?: string
  mode?: string
  done?: string[]
  waiting?: string[]
  failed?: string[]
  flags?: number
  hits?: { self?: boolean }[]
  searched?: string[]
  opposing_skipped?: string | null
  note?: string | null
  why?: string
  to?: string
  reason?: string
  scenario?: string
}

export function describeStep(s: Pick<IntakeStep, "step_key" | "state" | "detail">): string {
  // A failure staff dismissed from Intake Recovery still reads as the failure.
  if (s.state === "skipped") return `${describeStep({ ...s, state: "failed" })} (dismissed)`
  const d = (s.detail ?? {}) as StepDetail
  switch (s.step_key) {
    case "acuity_enrich":
      return "Booking details filled from Acuity"
    case "acuity_canceled":
      return "Booking canceled in Acuity"
    case "lexi_followups":
      return d.result === "auto"
        ? "Lexi booked it, so LexiDesk stopped the follow-ups itself"
        : d.result === "paused"
          ? "Lexi follow-ups paused"
          : "Lexi checked: no follow-ups pending"
    case "conflict_check":
      return d.decision === "clear"
        ? d.by === "Automatic"
          ? "Conflict check cleared automatically: nothing flagged in Clio"
          : "Conflict check cleared"
        : "Conflict found, lead stopped"
    case "conflict_reopened":
      return "Conflict check reopened"
    case "conflict_search":
      return `Conflict search: ${conflictSearchLine({ flags: d.flags ?? 0, hits: d.hits ?? [], searched: d.searched ?? ["Clio"], opposing_skipped: d.opposing_skipped ?? null })}`
    case "advocate_assigned":
      return d.by === "Automatic"
        ? `Assigned to ${d.advocate ?? "advocate"} automatically${d.why ? `: ${d.why}` : ""}`
        : `Assigned to ${d.advocate ?? "advocate"}`
    case "advocate_auto":
      return `Advocate not assigned yet: ${d.why ?? "nobody is free"}`
    case "slack_advocate_note":
      return (d as { skipped?: string }).skipped
        ? "Slack post already named the advocate"
        : `Advocate ${d.advocate ?? ""} added under the Slack post`.replace("  ", " ")
    case "slack_advocate_note_failed":
      return "Couldn't add the advocate under the Slack post"
    case "conflict_email":
      return s.state === "failed"
        ? `The conflict check email to ${d.to ?? "the team"} didn't go out`
        : `Conflict check emailed to ${d.to ?? "the team"}: ${d.reason === "match" ? `${d.flags ?? ""} ${(d.flags ?? 0) === 1 ? "match" : "matches"} to look at`.trim() : "no opposing party to search"}`
    case "clio_contact":
      return d.action === "created"
        ? "Clio contact created"
        : d.action === "detected"
          ? "Found in Clio: contact"
          : "Linked to existing Clio contact"
    case "clio_matter":
      return `${
        d.action === "created"
          ? "Clio matter created"
          : d.action === "detected"
            ? "Found in Clio: matter made by staff"
            : "Linked to existing Clio matter"
      }${d.display ? `: ${d.display}` : ""}`
    case "clio_opposing_party":
      return s.state === "done" ? "Opposing party added in Clio" : "Opposing party not linked"
    case "clio_create":
      return "Clio create failed"
    case "clio_text_sent":
      return "Confirmation text sent"
    case "clio_portal_sent":
      return d.action === "sent"
        ? "Portal invite sent from the dashboard"
        : d.action === "detected"
          ? "Found in Clio: client portal opened"
          : "Portal invite sent"
    case "clio_portal":
      return "Portal invite failed"
    case "clio_tasks":
      return s.state === "failed"
        ? "Follow-up tasks failed"
        : d.action === "detected"
          ? "Found in Clio: follow-up tasks"
          : "Follow-up tasks created in Clio"
    case "slack_posted":
      return d.action === "sent"
        ? "Posted in #initialconsultations from the dashboard"
        : d.action === "detected"
          ? "Found in Slack: posted in #initialconsultations"
          : "Posted in #initialconsultations"
    case "slack_post":
      return "Slack post failed"
    case "slack_alert":
      return "Self-schedule alert posted in #clientadvocates"
    case "slack_alert_failed":
      return "Self-schedule alert didn't go through"
    case "grow_note":
      return `Booking note added in Clio Grow${d.matter_name ? `: ${d.matter_name}` : ""}`
    case "grow_note_rescheduled":
      return "Reschedule note added in Clio Grow"
    case "grow_note_canceled":
      return "Cancellation note added in Clio Grow"
    case "grow_note_failed":
      return "Clio Grow note didn't go through"
    case "grow_match":
      return d.result === "hired"
        ? "Only a hired Clio Grow matter found: pick it or wait for the new one"
        : "Several Clio Grow matters fit: pick the right one"
    case "final_signoff":
      return d.by === "Automatic" ? "Intake approved automatically: every step was done" : "Intake approved"
    case "auto_intake": {
      const done = d.done ?? []
      const waiting = d.waiting ?? []
      const failed = d.failed ?? []
      if (d.mode === "log")
        return done.length
          ? `Test run: the automation would ${done.join(", ")}`
          : `Test run: nothing to do yet${waiting.length ? ` (waiting: ${waiting.join("; ")})` : ""}`
      return [
        done.length ? `Done automatically: ${done.join(", ")}` : "",
        failed.length ? `Didn't go through: ${failed.join("; ")}` : "",
        waiting.length ? `Waiting: ${waiting.join("; ")}` : "",
      ]
        .filter(Boolean)
        .join(". ")
    }
    case "make_error":
      return d.scenario === "Dashboard - Send email" ? "The email sender (Make) failed" : `${d.scenario ?? "A Make scenario"} failed in Make`
    case "auto_lock":
      return "Automatic intake running"
    case "bot_lexi":
      return s.state === "awaiting_human" ? "The bot left Lexi's follow-ups for staff" : "The bot couldn't pause Lexi's follow-ups"
    case "bot_text":
      return s.state === "awaiting_human" ? "The bot left the confirmation text for staff" : "The bot couldn't send the confirmation text"
    case "text_email":
      return s.state === "failed" ? `The "send the text by hand" email to ${d.to ?? "the team"} didn't go out` : `Emailed ${d.to ?? "the team"}: send the confirmation text by hand`
    case "matter_email":
      return s.state === "failed" ? `The "Clio matter needed" email to ${d.to ?? "the team"} didn't go out` : `Emailed ${d.to ?? "the team"}: still waiting for the matter from Clio Grow`
    case "advocate_email":
      return s.state === "failed" ? `The "pick an advocate" email to ${d.to ?? "the team"} didn't go out` : `Emailed ${d.to ?? "the team"}: no advocate was free`
    case "lexi_email":
      return s.state === "failed"
        ? `The Lexi follow-ups email to ${d.to ?? "the team"} didn't go out`
        : `Emailed ${d.to ?? "the team"}: the bot left the Lexi follow-ups for a person`
    case "bot_lexi_dry":
      return `Bot test run (Lexi): ${d.note ?? "would pause the follow-ups"}`
    case "bot_text_dry":
      return `Bot test run (text): ${d.note ?? "would send the confirmation text"}`
    default:
      return s.step_key.replace(/_/g, " ")
  }
}

/** One line for Slack and the activity log. */
export function conflictSearchLine(s: { flags: number; hits: { self?: boolean }[]; searched: string[]; opposing_skipped: string | null }) {
  const where = s.searched.join(" and ")
  const others = s.hits.filter((h) => !h.self).length
  const main = s.flags
    ? `${s.flags} ${s.flags === 1 ? "match" : "matches"} in ${where} to look at`
    : others
      ? `nothing flagged in ${where} (${others} other same-name ${others === 1 ? "record" : "records"})`
      : s.hits.length
        ? `nothing flagged in ${where} (only this consult's own records)`
        : `no matches in ${where}`
  return s.opposing_skipped && !s.opposing_skipped.startsWith("The booking names no") ? `${main}; opposing party not searched` : main
}

/**
 * A step's error as staff can read it. Clio's raw answers ("Clio GET
 * /api/v4/users failed (429) {...}") become a sentence that says what happened
 * and what to do; anything else is shown as it is. The raw text stays in the
 * row (and on hover) for whoever debugs it.
 */
export function readableError(raw: string | null | undefined): string {
  if (!raw) return ""
  // The intake bot's notes: Playwright's call log means "the page didn't do what it expected".
  if (/^The bot couldn't sign in to Clio: Clio's saved sign-in has run out/.test(raw))
    return "The bot's Clio sign-in has run out, so nothing was sent. Sign in again from the bot's Codespace (npm run clio-login); the bot picks it up on its next run. Until then, send the text by hand."
  if (/^The bot couldn't sign in to Clio/.test(raw))
    return "The bot couldn't sign in to Clio, so nothing was sent. It tries again on its next run (every hour), or send the text by hand."
  if (/^The bot couldn't (send the text|pause Lexi): .*(Timeout|locator|waiting for)/.test(raw))
    return `The bot couldn't finish on the ${/Lexi/.test(raw) ? "LexiDesk" : "Clio"} page (it timed out or the page looked different), so nothing was ${/Lexi/.test(raw) ? "paused" : "sent"}. It tries again within the hour, or do this step by hand.`
  // Make: the email sender's Gmail connection has lost its sign-in.
  if (/Failed to verify connection|Invalid refresh token|reauthorize the connection/i.test(raw))
    return "The Gmail connection in Make has expired, so emails (like the conflict check email) can't go out. Reconnect it in Make: Connections → the Gmail connection → Reauthorize."
  const m = raw.match(/^Clio (?:GET|POST|PATCH|PUT|DELETE) \S+ failed \((\d{3})\)\s*([\s\S]*)$/)
  if (!m) return raw
  const code = Number(m[1])
  let said = ""
  try {
    said = String(JSON.parse(m[2])?.error?.message ?? "")
  } catch {
    /* not JSON */
  }
  if (code === 429) return "Clio was busy (too many requests in one minute), so this didn't go through. Click Fix to try again; the dashboard also retries on its next run."
  if (code === 401) return "The Clio connection has expired. Reconnect Clio in Intake Settings, then click Fix."
  if (code === 403) return "Clio didn't allow this for the connected user. Check that user's permissions in Clio."
  if (code === 404) return "Clio couldn't find the record. It may have been deleted or merged in Clio."
  if (code >= 500) return "Clio had a problem on its side. Click Fix to try again in a few minutes."
  return `Clio didn't accept it${said ? `: ${said}` : ` (error ${code})`}.`
}

/** The lead-page step (lead page `?step=`) where a logged step is worked on. */
export function leadStepFor(stepKey: string): string | null {
  if (stepKey.startsWith("grow_")) return "grow"
  if (stepKey === "slack_alert" || stepKey === "slack_alert_failed" || stepKey.startsWith("acuity_") || stepKey.startsWith("auto_"))
    return "booked"
  if (stepKey.startsWith("slack_")) return "slack"
  if (stepKey.startsWith("bot_lexi")) return "lexi"
  if (stepKey.startsWith("bot_text")) return "text"
  const map: Record<string, string> = {
    lexi_followups: "lexi",
    lexi_email: "lexi",
    text_email: "text",
    matter_email: "clio",
    advocate_email: "advocate",
    conflict_check: "conflict",
    conflict_reopened: "conflict",
    conflict_search: "conflict",
    conflict_email: "conflict",
    advocate_assigned: "advocate",
    advocate_auto: "advocate",
    clio_create: "clio",
    clio_contact: "clio",
    clio_matter: "clio",
    clio_opposing_party: "clio",
    clio_portal: "portal",
    clio_portal_sent: "portal",
    clio_text_sent: "text",
    clio_tasks: "tasks",
    final_signoff: "signoff",
  }
  return map[stepKey] ?? null
}

export type StepCategory = "booking" | "clio" | "decision" | "system"

export function stepCategory(key: string): StepCategory {
  if (key.startsWith("acuity_")) return "booking"
  if (key.startsWith("clio_") || key.startsWith("grow_")) return "clio"
  if (key.startsWith("slack_") || key === "lexi_followups" || key === "lexi_email" || key === "text_email" || key === "matter_email" || key === "advocate_email" || key === "conflict_check" || key === "conflict_reopened" || key === "conflict_search" || key === "conflict_email" || key.startsWith("advocate_") || key === "final_signoff") return "decision"
  return "system"
}
