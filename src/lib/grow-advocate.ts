import "server-only"

import { growFetch } from "@/lib/grow"
import { ADVOCATES, ADVOCATE_CLIO_NAMES } from "@/lib/intake"
import type { IntakeStep } from "@/types/database"

// The client advocate on the consult's Clio Grow matter ("Assigned to"). Staff
// assign every Grow matter, and the firm's Standard Consult Scheduled
// Checklist goes to that person, so the dashboard takes the advocate from
// there instead of picking one itself (the firm, 22 Oct 2026: the advocate in
// Slack must match the one in Grow). The Slack post, the portal invite, the
// follow-up tasks and the confirmation text then wait until Grow names one.
// An advocate staff pick on the lead page always stands. Billing Department is
// on almost every matter and is never the advocate; Kendra is, when the matter
// is hers (27 Oct 2026: on the consults assigned to her in Grow she named
// herself as the advocate in Slack).
// Off until ADVOCATE_SOURCE=grow; until then the advocate is picked as before
// (Acuity's, or whoever is free with ADVOCATE_AUTO=on, lib/advocate-auto.ts).

export const advocateFromGrow = () => (process.env.ADVOCATE_SOURCE ?? "").trim().toLowerCase() === "grow"

/** Who set the lead's advocate when it came from the Grow matter. */
export const BY_GROW = "Clio Grow"
const BY_AUTO = "Automatic"

type GrowUser = { id: string | number; first_name?: string | null; last_name?: string | null; email?: string | null }
type UsersPage = { data?: GrowUser[]; meta?: { paging?: { next?: string | null } } }

// The firm's users rarely change, and each lead reads them: keep them a few minutes.
let usersCache: { at: number; users: GrowUser[] } | null = null
const USERS_TTL = 10 * 60 * 1000

async function growUsers(): Promise<GrowUser[]> {
  if (usersCache && Date.now() - usersCache.at < USERS_TTL) return usersCache.users
  const users: GrowUser[] = []
  let pageToken: string | null = null
  for (let i = 0; i < 5; i++) {
    const q: string = pageToken ? `?page_token=${encodeURIComponent(pageToken)}` : ""
    const res: UsersPage = await growFetch<UsersPage>(`/users${q}`)
    users.push(...(res.data ?? []))
    const next: string | null | undefined = res.meta?.paging?.next
    pageToken = next ? new URL(next).searchParams.get("page_token") : null
    if (!pageToken) break
  }
  usersCache = { at: Date.now(), users }
  return users
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim()

/** The advocate ("Linda") a firm user's full name belongs to, or null. */
export function advocateFor(name: string): string | null {
  const want = norm(name)
  return ADVOCATES.find((a) => norm(ADVOCATE_CLIO_NAMES[a]) === want) ?? null
}

/** Grow user ids for these full names (as Grow spells them); names Grow doesn't know are left out. */
export async function growUserIds(names: string[]): Promise<Record<string, string>> {
  const users = await growUsers()
  const out: Record<string, string> = {}
  for (const name of names) {
    const u = users.find((x) => norm([x.first_name, x.last_name].filter(Boolean).join(" ")) === norm(name))
    if (u) out[name] = String(u.id)
  }
  return out
}

export type GrowAssignment = { assignees: string[]; advocate: string | null }

/** Who the Grow matter is assigned to, and the one client advocate among them (null when none or several). */
export async function growAssignment(matterId: string): Promise<GrowAssignment> {
  const { data: matter } = await growFetch<{ data: { matter_assignee_ids?: (string | number)[] | null } }>(`/matters/${matterId}`)
  const ids = (matter.matter_assignee_ids ?? []).map(String)
  if (!ids.length) return { assignees: [], advocate: null }
  const users = await growUsers()
  const assignees = ids.map((id) => {
    const u = users.find((x) => String(x.id) === id)
    const name = u ? [u.first_name, u.last_name].filter(Boolean).join(" ").trim() : ""
    return name || u?.email || `Grow user ${id}`
  })
  const advocates = Array.from(new Set(assignees.map(advocateFor).filter((a): a is string => Boolean(a))))
  return { assignees, advocate: advocates.length === 1 ? advocates[0] : null }
}

/**
 * The lead's advocate is final: it came from the Grow matter or staff picked it
 * on the lead page. An advocate only typed in Acuity, or picked automatically,
 * is not, while the advocate comes from Grow. Always true with ADVOCATE_SOURCE=free.
 */
export function advocateSettled(steps: Pick<IntakeStep, "step_key" | "state" | "detail">[]) {
  if (!advocateFromGrow()) return true
  const by = (steps.find((s) => s.step_key === "advocate_assigned" && s.state === "done")?.detail as { by?: string } | null)?.by
  return Boolean(by && by !== BY_AUTO)
}
