# Modern Law Operations Dashboard — Deploy Guide

Next.js 14 (App Router) + Supabase. This package contains the full source. It
does **not** include `node_modules`, the build output (`.next`), or any Vercel
link — the deployer sets those up fresh.

## 1. Prerequisites
- Node.js 18.18+ (or 20+) and npm
- A Vercel account
- The Supabase project's URL + keys (see `.env.example`)

## 2. Environment variables
Copy `.env.example` → `.env.local` for local runs, and set the SAME variables in
Vercel (Project → Settings → Environment Variables) for all environments:

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Public Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public anon key (safe for the browser; RLS protects data) |
| `SUPABASE_SERVICE_ROLE_KEY` | no | Optional. Only needed for the seed-admin script; the app runs fully without it. |

> The anon key is a **public** client key by design. The private `service_role`
> key is **not** required by the app and is intentionally left blank.

## 3. Run locally (optional)
```bash
npm install
npm run dev      # http://localhost:3000
```
Sign in with the provisioned admin (Supabase auth): `admin@modernlaw.app`.

## 4. Deploy to Vercel
**Option A — Git (recommended):** push this folder to a new Git repo, import it
in Vercel, add the env vars above, deploy. Framework preset auto-detects Next.js.

**Option B — Vercel CLI:**
```bash
npm install
npm install -g vercel
vercel            # first run links/creates the project + asks for scope
# add the env vars in the Vercel dashboard, then:
vercel --prod
```

## 5. Build check
```bash
npm run build     # must complete clean before deploying
```

## Notes
- Root of the deploy is this folder (it holds `package.json` / `next.config.mjs`).
- `middleware.ts` guards every route; unauthenticated users are sent to `/login`.
- No other services need configuring — the dashboard reads/writes Supabase only.
