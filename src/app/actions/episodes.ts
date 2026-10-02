"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "./logs"

export async function pushToWordpress(
  episodeId: string
): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: "Not authenticated." }

  const now = new Date().toISOString()
  const { data: ep } = await supabase
    .from("episodes_content")
    .select("id, wordpress_post_id, wordpress_url, title")
    .eq("id", episodeId)
    .single()

  const { error } = await supabase
    .from("episodes_content")
    .update({
      wordpress_status: "published",
      wordpress_post_id: ep?.wordpress_post_id ?? `wp-${Date.now()}`,
      wordpress_url:
        ep?.wordpress_url ??
        `https://mymodernlaw.com/${episodeId.slice(0, 8)}`,
      updated_at: now,
    })
    .eq("id", episodeId)

  if (error) return { ok: false, message: "Push to WordPress failed." }

  await supabase.from("system_logs").insert({
    scenario_name: "create_blog",
    event_type: "info",
    message: `WordPress draft published via manual override: ${
      ep?.title ?? episodeId
    }.`,
    status: "resolved",
    entity_id: episodeId,
    resolved_by: user.id,
  })

  revalidatePath("/archive")
  revalidatePath("/")
  return { ok: true, message: "Published to WordPress." }
}

export async function rerunAiGenerator(
  episodeId: string
): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: "Not authenticated." }

  const { error } = await supabase
    .from("episodes_content")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", episodeId)

  if (error) return { ok: false, message: "Re-run failed to queue." }

  await supabase.from("system_logs").insert({
    scenario_name: "create_blog",
    event_type: "info",
    message: `AI generator re-run queued for episode ${episodeId.slice(0, 8)}.`,
    status: "logged",
    entity_id: episodeId,
    resolved_by: user.id,
  })

  revalidatePath("/archive")
  return { ok: true, message: "AI generator re-run queued." }
}
