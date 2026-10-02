import {
  LayoutDashboard,
  Upload,
  Scale,
  Archive,
  ScrollText,
  LifeBuoy,
  FileText,
  MapPin,
  Inbox,
  Settings,
  CalendarDays,
  type LucideIcon,
} from "lucide-react"
import type { Role } from "@/types/database"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  description: string
  /** Which section this belongs to. Undefined = shown to everyone (e.g. Overview). */
  section?: "content" | "intake"
}

export const NAV_ITEMS: NavItem[] = [
  // Home — shown to everyone
  {
    href: "/",
    label: "Overview",
    icon: LayoutDashboard,
    description: "Mission control",
  },
  // ── Consultation intake (new) ──────────────────────────────────────────────
  {
    href: "/intake",
    label: "Consultation Intake",
    icon: Inbox,
    description: "New consult leads",
    section: "intake",
  },
  {
    href: "/intake/appointments",
    label: "Appointments",
    icon: CalendarDays,
    description: "Full schedule & history",
    section: "intake",
  },
  {
    href: "/intake/recovery",
    label: "Intake Recovery",
    icon: LifeBuoy,
    description: "Stuck steps & retry",
    section: "intake",
  },
  {
    href: "/intake/activity",
    label: "Intake Activity",
    icon: ScrollText,
    description: "Event log",
    section: "intake",
  },
  {
    href: "/intake/settings",
    label: "Intake Settings",
    icon: Settings,
    description: "Acuity & Clio connections",
    section: "intake",
  },
  // ── Content pipeline — in the order work flows through it ───────────────────
  {
    href: "/upload",
    label: "Intake & Upload",
    icon: Upload,
    description: "Drag & drop media",
    section: "content",
  },
  {
    href: "/blogs",
    label: "Blogs",
    icon: FileText,
    description: "Review & publish",
    section: "content",
  },
  {
    href: "/gbp",
    label: "GBP Local Posts",
    icon: MapPin,
    description: "Multi-location Google posts",
    section: "content",
  },
  {
    href: "/meetings",
    label: "Meeting Resolution",
    icon: Scale,
    description: "Clio exception panel",
    section: "content",
  },
  {
    href: "/recovery",
    label: "Recovery Queue",
    icon: LifeBuoy,
    description: "Failures & auto-retry",
    section: "content",
  },
  {
    href: "/archive",
    label: "Historical Archive",
    icon: Archive,
    description: "Content studio",
    section: "content",
  },
  {
    href: "/logs",
    label: "Activity & Logs",
    icon: ScrollText,
    description: "System health",
    section: "content",
  },
]

export type Workspace = "content" | "intake"

/**
 * Which workspace a page belongs to. /intake pages are Intake, the home page
 * belongs to whichever workspace is chosen, everything else is Content.
 */
export function workspaceForPath(pathname: string, chosen: Workspace | null): Workspace | null {
  if (pathname === "/intake" || pathname.startsWith("/intake/")) return "intake"
  if (pathname === "/") return chosen
  return "content"
}

/**
 * The nav a given role may see. content/intake = their own section plus
 * Overview. admin = the workspace it is in (Content or Intake), switchable;
 * with no workspace picked yet, just Overview (which shows the picker).
 */
export function visibleNav(role: Role, workspace: Workspace | null = null): NavItem[] {
  const section = role === "admin" ? workspace : role
  if (!section) return NAV_ITEMS.filter((i) => !i.section)
  return NAV_ITEMS.filter((i) => !i.section || i.section === section)
}
