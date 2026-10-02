"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

/**
 * Periodically re-fetches the current server-rendered page so newly written
 * rows (a workflow just finished, recovery just resolved) appear without the
 * user hitting reload. Pauses while the tab is hidden and refreshes once on
 * refocus, so it never wastes requests in the background.
 */
export function AutoRefresh({ intervalMs = 25000 }: { intervalMs?: number }) {
  const router = useRouter()

  React.useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null

    const start = () => {
      if (timer) return
      timer = setInterval(() => {
        if (document.visibilityState === "visible") router.refresh()
      }, intervalMs)
    }
    const stop = () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        router.refresh()
        start()
      } else {
        stop()
      }
    }

    start()
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      stop()
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [router, intervalMs])

  return null
}
