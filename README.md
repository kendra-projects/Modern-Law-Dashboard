# Modern Law Operations Dashboard

Next.js 14 + Supabase dashboard for Modern Law: the content pipeline (upload, blogs,
Google Business Profile posts, recovery queue, archive, activity), Zoom consultation
resolution, and the consultation intake system (Acuity, Clio Manage, Slack).

## Deploy

- Hosted on Vercel (team `codesquad`, project `modern-law-dashboard`), connected to this repo.
- **Every push to `main` deploys to production** at https://modern-law-dashboard.vercel.app.
  Pushes to other branches get a preview deployment.
- Region, cron jobs and functions come from `vercel.json`.
- Environment variables are set in Vercel (names in `.env.example`); none are committed.

## Run locally

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

Before pushing: `npx tsc --noEmit -p .` and `npx next lint`.
