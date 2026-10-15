import "server-only"

// Slack Web API for the intake bot ("Modern Law Intake" in modernlaw.slack.com).
// The bot token is SLACK_BOT_TOKEN; scopes: chat:write, users:read(.email),
// channels:read/history, groups:read, pins:read.

const API = "https://slack.com/api"
const WORKSPACE = "https://modernlaw.slack.com"

/** #initialconsultations, where every booked consult is announced to the attorney. */
export const INITIAL_CONSULTS_CHANNEL = "C43JU08KG"

export const slackConfigured = () => Boolean(process.env.SLACK_BOT_TOKEN)

/** Link to a message, built the way Slack's own "Copy link" builds it. */
export const messageLink = (channel: string, ts: string) => `${WORKSPACE}/archives/${channel}/p${ts.replace(".", "")}`

async function slack<T>(method: string, params: Record<string, string | number | undefined>): Promise<T> {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) throw new Error("Slack isn't connected (SLACK_BOT_TOKEN is missing).")
  const body = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined) body.set(k, String(v))
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`Slack ${method}: ${data.error ?? res.status}`)
  return data as T
}

type SlackUser = {
  id: string
  deleted?: boolean
  is_bot?: boolean
  real_name?: string
  profile?: { real_name?: string; status_text?: string; status_emoji?: string; status_expiration?: number }
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

/**
 * The Slack users for people named as Clio/Acuity have them. Exact full name
 * first, then first + last name, then first name plus any of their surnames
 * ("Eilen Castellano" for "Eilen Castellano Tatis"). A name that fits nobody,
 * or more than one person, is left out.
 */
async function slackUsers(names: string[]): Promise<Record<string, SlackUser>> {
  const users: SlackUser[] = []
  let cursor: string | undefined
  do {
    const r = await slack<{ members: SlackUser[]; response_metadata?: { next_cursor?: string } }>("users.list", { limit: 200, cursor })
    users.push(...r.members.filter((u) => !u.deleted && !u.is_bot))
    cursor = r.response_metadata?.next_cursor || undefined
  } while (cursor)

  const words = (u: SlackUser) => norm(u.profile?.real_name || u.real_name || "").split(" ")
  const out: Record<string, SlackUser> = {}
  for (const name of names) {
    const w = norm(name).split(" ")
    const tries: ((u: string[]) => boolean)[] = [
      (u) => u.join(" ") === w.join(" "),
      (u) => u[0] === w[0] && u[u.length - 1] === w[w.length - 1],
      (u) => u[0] === w[0] && w.includes(u[u.length - 1]),
    ]
    for (const fits of tries) {
      const hits = users.filter((u) => fits(words(u)))
      if (hits.length === 1) {
        out[name] = hits[0]
        break
      }
    }
  }
  return out
}

/** Slack user ids for people named as Clio/Acuity have them (see slackUsers). */
export async function slackUserIds(names: string[]): Promise<Record<string, string>> {
  const users = await slackUsers(names)
  return Object.fromEntries(Object.entries(users).map(([name, u]) => [name, u.id]))
}

/**
 * The status each person has set in Slack ("Out of Office", say), with when it
 * clears (unix seconds, 0 for never). Someone with no status, or not found in
 * Slack, is left out.
 */
export async function slackStatuses(names: string[]): Promise<Record<string, { text: string; expires: number }>> {
  const users = await slackUsers(names)
  const out: Record<string, { text: string; expires: number }> = {}
  for (const [name, u] of Object.entries(users)) {
    const text = u.profile?.status_text?.trim()
    if (text) out[name] = { text, expires: u.profile?.status_expiration ?? 0 }
  }
  return out
}

/** Post as the bot. Returns the message's ts and a link to it. */
export async function postToChannel(channel: string, text: string) {
  const r = await slack<{ ts: string; channel: string }>("chat.postMessage", {
    channel,
    text,
    unfurl_links: "false",
    unfurl_media: "false",
  })
  return { ts: r.ts, channel: r.channel, link: messageLink(r.channel, r.ts) }
}

/** A channel's messages since `oldest` (unix seconds), newest first, up to 1000. */
export async function channelHistory(channel: string, oldest: number) {
  const out: { ts: string; text: string }[] = []
  let cursor: string | undefined
  do {
    const r = await slack<{ messages: { ts: string; text?: string }[]; response_metadata?: { next_cursor?: string } }>(
      "conversations.history",
      { channel, oldest: oldest.toFixed(6), limit: 200, cursor }
    )
    out.push(...r.messages.map((m) => ({ ts: m.ts, text: m.text ?? "" })))
    cursor = r.response_metadata?.next_cursor || undefined
  } while (cursor && out.length < 1000)
  return out
}
