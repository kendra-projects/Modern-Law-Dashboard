"use client"

import * as React from "react"
import { Loader2, Trash2, UserPlus, X } from "lucide-react"
import { toast } from "sonner"
import { cancelInvite, inviteMember, removeMember } from "@/app/actions/members"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Member, PendingInvite } from "@/lib/members"
import type { Team } from "@/lib/member-rules"

const TEAM_LABEL: Record<string, string> = { content: "Content", intake: "Intake", admin: "Admin" }

export const phoenixTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/Phoenix", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })

export function MembersClient({ members, invites, teams }: { members: Member[]; invites: PendingInvite[]; teams: Team[] }) {
  const [adding, setAdding] = React.useState(false)
  const [removing, setRemoving] = React.useState<Member | null>(null)
  const [pending, start] = React.useTransition()

  const run = (work: () => Promise<{ ok: boolean; message: string }>, done?: () => void) =>
    start(async () => {
      const r = await work()
      if (r.ok) {
        toast.success(r.message)
        done?.()
      } else toast.error(r.message)
    })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-foreground">Members</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {teams.length === 2 ? "Everyone with access to the dashboard." : `Everyone on the ${TEAM_LABEL[teams[0]]} team.`}
          </p>
        </div>
        <Button onClick={() => setAdding(true)} className="gap-1.5">
          <UserPlus className="h-4 w-4" /> Add member
        </Button>
      </div>

      <Card>
        <CardContent className="divide-y divide-border p-0">
          {members.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{m.name}</p>
                <p className="truncate text-xs text-muted-foreground">{m.email}</p>
              </div>
              <Badge variant="outline">{TEAM_LABEL[m.role] ?? m.role}</Badge>
              <p className="w-48 text-xs text-muted-foreground">{m.lastOpened ? `Last opened ${phoenixTime(m.lastOpened)}` : "Hasn't opened it yet"}</p>
              {m.removable ? (
                <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setRemoving(m)}>
                  <Trash2 className="h-4 w-4" /> Remove
                </Button>
              ) : (
                <span className="w-[92px] text-center text-xs text-muted-foreground">Main login</span>
              )}
            </div>
          ))}
          {!members.length && <p className="p-6 text-center text-sm text-muted-foreground">No members yet.</p>}
        </CardContent>
      </Card>

      {invites.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">Waiting for a reply</h2>
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {invites.map((i) => (
                <div key={i.id} className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{i.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{i.email}</p>
                  </div>
                  <Badge variant="outline">{TEAM_LABEL[i.team]}</Badge>
                  <p className="w-48 text-xs text-muted-foreground">{i.expired ? "Invitation expired, add them again" : `Invited ${phoenixTime(i.sent)}`}</p>
                  <Button variant="ghost" size="sm" className="gap-1.5" disabled={pending} onClick={() => run(() => cancelInvite(i.id))}>
                    <X className="h-4 w-4" /> Cancel
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <AddDialog open={adding} onOpenChange={setAdding} teams={teams} pending={pending} onAdd={(input) => run(() => inviteMember(input), () => setAdding(false))} />

      <Dialog open={Boolean(removing)} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removing?.name}?</DialogTitle>
            <DialogDescription>They won&apos;t be able to log in any more. Their login history stays. To bring them back, add them again.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Keep them
            </Button>
            <Button variant="destructive" disabled={pending} className="gap-1.5" onClick={() => run(() => removeMember(removing!.id), () => setRemoving(null))}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />} Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AddDialog({
  open,
  onOpenChange,
  teams,
  pending,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  teams: Team[]
  pending: boolean
  onAdd: (input: { name: string; email: string; team: Team }) => void
}) {
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [team, setTeam] = React.useState<Team | "">(teams.length === 1 ? teams[0] : "")
  React.useEffect(() => {
    if (!open) {
      setName("")
      setEmail("")
      setTeam(teams.length === 1 ? teams[0] : "")
    }
  }, [open, teams])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (team) onAdd({ name, email, team })
          }}
        >
          <DialogHeader>
            <DialogTitle>Add a member</DialogTitle>
            <DialogDescription>They&apos;ll get an email with Accept and Reject. If they accept, they set their own password.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="member-name">Name</Label>
            <Input id="member-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="member-email">Email</Label>
            <Input id="member-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          {teams.length > 1 ? (
            <div className="space-y-1.5">
              <Label>Team</Label>
              <Select value={team} onValueChange={(v) => setTeam(v as Team)}>
                <SelectTrigger aria-label="Team">
                  <SelectValue placeholder="Choose a team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TEAM_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">They&apos;ll join the {TEAM_LABEL[teams[0]]} team.</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !team} className="gap-1.5">
              {pending && <Loader2 className="h-4 w-4 animate-spin" />} Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
