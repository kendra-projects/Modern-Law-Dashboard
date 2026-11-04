"use client"

import * as React from "react"
import { Eye, EyeOff } from "lucide-react"
import { Input } from "@/components/ui/input"

/** A password box with an eye button to show or hide what's typed. */
export function PasswordInput(props: Omit<React.ComponentProps<typeof Input>, "type">) {
  const [shown, setShown] = React.useState(false)
  return (
    <div className="relative">
      <Input {...props} type={shown ? "text" : "password"} className="pr-10" />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  )
}
