import Link from "next/link"
import { rejectInvite } from "@/app/invite/actions"
import { SetPasswordForm } from "@/components/auth/set-password-form"
import { BrandLogo } from "@/components/brand-logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { hashToken } from "@/lib/members"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

// Opening the link changes nothing (mail scanners open links): Accept and Reject
// happen only when the person presses a button here.
export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ choice?: string; done?: string }>
}) {
  const { token } = await params
  const { choice, done } = await searchParams
  const db = createAdminClient()
  const { data: invite } = db
    ? await db.from("member_invites").select("email, full_name, role, status, expires_at").eq("token_hash", hashToken(token)).maybeSingle()
    : { data: null }
  const open = invite?.status === "pending" && new Date(invite.expires_at).getTime() > Date.now()
  const team = invite?.role === "intake" ? "Intake" : "Content"

  let body: React.ReactNode
  if (done === "rejected" && invite?.status === "rejected") {
    body = <Message title="Invitation rejected" text="You won't get access to the dashboard. You can close this page." />
  } else if (invite?.status === "accepted") {
    body = (
      <Message title="You've already accepted" text="You can log in with your email and password.">
        <Button asChild className="mt-4 w-full">
          <Link href="/login">Go to login</Link>
        </Button>
      </Message>
    )
  } else if (!invite || !open) {
    body = <Message title="This invitation is no longer open" text="Please ask the person who invited you to send a new one." />
  } else if (choice === "accept") {
    body = (
      <>
        <h1 className="font-serif text-2xl font-bold text-foreground">Set your password</h1>
        <p className="mb-5 mt-1 text-sm text-muted-foreground">
          Welcome, {invite.full_name}. You&apos;re joining the {team} team.
        </p>
        <SetPasswordForm token={token} email={invite.email} />
      </>
    )
  } else if (choice === "reject") {
    body = (
      <Message title="Reject this invitation?" text={`You won't get access to the Modern Law dashboard (${team} team).`}>
        <form action={rejectInvite} className="mt-4 flex gap-2">
          <input type="hidden" name="token" value={token} />
          <Button type="submit" variant="destructive" className="flex-1">
            Yes, reject
          </Button>
          <Button asChild variant="outline" className="flex-1">
            <Link href={`/invite/${encodeURIComponent(token)}?choice=accept`}>Accept instead</Link>
          </Button>
        </form>
      </Message>
    )
  } else {
    body = (
      <Message title="You're invited" text={`Hi ${invite.full_name}, you've been invited to join the ${team} team on the Modern Law dashboard.`}>
        <div className="mt-4 flex gap-2">
          <Button asChild className="flex-1">
            <Link href={`/invite/${encodeURIComponent(token)}?choice=accept`}>Accept</Link>
          </Button>
          <Button asChild variant="outline" className="flex-1">
            <Link href={`/invite/${encodeURIComponent(token)}?choice=reject`}>Reject</Link>
          </Button>
        </div>
      </Message>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-5">
        <BrandLogo />
        <Card>
          <CardContent className="p-6">{body}</CardContent>
        </Card>
      </div>
    </main>
  )
}

function Message({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <>
      <h1 className="font-serif text-2xl font-bold text-foreground">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      {children}
    </>
  )
}
