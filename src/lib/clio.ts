import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

// Clio Manage (US) OAuth + API client.
//
// One firm-wide connection: an admin clicks "Connect Clio" once, approves in
// Clio, and we keep the tokens in integration_tokens (service-role only, never
// sent to the browser). Access tokens last 30 days; refresh tokens don't expire,
// so clioFetch() refreshes a day early and the connection just stays alive.
// Everything is inert until CLIO_CLIENT_ID / CLIO_CLIENT_SECRET are set.

const CLIO_BASE = "https://app.clio.com"
const PROVIDER = "clio"
const REFRESH_EARLY_MS = 24 * 60 * 60 * 1000

export const CLIO_REDIRECT_URI =
  process.env.CLIO_REDIRECT_URI ??
  "https://modern-law-dashboard.vercel.app/api/clio/callback"

export function clioConfigured() {
  return Boolean(process.env.CLIO_CLIENT_ID && process.env.CLIO_CLIENT_SECRET)
}

export function clioAuthorizeUrl(state: string) {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: process.env.CLIO_CLIENT_ID ?? "",
    redirect_uri: CLIO_REDIRECT_URI,
    state,
  })
  return `${CLIO_BASE}/oauth/authorize?${p}`
}

type TokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in?: number
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${CLIO_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.CLIO_CLIENT_ID ?? "",
      client_secret: process.env.CLIO_CLIENT_SECRET ?? "",
      ...params,
    }),
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`Clio token request failed (${res.status})`)
  return (await res.json()) as TokenResponse
}

async function saveTokens(t: TokenResponse, extra: { account_name?: string; connected_by?: string } = {}) {
  const admin = createAdminClient()
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing")
  const expires_at = t.expires_in
    ? new Date(Date.now() + t.expires_in * 1000).toISOString()
    : null
  const row: Record<string, unknown> = {
    provider: PROVIDER,
    access_token: t.access_token,
    expires_at,
    updated_at: new Date().toISOString(),
    ...extra,
  }
  // Clio may omit refresh_token on refresh; keep the one we have in that case.
  if (t.refresh_token) row.refresh_token = t.refresh_token
  const { error } = await admin
    .from("integration_tokens")
    .upsert(row as never, { onConflict: "provider" })
  if (error) throw new Error(error.message)
}

/** OAuth callback: swap the one-time code for tokens and store them. */
export async function exchangeClioCode(code: string, connectedBy: string) {
  const t = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: CLIO_REDIRECT_URI,
  })
  await saveTokens(t, { connected_by: connectedBy })
  // Record which Clio user the connection acts as (every record we create is
  // attributed to them in Clio).
  try {
    const me = await clioFetch<{ data: { name?: string; email?: string } }>(
      "/api/v4/users/who_am_i?fields=name,email"
    )
    const name = [me.data.name, me.data.email].filter(Boolean).join(" · ")
    if (name) await saveTokens(t, { account_name: name, connected_by: connectedBy })
  } catch {
    /* status is cosmetic; the connection itself is saved */
  }
}

/** A valid access token, refreshed if it's within a day of expiring. */
async function getAccessToken(): Promise<string> {
  const admin = createAdminClient()
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing")
  const { data } = await admin
    .from("integration_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("provider", PROVIDER)
    .maybeSingle()
  if (!data) throw new Error("Clio is not connected")

  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0
  if (data.refresh_token && expiresAt - Date.now() < REFRESH_EARLY_MS) {
    const t = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: data.refresh_token,
    })
    await saveTokens(t)
    return t.access_token
  }
  return data.access_token
}

/** GET/POST/PATCH against the Clio Manage API (paths like "/api/v4/matters"). */
export async function clioFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken()
  const res = await fetch(`${CLIO_BASE}${path}`, {
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
    throw new Error(`Clio ${init.method ?? "GET"} ${path.split("?")[0]} failed (${res.status}) ${body}`)
  }
  return (await res.json()) as T
}

/** Safe-to-render connection status (no token values). */
export async function clioStatus() {
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
