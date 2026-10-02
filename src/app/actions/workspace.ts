"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getRole } from "@/lib/role"
import { WORKSPACE_COOKIE } from "@/lib/workspace"

/** Admin only: open the Content or Intake workspace (lands on its Overview). */
export async function switchWorkspace(ws: "content" | "intake") {
  if (ws !== "content" && ws !== "intake") return
  if ((await getRole()) !== "admin") redirect("/")
  cookies().set(WORKSPACE_COOKIE, ws, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  })
  redirect("/")
}

/** Admin only: forget the choice and go back to the workspace picker. */
export async function chooseWorkspaceAgain() {
  cookies().delete(WORKSPACE_COOKIE)
  redirect("/")
}
