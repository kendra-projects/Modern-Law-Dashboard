import "server-only"

import { consultMethod } from "@/lib/client-messages"
import { CONFLICT_SEARCH, type ConflictSearch } from "@/lib/conflict-search"
import { conflictSearchLine } from "@/lib/intake-steps"
import { plain, slackEscape } from "@/lib/consult-post"
import { postToChannel, slackConfigured } from "@/lib/slack"
import { createAdminClient } from "@/lib/supabase/admin"
import type { IntakeLead } from "@/types/database"

// The heads-up advocates get in #clientadvocates when a client books a consult
// themselves (online or through Lexi): who, when, the case in brief and a link
// to the lead, so someone runs the conflict check. Zapier's "ML - Send
// Self-Schedule Slack Message" posts this today, so the dashboard's copy stays
// off until SELF_SCHEDULE_ALERT=on and advocates never get it twice. Once per lead.

export const CLIENT_ADVOCATES_CHANNEL = "C08B7R2BH2P"
export const selfScheduleAlertOn = () => process.env.SELF_SCHEDULE_ALERT === "on" && slackConfigured()

const TZ = "America/Phoenix"
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://modern-law-dashboard.vercel.app"

type Lead = Pick<
  IntakeLead,
  | "id"
  | "client_first"
  | "client_last"
  | "consult_datetime"
  | "consult_type"
  | "consulting_attorney"
  | "method"
  | "county"
  | "opposing_party_name"
  | "matter_type"
  | "description"
>

export function selfScheduleAlertText(
  lead: Lead,
  location: string | null,
  conflictSearch: string | null = null,
  conflictCleared = false
): string {
  const name = [lead.client_first, lead.client_last].filter(Boolean).join(" ") || "a new client"
  const consult = lead.consult_type === "LSS" ? "Limited Scope Strategy Session" : "Initial Consultation"
  const when = lead.consult_datetime
    ? new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(
        new Date(lead.consult_datetime)
      )
    : null
  const method = consultMethod(lead.method, location)
  const how = method === "in_person" ? "In person" : method === "phone" ? "Phone" : method === "zoom" ? "Zoom" : null
  const why = lead.description ? plain(lead.description) : null
  const field = (label: string, value: string | null) => (value ? `*${label}:* ${slackEscape(value)}` : null)
  return [
    `<!here> New self-scheduled ${consult} for ${slackEscape(name)}`,
    field("When", when && `${when} (Arizona time)`),
    field("Attorney", lead.consulting_attorney),
    field("How", how),
    field("County", lead.county),
    field("Opposing party", lead.opposing_party_name),
    field("Matter type", lead.matter_type),
    field("Why they booked", why && (why.length > 600 ? `${why.slice(0, 600)}…` : why)),
    field(
      "Conflict search",
      conflictSearch &&
        `${conflictSearch[0].toUpperCase()}${conflictSearch.slice(1)}.${conflictCleared ? " Cleared automatically." : " Details on the lead page."}`
    ),
    `<${SITE}/intake/${lead.id}|Open the lead in the dashboard>`,
    conflictCleared
      ? "Please assign the advocate, make sure the lead is qualified, and check the consulting attorney."
      : "Please run the conflict check, make sure the lead is qualified, and check the consulting attorney.",
  ]
    .filter(Boolean)
    .join("\n")
}

/** Post the alert for a lead that just came in. Does nothing when it is off or not self-scheduled. */
export async function sendSelfScheduleAlert(leadId: string): Promise<void> {
  const admin = createAdminClient()
  if (!admin || !selfScheduleAlertOn()) return

  const { data: lead } = await admin
    .from("intake_leads")
    .select("id, status, self_scheduled, conflict_status, client_first, client_last, consult_datetime, consult_type, consulting_attorney, method, county, opposing_party_name, matter_type, description")
    .eq("id", leadId)
    .maybeSingle()
  if (!lead || lead.self_scheduled !== true || ["canceled", "stopped", "failed"].includes(lead.status)) return

  const { data: sent } = await admin.from("intake_steps").select("id").eq("lead_id", leadId).eq("step_key", "slack_alert").maybeSingle()
  if (sent) return

  const [{ data: appt }, { data: search }] = await Promise.all([
    admin.from("appointments").select("location").eq("lead_id", leadId).order("datetime", { ascending: false }).limit(1).maybeSingle(),
    admin.from("intake_steps").select("detail").eq("lead_id", leadId).eq("step_key", CONFLICT_SEARCH).maybeSingle(),
  ])
  const found = search?.detail as ConflictSearch | null

  try {
    const posted = await postToChannel(
      CLIENT_ADVOCATES_CHANNEL,
      selfScheduleAlertText(lead, appt?.location ?? null, found ? conflictSearchLine(found) : null, lead.conflict_status === "clear")
    )
    await admin.from("intake_steps").insert({
      lead_id: leadId,
      step_key: "slack_alert",
      state: "done",
      detail: { action: "auto", ts: posted.ts, link: posted.link },
    })
  } catch (e) {
    // One row per lead and key: a later failure updates it.
    const error = e instanceof Error ? e.message : "Slack didn't take the alert."
    const { data: row } = await admin.from("intake_steps").select("id").eq("lead_id", leadId).eq("step_key", "slack_alert_failed").maybeSingle()
    if (row) await admin.from("intake_steps").update({ state: "failed", error, updated_at: new Date().toISOString() }).eq("id", row.id)
    else await admin.from("intake_steps").insert({ lead_id: leadId, step_key: "slack_alert_failed", state: "failed", error })
  }
}
