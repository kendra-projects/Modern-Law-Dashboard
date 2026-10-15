import { NextResponse, type NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  enrichLeadFromAcuity,
  fetchAcuityAppointment,
  isConsultType,
  upsertAppointment,
} from "@/lib/acuity"
import { syncGrowForLead } from "@/lib/grow-sync"
import { runAutoIntake } from "@/lib/auto-intake"
import { sendSelfScheduleAlert } from "@/lib/self-schedule-alert"
import type { Json } from "@/types/database"

export const dynamic = "force-dynamic"
// The automatic intake steps (Clio, portal, Slack, tasks) run inside the request.
export const maxDuration = 60

/**
 * The booking note on the client's Clio Grow matter, right away when the
 * matter is already there. Capped at a few seconds so Acuity gets its answer
 * quickly; whatever doesn't finish, the regular sync picks up (it never posts
 * the same note twice).
 */
async function growNoteSoon(leadId: string) {
  await Promise.race([syncGrowForLead(leadId).catch(() => []), new Promise((r) => setTimeout(r, 8000))])
}

/**
 * Intake webhook — now Acuity-first.
 *
 * The client's booking hub is Acuity Scheduling. Every consult (whether booked by
 * LexiDesk via the Acuity API, self-scheduled, or entered by staff) becomes an
 * Acuity appointment, so one Acuity webhook catches them all. Acuity POSTs
 * form-encoded `action` + `id` (+ calendarID, appointmentTypeID) and nothing
 * else — the client, form answers etc. come from GET-ing the appointment, which
 * `enrichLeadFromAcuity` does once the API key is set.
 *
 * Auth: Acuity can't send a custom header, so the shared secret rides in the URL
 * as `?secret=` (matched against INTAKE_WEBHOOK_SECRET). The route is public so
 * Acuity isn't redirected to /login; the secret is the real gate.
 */
async function parseBody(req: NextRequest): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") ?? ""
  const out: Record<string, string> = {}
  try {
    if (ct.includes("application/json")) {
      const j = (await req.json()) as Record<string, unknown>
      for (const [k, v] of Object.entries(j)) out[k] = v == null ? "" : String(v)
    } else {
      const fd = await req.formData()
      fd.forEach((v, k) => (out[k] = String(v)))
    }
  } catch {
    /* leave out empty; caller handles missing id */
  }
  return out
}

export async function POST(req: NextRequest) {
  const secret = process.env.INTAKE_WEBHOOK_SECRET
  const provided =
    req.headers.get("x-intake-secret") ??
    new URL(req.url).searchParams.get("secret")
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json(
      { error: "server not configured (SUPABASE_SERVICE_ROLE_KEY missing)" },
      { status: 500 }
    )
  }

  const data = await parseBody(req)
  const action = (data.action || "scheduled").toLowerCase()
  const appointmentId = data.id || data.appointmentID || data.appointmentId
  if (!appointmentId) {
    return NextResponse.json({ error: "missing appointment id" }, { status: 400 })
  }

  // Look the appointment up once. Every appointment (consult or not) is
  // mirrored into `appointments` for the schedule/history page; only consults
  // become intake leads.
  const isCancel = action.includes("cancel")
  const appt = await fetchAcuityAppointment(appointmentId)

  // Has this appointment already produced a lead?
  const { data: existing } = await admin
    .from("intake_leads")
    .select("id")
    .eq("source", "acuity")
    .eq("external_id", appointmentId)
    .maybeSingle()

  if (appt) {
    try {
      await upsertAppointment(appt, { leadId: existing?.id ?? null, canceled: isCancel })
    } catch {
      /* the schedule mirror must never block lead handling */
    }
  }

  // Cancellation: mark the existing lead canceled; nothing to create if unseen.
  if (isCancel) {
    if (existing) {
      await admin.from("intake_leads").update({ status: "canceled" }).eq("id", existing.id)
      await admin.from("intake_steps").insert({
        lead_id: existing.id,
        step_key: "acuity_canceled",
        state: "done",
        error: "Appointment canceled in Acuity.",
      })
      await growNoteSoon(existing.id)
    }
    return NextResponse.json({ ok: true, id: existing?.id ?? null, canceled: true })
  }

  // Reschedule / change on a known lead: re-pull the latest details.
  if (existing) {
    try {
      await enrichLeadFromAcuity(existing.id, appointmentId, appt)
    } catch {
      /* best-effort */
    }
    await growNoteSoon(existing.id)
    // A change can be what the automation was waiting for (e.g. the attorney).
    await runAutoIntake(existing.id).catch(() => null)
    return NextResponse.json({ ok: true, id: existing.id, updated: true })
  }

  // Not a consultation (follow-up, internal meeting): schedule only, no lead.
  if (appt && !isConsultType(appt.type)) {
    return NextResponse.json({ ok: true, ignored: "not a consultation", type: appt.type ?? null })
  }

  // New consult → new lead. If the lookup failed (Acuity down), still record the
  // lead so nothing is lost; enrich retries on the next update.
  const { data: created, error } = await admin
    .from("intake_leads")
    .insert({
      source: "acuity",
      external_id: appointmentId,
      status: "received",
      raw_payload: { source: "acuity_webhook", ...data } as unknown as Json,
    })
    .select("id")
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (created?.id) {
    try {
      await enrichLeadFromAcuity(created.id, appointmentId, appt)
      if (appt) await upsertAppointment(appt, { leadId: created.id })
    } catch {
      /* best-effort */
    }
    // The #clientadvocates heads-up for a consult the client booked themselves.
    await sendSelfScheduleAlert(created.id).catch(() => {})
    await growNoteSoon(created.id)
    // Staff-booked consults arrive with the conflict check done and the
    // advocate named, so the rest of the intake can happen right away.
    await runAutoIntake(created.id).catch(() => null)
  }
  return NextResponse.json({ ok: true, id: created?.id ?? null })
}

export function GET() {
  return NextResponse.json({
    ok: true,
    hint: "Acuity webhook target. POST form-encoded action+id with ?secret=. Enrichment needs ACUITY_USER_ID / ACUITY_API_KEY.",
  })
}
