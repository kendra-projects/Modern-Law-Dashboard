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
      return d.result === "paused" ? "Lexi follow-ups paused" : "Lexi checked: no follow-ups pending"
    case "conflict_check":
      return d.decision === "clear" ? "Conflict check cleared" : "Conflict found, lead stopped"
    case "advocate_assigned":
      return `Assigned to ${d.advocate ?? "advocate"}`
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
    case "auto_lock":
      return "Automatic intake running"
    default:
      return s.step_key.replace(/_/g, " ")
  }
}

/** The lead-page step (lead page `?step=`) where a logged step is worked on. */
export function leadStepFor(stepKey: string): string | null {
  if (stepKey.startsWith("grow_")) return "grow"
  if (stepKey === "slack_alert" || stepKey === "slack_alert_failed" || stepKey.startsWith("acuity_") || stepKey.startsWith("auto_"))
    return "booked"
  if (stepKey.startsWith("slack_")) return "slack"
  const map: Record<string, string> = {
    lexi_followups: "lexi",
    conflict_check: "conflict",
    advocate_assigned: "advocate",
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
  if (key.startsWith("slack_") || key === "lexi_followups" || key === "conflict_check" || key === "advocate_assigned" || key === "final_signoff") return "decision"
  return "system"
}
