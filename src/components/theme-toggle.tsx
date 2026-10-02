"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import { Moon, Sun, Wine } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const THEMES = [
  { key: "dark", label: "Modern Dark", icon: Moon, hint: "Obsidian & slate" },
  { key: "light", label: "Executive Light", icon: Sun, hint: "Ivory & teal" },
  { key: "evening", label: "Luxury Evening", icon: Wine, hint: "Espresso & gold" },
] as const

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const active = THEMES.find((t) => t.key === theme) ?? THEMES[0]
  const ActiveIcon = active.icon

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Switch theme">
          {mounted ? (
            <ActiveIcon className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {THEMES.map((t) => {
          const Icon = t.icon
          const isActive = mounted && theme === t.key
          return (
            <DropdownMenuItem
              key={t.key}
              onClick={() => setTheme(t.key)}
              className={cn(isActive && "bg-muted")}
            >
              <Icon className="h-4 w-4 text-primary" />
              <div className="flex flex-col">
                <span className="text-sm">{t.label}</span>
                <span className="text-xs text-muted-foreground">{t.hint}</span>
              </div>
              {isActive && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
