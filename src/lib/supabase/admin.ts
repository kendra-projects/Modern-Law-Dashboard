import "server-only"

import { createClient as createSbClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"

/**
 * SERVER-ONLY privileged client using the `service_role` key (bypasses RLS).
 * Guarded by `server-only` so it can never be imported into a client bundle.
 *
 * Returns `null` when SUPABASE_SERVICE_ROLE_KEY is not configured, so callers
 * can gracefully fall back to the authenticated SSR client.
 *
 * Its reads never go through Next's fetch cache: a GET route handler (the
 * intake bot's task list) otherwise kept answering from the first response.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return null

  return createSbClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
    }
  )
}
