import "server-only"

import { cookies } from "next/headers"
import type { Workspace } from "@/components/shell/nav-items"

// The admin login can see both sections, but works in one at a time: it picks
// Content or Intake at every login (saved in this cookie until sign out) and
// can switch whenever. The content and intake logins never need it; their
// section is their role.

export const WORKSPACE_COOKIE = "ml_workspace"

/** The admin's chosen workspace, or null when none has been picked yet. */
export function getWorkspace(): Workspace | null {
  const v = cookies().get(WORKSPACE_COOKIE)?.value
  return v === "content" || v === "intake" ? v : null
}
