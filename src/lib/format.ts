import { formatDistanceToNow, format } from "date-fns"

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true })
  } catch {
    return "—"
  }
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    return format(new Date(iso), "MMM d, yyyy")
  } catch {
    return "—"
  }
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    return format(new Date(iso), "MMM d, yyyy · h:mm a")
  } catch {
    return "—"
  }
}

export function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

export function initials(name: string | null | undefined): string {
  if (!name) return "ML"
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}
