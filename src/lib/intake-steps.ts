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
}

export function describeStep(s: Pick<IntakeStep, "step_key" | "state" | "detail">): string {
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
    case "final_signoff":
      return "Intake approved"
    default:
      return s.step_key.replace(/_/g, " ")
  }
}

export type StepCategory = "booking" | "clio" | "decision" | "system"

export function stepCategory(key: string): StepCategory {
  if (key.startsWith("acuity_")) return "booking"
  if (key.startsWith("clio_")) return "clio"
  if (key.startsWith("slack_") || key === "lexi_followups" || key === "conflict_check" || key === "advocate_assigned" || key === "final_signoff") return "decision"
  return "system"
}
