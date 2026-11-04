"use client"

import { useFormState, useFormStatus } from "react-dom"
import { Loader2 } from "lucide-react"
import { acceptInvite } from "@/app/invite/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/auth/password-input"
import { Label } from "@/components/ui/label"

function Submit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="w-full gap-1.5">
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      Set password and open the dashboard
    </Button>
  )
}

export function SetPasswordForm({ token, email }: { token: string; email: string }) {
  const [state, action] = useFormState(acceptInvite, null)
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div className="space-y-1.5">
        <Label>Email</Label>
        <Input value={email} readOnly disabled autoComplete="username" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Choose a password</Label>
        <PasswordInput id="password" name="password" required minLength={8} autoComplete="new-password" />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Type it again</Label>
        <PasswordInput id="confirm" name="confirm" required minLength={8} autoComplete="new-password" />
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Submit />
    </form>
  )
}
