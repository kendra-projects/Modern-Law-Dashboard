"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

// Asks the server to pull in work staff did straight in Clio, and refreshes the
// page if anything changed. With a lead id it syncs that lead when its page
// opens; without one it syncs the open leads, at most every 10 minutes per
// browser.

const EVERY = 10 * 60 * 1000
const KEY = "ml_clio_sync_at"

export function ClioSyncPing({ leadId }: { leadId?: string }) {
  const router = useRouter()
  React.useEffect(() => {
    if (!leadId) {
      try {
        if (Date.now() - Number(localStorage.getItem(KEY) || 0) < EVERY) return
        localStorage.setItem(KEY, String(Date.now()))
      } catch {
        /* storage blocked: sync anyway */
      }
    }
    let alive = true
    fetch(`/api/intake/clio-sync${leadId ? `?lead=${leadId}` : ""}`, { method: "POST" })
      .then((r) => r.json())
      .then((d: { changes?: string[]; changed?: number }) => {
        if (alive && ((d.changes?.length ?? 0) > 0 || (d.changed ?? 0) > 0)) router.refresh()
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [leadId, router])
  return null
}
