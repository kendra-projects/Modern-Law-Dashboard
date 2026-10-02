"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export type ActionResult = { ok: boolean; message: string }

export async function forceRetryLog(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: "Not authenticated." }

  const { error } = await supabase
    .from("system_logs")
    .update({
      status: "resolved",
      resolved_by: user.id,
    })
    .eq("id", id)

  if (error) return { ok: false, message: "Retry failed to dispatch." }

  revalidatePath("/logs")
  revalidatePath("/")
  return { ok: true, message: "Force retry dispatched — step marked resolved." }
}

export async function retryAllFailed(): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: "Not authenticated." }

  const { data, error } = await supabase
    .from("system_logs")
    .update({ status: "resolved", resolved_by: user.id })
    .eq("status", "retrying")
    .select("id")

  if (error) return { ok: false, message: "Batch retry failed." }

  await supabase.from("system_logs").insert({
    scenario_name: "operations_dashboard",
    event_type: "info",
    message: `Manual batch retry dispatched for ${data?.length ?? 0} stuck step(s).`,
    status: "resolved",
    resolved_by: user.id,
  })

  revalidatePath("/logs")
  revalidatePath("/")
  return {
    ok: true,
    message: `Batch retry dispatched for ${data?.length ?? 0} step(s).`,
  }
}
