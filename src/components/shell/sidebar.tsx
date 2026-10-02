"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { visibleNav, workspaceForPath, type Workspace } from "./nav-items"
import { WorkspaceSwitch } from "./workspace-switch"
import type { Role } from "@/types/database"
import { NavBadge } from "./nav-signals"
import { BrandLogo } from "@/components/brand-logo"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

// The active item is the single most-specific match, so a nested route like
// /intake/recovery lights up only "Intake Recovery", not its parent "/intake".
function activeHref(pathname: string, items: { href: string }[]): string | undefined {
  return items
    .filter((i) =>
      i.href === "/" ? pathname === "/" : pathname === i.href || pathname.startsWith(i.href + "/")
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href
}

export function Sidebar({ role, workspace }: { role: Role; workspace: Workspace | null }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = React.useState(false)
  // Admin works in one workspace at a time; the page itself decides which.
  const ws = role === "admin" ? workspaceForPath(pathname, workspace) : null
  const items = visibleNav(role, ws)
  const current = activeHref(pathname, items)

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-300 lg:flex",
        collapsed ? "w-[76px]" : "w-64"
      )}
    >
      <div
        className={cn(
          "flex h-16 items-center border-b border-sidebar-border px-4",
          collapsed && "justify-center px-0"
        )}
      >
        <BrandLogo compact={collapsed} />
      </div>

      {role === "admin" && (
        <div className={cn("border-b border-sidebar-border p-3", collapsed && "px-0")}>
          <WorkspaceSwitch current={ws} collapsed={collapsed} />
        </div>
      )}

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {items.map((item) => {
          const active = item.href === current
          const Icon = item.icon
          const link = (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/15 text-primary"
                  : "text-sidebar-foreground/70 hover:bg-white/5 hover:text-sidebar-foreground",
                collapsed && "justify-center px-0"
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
              )}
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {collapsed ? (
                <NavBadge href={item.href} dot />
              ) : (
                <>
                  {/* min-w-0 so a long description truncates instead of
                      shoving the badge off the right edge of the rail. */}
                  <span className="flex min-w-0 flex-col leading-tight">
                    {item.label}
                    <span className="truncate text-[11px] font-normal text-sidebar-foreground/45">
                      {item.description}
                    </span>
                  </span>
                  <NavBadge href={item.href} />
                </>
              )}
            </Link>
          )

          return collapsed ? (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          ) : (
            link
          )
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/60 transition-colors hover:bg-white/5 hover:text-sidebar-foreground",
            collapsed && "justify-center px-0"
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-[18px] w-[18px]" />
          ) : (
            <>
              <PanelLeftClose className="h-[18px] w-[18px]" />
              Collapse
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
