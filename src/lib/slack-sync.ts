import "server-only"

import { channelHistory, INITIAL_CONSULTS_CHANNEL, messageLink, slackConfigured } from "@/lib/slack"
import { createAdminClient } from "@/lib/supabase/admin"
import type { IntakeLead } from "@/types/database"

// Staff also post consults in #initialconsultations by hand. This finds those
// posts ("… Scheduled for First Last") so the Slack step shows done either way.
// Reads Slack only; writes our own steps table.

const DAY = 24 * 60 * 60 * 1000

type Lead = Pick<IntakeLead, "id" | "client_first" | "client_last" | "created_at">

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")

/** Ids of the leads a post was found for. */
export async function syncSlackPosts(leads: Lead[]): Promise<string[]> {
  const admin = createAdminClient()
  if (!admin || !slackConfigured() || !leads.length) return []

  const { data: logged } = await admin
    .from("intake_steps")
    .select("lead_id")
    .in(
      "lead_id",
      leads.map((l) => l.id)
    )
    .eq("step_key", "slack_posted")
    .eq("state", "done")
  const done = new Set((logged ?? []).map((s) => s.lead_id))
  const todo = leads.filter((l) => !done.has(l.id) && l.client_first && l.client_last)
  if (!todo.length) return []

  // Posts go up after the booking, so nothing older than the oldest lead matters.
  const oldest = Math.min(...todo.map((l) => new Date(l.created_at).getTime())) - DAY
  const posts = (await channelHistory(INITIAL_CONSULTS_CHANNEL, oldest / 1000)).map((p) => ({ ...p, norm: norm(p.text) }))

  const found: string[] = []
  for (const lead of todo) {
    const after = (new Date(lead.created_at).getTime() - DAY) / 1000
    const needle = norm(`scheduled for ${lead.client_first} ${lead.client_last}`).trim()
    // The oldest match is the announcement; later ones are replies or reposts.
    const post = posts
      .filter((p) => Number(p.ts) >= after && p.norm.includes(needle))
      .sort((a, b) => Number(a.ts) - Number(b.ts))[0]
    if (!post) continue
    await admin.from("intake_steps").insert({
      lead_id: lead.id,
      step_key: "slack_posted",
      state: "done",
      detail: { action: "detected", ts: post.ts, link: messageLink(INITIAL_CONSULTS_CHANNEL, post.ts) },
    })
    found.push(lead.id)
  }
  return found
}

/** The open leads of the last 30 days, checked in one read of the channel. */
export async function syncOpenLeadsFromSlack() {
  const admin = createAdminClient()
  if (!admin || !slackConfigured()) return { checked: 0, changed: 0 }
  const { data } = await admin
    .from("intake_leads")
    .select("id, client_first, client_last, created_at")
    .not("status", "in", "(canceled,stopped,failed)")
    .gte("created_at", new Date(Date.now() - 30 * DAY).toISOString())
  const leads = data ?? []
  return { checked: leads.length, changed: (await syncSlackPosts(leads)).length }
}
