import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

// Clio Grow (the Clio Platform API) OAuth + API client.
//
// Grow has its own API, separate from Clio Manage's, with its own developer app
// (developers.api.clio.com) and its own approval, so it gets its own firm-wide
// connection, kept in integration_tokens as "clio_grow". The dashboard only
// reads contacts and matters and adds matter notes; Grow's API can't edit a
// matter anyway. Access tokens last 24 hours, and every refresh hands back a new
// refresh token and revokes the old one, so the new one is saved each time.
// Everything is inert until GROW_CLIENT_ID / GROW_CLIENT_SECRET are set.

const AUTH_BASE = "https://auth.api.clio.com"
const API_BASE = "https://api.clio.com/grow"
const PROVIDER = "clio_grow"
const REFRESH_EARLY_MS = 60 * 60 * 1000
const SCOPES = ["grow_contact_read", "grow_matter_read", "grow_matter_note_read", "grow_matter_note_write", "grow_user_read"]

// Notes start with the bookings that came in after Grow was connected (8 Oct
// 2026). Older leads are left alone, so Grow isn't filled with past consults.
export const GROW_NOTES_FROM = "2026-10-08T08:40:00Z"
export const growNotesApply = (leadCreatedAt: string) => Date.parse(leadCreatedAt) >= Date.parse(GROW_NOTES_FROM)

export const GROW_APP = "https://grow.clio.com"
export const growMatterUrl = (id: string | number) => `${GROW_APP}/matters/${id}`

export const GROW_REDIRECT_URI =
  process.env.GROW_REDIRECT_URI ?? "https://modern-law-dashboard.vercel.app/api/grow/callback"

export function growConfigured() {
  return Boolean(process.env.GROW_CLIENT_ID && process.env.GROW_CLIENT_SECRET)
}

export function growAuthorizeUrl(state: string) {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: process.env.GROW_CLIENT_ID ?? "",
    redirect_uri: GROW_REDIRECT_URI,
    scope: SCOPES.join(" "),
    state,
  })
  return `${AUTH_BASE}/oauth/authorize?${p}`
}

type TokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in?: number
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${AUTH_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GROW_CLIENT_ID ?? "",
      client_secret: process.env.GROW_CLIENT_SECRET ?? "",
      ...params,
    }),
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Clio Grow token request failed (${res.status})`)
  return (await res.json()) as TokenResponse
}

async function saveTokens(t: TokenResponse, extra: { account_name?: string; connected_by?: string } = {}) {
  const admin = createAdminClient()
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing")
  const row: Record<string, unknown> = {
    provider: PROVIDER,
    access_token: t.access_token,
    expires_at: t.expires_in ? new Date(Date.now() + t.expires_in * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
    ...extra,
  }
  if (t.refresh_token) row.refresh_token = t.refresh_token
  const { error } = await admin
    .from("integration_tokens")
    .upsert(row as never, { onConflict: "provider" })
  if (error) throw new Error(error.message)
}

async function readTokens() {
  const admin = createAdminClient()
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing")
  const { data } = await admin
    .from("integration_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("provider", PROVIDER)
    .maybeSingle()
  return data
}

/** OAuth callback: swap the one-time code for tokens and store them. */
export async function exchangeGrowCode(code: string, connectedBy: string) {
  const t = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: GROW_REDIRECT_URI,
  })
  await saveTokens(t, { connected_by: connectedBy })
  // Which Grow user the connection acts as: every note is written as them.
  try {
    const me = await growFetch<{ data: { name?: string; first_name?: string; last_name?: string; email?: string } }>(
      "/users/who_am_i"
    )
    const name = [me.data.name ?? [me.data.first_name, me.data.last_name].filter(Boolean).join(" "), me.data.email]
      .filter(Boolean)
      .join(" · ")
    if (name) {
      const admin = createAdminClient()
      await admin?.from("integration_tokens").update({ account_name: name } as never).eq("provider", PROVIDER)
    }
  } catch {
    /* status is cosmetic; the connection itself is saved */
  }
}

/** A valid access token, refreshed when it has less than an hour left. */
async function getAccessToken(): Promise<string> {
  const data = await readTokens()
  if (!data) throw new Error("Clio Grow is not connected")

  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0
  if (data.refresh_token && expiresAt - Date.now() < REFRESH_EARLY_MS) {
    try {
      const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: data.refresh_token })
      await saveTokens(t)
      return t.access_token
    } catch (e) {
      // A refresh token works once. If another request refreshed at the same
      // moment, ours was just revoked: use the token that request saved.
      const now = await readTokens()
      if (now && now.access_token !== data.access_token) return now.access_token
      throw e
    }
  }
  return data.access_token
}

/** GET/POST against the Clio Grow API (paths like "/matters"). */
export async function growFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken()
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  })
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 300)
    throw new Error(`Clio Grow ${init.method ?? "GET"} ${path.split("?")[0]} failed (${res.status}) ${body}`)
  }
  return (await res.json()) as T
}

/** Safe-to-render connection status (no token values). */
export async function growStatus() {
  const admin = createAdminClient()
  if (!admin) return { connected: false as const }
  const { data } = await admin
    .from("integration_tokens")
    .select("account_name, connected_by, updated_at, expires_at")
    .eq("provider", PROVIDER)
    .maybeSingle()
  if (!data) return { connected: false as const }
  return { connected: true as const, ...data }
}
