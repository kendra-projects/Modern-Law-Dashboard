"use client"

import * as React from "react"
import { FileText, Inbox, Loader2, ArrowLeftRight } from "lucide-react"
import { switchWorkspace } from "@/app/actions/workspace"
import type { Workspace } from "./nav-items"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const OPTIONS: { key: Workspace; label: string; icon: typeof Inbox }[] = [
  { key: "content", label: "Content", icon: FileText },
  { key: "intake", label: "Intake", icon: Inbox },
]

/** Admin-only Content / Intake toggle at the top of the nav. */
export function WorkspaceSwitch({ current, collapsed = false }: { current: Workspace | null; collapsed?: boolean }) {
  const [pending, start] = React.useTransition()
  const go = (ws: Workspace) => {
    if (ws === current) return
    start(() => switchWorkspace(ws))
  }

  if (collapsed) {
    const next: Workspace = current === "intake" ? "content" : "intake"
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => go(next)}
            disabled={pending}
            className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg border border-sidebar-border text-sidebar-foreground/70 hover:bg-white/5 hover:text-sidebar-foreground"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Switch to {next === "intake" ? "Intake" : "Content"}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg border border-sidebar-border bg-white/[0.03] p-1">
      {OPTIONS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => go(key)}
          disabled={pending}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
            current === key
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-sidebar-foreground/60 hover:bg-white/5 hover:text-sidebar-foreground"
          )}
        >
          {pending && current !== key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
          {label}
        </button>
      ))}
    </div>
  )
}
