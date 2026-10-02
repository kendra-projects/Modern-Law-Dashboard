"use client"

import { createBrowserClient } from "@supabase/ssr"
import type { Database } from "@/types/database"

/**
 * Browser Supabase client. Uses ONLY the public anon key + the user's session
 * cookie. The `service_role` key is never available here.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
