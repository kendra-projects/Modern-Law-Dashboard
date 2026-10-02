"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "./logs"

export async function manualSync(): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: "Not authenticated." }

  await supabase.from("system_logs").insert({
    scenario_name: "operations_dashboard",
    event_type: "info",
    message: "Manual sync triggered from Overview toolbar.",
    status: "resolved",
    resolved_by: user.id,
  })

  revalidatePath("/")
  revalidatePath("/logs")
  return { ok: true, message: "Manual sync triggered." }
}

export interface RegisterUploadInput {
  fileName: string
  fileHash: string
  showName: string
  sizeBytes: number
  /** Actual object path used for the Storage upload (bucket-relative). The DB
   * file_url must match this exactly so the scenario can sign + download it. */
  storagePath?: string
}

// NOTE: the dashboard no longer POSTs to Make. The Make content pipeline is
// triggered by Supabase itself — a Database Webhook on INSERT into
// episodes_content fires the scenario (fully decoupled: the app just writes to
// the DB; Supabase, on commit, notifies Make). See the Modern Law "Supabase
// trigger" scenario + the retry_queue recovery flow.

/**
 * Registers a manually uploaded media file. Idempotent on file_hash — a repeat
 * upload of the same content is detected and skipped (no duplicate intake).
 */
export async function registerUpload(
  input: RegisterUploadInput
): Promise<ActionResult & { duplicate?: boolean }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: "Not authenticated." }

  // Idempotency check on content hash
  const { data: existing } = await supabase
    .from("intake_transcripts")
    .select("id, file_name")
    .eq("file_hash", input.fileHash)
    .maybeSingle()

  if (existing) {
    await supabase.from("system_logs").insert({
      scenario_name: "manual_upload",
      event_type: "warning",
      message: `Duplicate upload skipped (idempotency): ${input.fileName}.`,
      details: { file_hash: input.fileHash },
      status: "resolved",
      resolved_by: user.id,
    })
    revalidatePath("/")
    return {
      ok: true,
      duplicate: true,
      message: `Already ingested — duplicate of "${existing.file_name}" skipped.`,
    }
  }

  const storagePath = input.storagePath ?? `podcast/${input.fileName}`
  const { data: intake, error } = await supabase
    .from("intake_transcripts")
    .insert({
      source_type: "manual_upload",
      file_name: input.fileName,
      file_hash: input.fileHash,
      file_url: `media/${storagePath}`,
      status: "pending",
    })
    .select("id")
    .single()

  if (error) return { ok: false, message: "Upload registration failed." }

  const { data: episode } = await supabase
    .from("episodes_content")
    .insert({
      intake_id: intake.id,
      title: input.fileName.replace(/\.[^.]+$/, ""),
      show_name: input.showName,
      confidence_score: 0,
    })
    .select("id")
    .single()

  // No app-side trigger: the episodes_content INSERT above is what fires the
  // Make pipeline, via a Supabase Database Webhook (Supabase → Make on commit).
  void episode

  await supabase.from("system_logs").insert({
    scenario_name: "manual_upload",
    event_type: "info",
    message: `New media ingested: ${input.fileName} (${input.showName}).`,
    details: { file_hash: input.fileHash, bytes: input.sizeBytes },
    status: "logged",
    entity_id: intake.id,
    resolved_by: user.id,
  })

  revalidatePath("/")
  revalidatePath("/archive")
  revalidatePath("/logs")
  return { ok: true, message: `Ingested "${input.fileName}" — queued for AI.` }
}
