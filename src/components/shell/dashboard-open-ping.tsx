"use client"

import * as React from "react"
import { recordDashboardOpen } from "@/app/actions/members"

/** Records in the login history once each time someone opens the dashboard in a tab. */
export function DashboardOpenPing() {
  React.useEffect(() => {
    try {
      if (sessionStorage.getItem("ml_open_recorded")) return
      sessionStorage.setItem("ml_open_recorded", "1")
    } catch {
      // Storage blocked: the server still skips repeats within a few minutes.
    }
    recordDashboardOpen().catch(() => {})
  }, [])
  return null
}
