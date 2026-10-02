/**
 * Seed / reset the dashboard admin login.
 *
 *   node --env-file=.env.local scripts/seed-user.mjs
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (server-only secret).
 * Set SEED_ADMIN_PASSWORD (and optionally SEED_ADMIN_EMAIL) to rotate the
 * admin password or recreate the user on a fresh Supabase project.
 */
import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const EMAIL = process.env.SEED_ADMIN_EMAIL || "admin@modernlaw.app"
const PASSWORD = process.env.SEED_ADMIN_PASSWORD

if (!PASSWORD) {
  console.error("Set SEED_ADMIN_PASSWORD to the password the admin should have.")
  process.exit(1)
}

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Add the service_role key to .env.local, then re-run."
  )
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data: list } = await admin.auth.admin.listUsers()
const existing = list?.users?.find((u) => u.email === EMAIL)

if (existing) {
  await admin.auth.admin.updateUserById(existing.id, {
    password: PASSWORD,
    email_confirm: true,
  })
  console.log(`Updated password for ${EMAIL}`)
} else {
  const { error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "Modern Law Admin" },
  })
  if (error) {
    console.error("Failed to create user:", error.message)
    process.exit(1)
  }
  console.log(`Created admin user ${EMAIL}`)
}

console.log(`Login: ${EMAIL} (password as set in SEED_ADMIN_PASSWORD)`)
