// Who may manage team members. Only the three main logins can: the admin looks
// after both teams, the content and intake logins after their own. Nobody they
// invite gets this, whichever team they join.

export type Team = "content" | "intake"

const MAIN_LOGINS: Record<string, Team[]> = {
  "admin@modernlaw.app": ["content", "intake"],
  "content@modernlaw.app": ["content"],
  "intake@modernlaw.app": ["intake"],
}

/** The teams this login manages; empty when it isn't one of the main logins. */
export function managedTeams(email: string | null | undefined): Team[] {
  return MAIN_LOGINS[(email ?? "").trim().toLowerCase()] ?? []
}

export const isMainLogin = (email: string | null | undefined) => managedTeams(email).length > 0

/** May this manager see or change someone with this role? The admin role counts as both teams. */
export function canManageRole(managerEmail: string | null | undefined, role: string) {
  const teams = managedTeams(managerEmail)
  if (role === "admin") return teams.length === 2
  return teams.includes(role as Team)
}

/** May this manager remove this person? Never a main login, and never themself. */
export function canRemove(managerEmail: string | null | undefined, target: { email: string; role: string }) {
  return !isMainLogin(target.email) && canManageRole(managerEmail, target.role)
}

export const INVITE_DAYS = 7

export function validEmail(email: string) {
  return /^[^\s@"<>]+@[^\s@"<>]+\.[^\s@"<>]+$/.test(email) && email.length <= 254
}
