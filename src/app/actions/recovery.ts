"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { MANUAL_UPLOAD, manualUploadNote } from "@/lib/manual-upload"

export type ActionResult = { ok: boolean; message: string }

// Optional: if the recovery scenario's webhook is configured, a manual retry
// pings it so the job runs immediately instead of waiting for the next scan.
async function dispatchRecovery(jobId?: string) {
  const url = process.env.RECOVERY_WEBHOOK_URL
  if (!url) return
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job_id: jobId || undefined, manual: true }),
    })
  } catch {
    // best-effort; the scheduled recovery scan will still pick it up
  }
}

export async function forceRetryJob(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: "Not authenticated." }

  const { data: job } = await supabase
    .from("retry_queue")
    .select("attempts, max_attempts, payload")
    .eq("id", id)
    .single()

  const currentPayload =
    typeof job?.payload === "object" && job?.payload !== null
      ? (job.payload as Record<string, unknown>)
      : {}
  const nextManualAttempts = (Number(currentPayload.manual_attempts) || 0) + 1
  const updatedPayload = { ...currentPayload, manual_attempts: nextManualAttempts }

  // Cap auto attempts at max_attempts (5) so manual retries don't push it to 6, 7, etc.
  const cappedAttempts = Math.min(job?.attempts ?? 0, job?.max_attempts ?? 5)

  const { error } = await supabase
    .from("retry_queue")
    .update({
      status: "retrying",
      next_retry_at: new Date().toISOString(),
      attempts: cappedAttempts,
      payload: updatedPayload,
    })
    .eq("id", id)

  if (error) return { ok: false, message: "Retry failed to dispatch." }

  await dispatchRecovery(id)
  revalidatePath("/recovery")
  revalidatePath("/")
  return {
    ok: true,
    message: `Manual retry dispatched (manual attempt #${nextManualAttempts}).`,
  }
}

export async function resolveJob(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: "Not authenticated." }

  const { error } = await supabase
    .from("retry_queue")
    .update({ status: "resolved", resolved_by: user.email ?? user.id })
    .eq("id", id)

  if (error) return { ok: false, message: "Could not resolve." }

  revalidatePath("/recovery")
  revalidatePath("/")
  return { ok: true, message: "Marked resolved." }
}

/**
 * The platform can't take this upload automatically (e.g. a Facebook video over
 * the Reel limit): take it off the queue and note that staff upload it by hand.
 */
export async function markManualUpload(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: "Not authenticated." }

  const { data: job } = await supabase.from("retry_queue").select("platform").eq("id", id).single()
  const { error } = await supabase
    .from("retry_queue")
    .update({ status: "resolved", resolved_by: MANUAL_UPLOAD, last_error: manualUploadNote(job?.platform ?? "") })
    .eq("id", id)

  if (error) return { ok: false, message: "Could not update it." }

  revalidatePath("/recovery")
  revalidatePath("/archive")
  revalidatePath("/")
  return { ok: true, message: "Off the queue. The Archive now says to upload it by hand." }
}

export async function retryAllDue(): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: "Not authenticated." }

  const { data, error } = await supabase
    .from("retry_queue")
    .update({ status: "retrying", next_retry_at: new Date().toISOString() })
    .in("status", ["failed", "needs_attention"])
    .select("id")

  if (error) return { ok: false, message: "Batch retry failed." }

  await dispatchRecovery()
  revalidatePath("/recovery")
  revalidatePath("/")
  return {
    ok: true,
    message: `Queued ${data?.length ?? 0} job(s) to run now.`,
  }
}
