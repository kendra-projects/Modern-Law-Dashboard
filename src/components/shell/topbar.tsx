"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, LogOut, ShieldCheck, LayoutGrid } from "lucide-react"
import { visibleNav, workspaceForPath, type NavItem, type Workspace } from "./nav-items"
import { WorkspaceSwitch } from "./workspace-switch"
import { chooseWorkspaceAgain } from "@/app/actions/workspace"
import type { Role } from "@/types/database"
import { PageGuide } from "./page-guide"
import { NavBadge, NavMenuDot } from "./nav-signals"
import { BrandLogo } from "@/components/brand-logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet"
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

function currentTitle(pathname: string, items: NavItem[]) {
  const match = [...items]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) =>
      i.href === "/" ? pathname === "/" : pathname.startsWith(i.href)
    )
  return match?.label ?? "Dashboard"
}

export function Topbar({ email, role, workspace }: { email: string; role: Role; workspace: Workspace | null }) {
  const pathname = usePathname()
  const [open, setOpen] = React.useState(false)
  const ws = role === "admin" ? workspaceForPath(pathname, workspace) : null
  const items = visibleNav(role, ws)
  const current = [...items]
    .filter((i) =>
      i.href === "/" ? pathname === "/" : pathname === i.href || pathname.startsWith(i.href + "/")
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6">
      {/* Mobile nav */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="relative lg:hidden">
            <Menu className="h-4 w-4" />
            <NavMenuDot hrefs={items.map((i) => i.href)} />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 bg-sidebar p-0 text-sidebar-foreground">
          <SheetHeader className="h-16 flex-row items-center border-b border-sidebar-border px-4">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <BrandLogo />
          </SheetHeader>
          {role === "admin" && (
            <div className="border-b border-sidebar-border p-3">
              <WorkspaceSwitch current={ws} />
            </div>
          )}
          <nav className="space-y-1 p-3">
            {items.map((item) => {
              const active = item.href === current
              const Icon = item.icon
              return (
                <SheetClose asChild key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary/15 text-primary"
                        : "text-sidebar-foreground/70 hover:bg-white/5"
                    )}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                    {item.label}
                    <NavBadge href={item.href} />
                  </Link>
                </SheetClose>
              )
            })}
          </nav>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-col">
        <h1 className="flex items-center gap-1.5 font-serif text-lg font-semibold leading-none tracking-tight text-foreground">
          <span className="truncate">{currentTitle(pathname, items)}</span>
          {/* Sits in the topbar rather than on each page, so every route gets
              it — including the ones whose heading lives inside a client
              component. */}
          <PageGuide />
        </h1>
        <span className="mt-0.5 hidden text-xs text-muted-foreground sm:block">
          Modern Law · Automation Operations
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="mr-1 hidden items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-medium text-success sm:flex">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
          Live
        </div>
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full border border-border p-0.5 pr-2 transition-colors hover:bg-muted">
              <Avatar className="h-8 w-8">
                <AvatarFallback>ML</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-foreground">
                Modern Law Admin
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {email}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-xs text-muted-foreground" disabled>
              <ShieldCheck className="h-4 w-4 text-success" />
              Zero-trust session · RLS active
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {role === "admin" && (
              <>
                <form action={chooseWorkspaceAgain}>
                  <button type="submit" className="w-full">
                    <DropdownMenuItem>
                      <LayoutGrid className="h-4 w-4" />
                      Choose workspace
                    </DropdownMenuItem>
                  </button>
                </form>
                <DropdownMenuSeparator />
              </>
            )}
            <form action="/auth/signout" method="post">
              <button type="submit" className="w-full">
                <DropdownMenuItem className="text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </button>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
