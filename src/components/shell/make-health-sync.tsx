"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

const THROTTLE_KEY = "make-health:last-sync"

/**
 * Pulls new Make.com failures into the activity log while someone has the
 * dashboard open.
 *
 * This exists because the Vercel project is on the Hobby plan, where Cron Jobs
 * only fire ONCE PER DAY — far too coarse for "did the pipeline just break?".
 * A viewer-driven sync covers the case that actually matters (somebody is
 * looking at the dashboard and wants it current); the daily cron is the floor
 * for when nobody is. Point any external scheduler at the same endpoint for
 * continuous coverage — see `.env.example`.
 *
 * The sync itself is idempotent, so overlapping viewers cost nothing but a
 * couple of Make API reads.
 */
export function MakeHealthSync({
  intervalMs = 10 * 60 * 1000,
}: {
  intervalMs?: number
}) {
  const router = useRouter()

  React.useEffect(() => {
    let cancelled = false

    const dueAt = (): number => {
      try {
        const raw = window.localStorage.getItem(THROTTLE_KEY)
        const last = raw ? Number(raw) : 0
        return Number.isFinite(last) ? last + intervalMs : 0
      } catch {
        // Private window / blocked storage — just sync on this tick.
        return 0
      }
    }

    const markSynced = () => {
      try {
        window.localStorage.setItem(THROTTLE_KEY, String(Date.now()))
      } catch {
        // Nothing to do; worst case we sync again sooner than intended.
      }
    }

    const sync = async () => {
      if (document.visibilityState !== "visible") return
      if (Date.now() < dueAt()) return

      // Claim the slot before awaiting so two tabs don't both fire.
      markSynced()
      try {
        const res = await fetch("/api/make-health", { method: "POST" })
        if (cancelled || !res.ok) return
        const body: unknown = await res.json()
        const inserted =
          body && typeof body === "object"
            ? (body as { inserted?: number }).inserted
            : 0
        // Only re-render when there is genuinely something new to show.
        if (inserted && inserted > 0) router.refresh()
      } catch {
        // Offline or the endpoint is unconfigured — the daily cron still runs.
      }
    }

    void sync()
    const timer = setInterval(() => void sync(), 60_000)
    const onVisibility = () => {
      if (document.visibilityState === "visible") void sync()
    }
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [router, intervalMs])

  return null
}
