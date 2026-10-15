import { CheckCircle2, CircleDashed, AlertTriangle, Link2 } from "lucide-react"
import { createAdminClient } from "@/lib/supabase/admin"
import { clioConfigured, clioFetch, clioStatus } from "@/lib/clio"
import { growConfigured, growFetch, growStatus } from "@/lib/grow"
import { selfScheduleAlertOn } from "@/lib/self-schedule-alert"
import { autoIntakeFrom, autoIntakeMode } from "@/lib/auto-intake"
import { botFrom, botMode } from "@/lib/bot"
import { slackConfigured } from "@/lib/slack"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

const CLIO_MESSAGES: Record<string, { text: string; ok: boolean }> = {
  connected: { text: "Clio connected.", ok: true },
  declined: { text: "Clio approval was declined. Try again when ready.", ok: false },
  bad_state: { text: "The Clio sign-in expired or didn't match. Start again.", ok: false },
  error: { text: "Clio didn't accept the connection. Check the app keys and try again.", ok: false },
  not_configured: { text: "Clio app keys aren't set yet, so there's nothing to connect to.", ok: false },
  forbidden: { text: "Only intake or admin logins can connect Clio.", ok: false },
}

const GROW_MESSAGES: Record<string, { text: string; ok: boolean }> = {
  connected: { text: "Clio Grow connected. New bookings now get a note on the client's Grow matter.", ok: true },
  declined: { text: "Clio Grow approval was declined. Try again when ready.", ok: false },
  bad_state: { text: "The Clio Grow sign-in expired or didn't match. Start again.", ok: false },
  error: { text: "Clio Grow didn't accept the connection. Check the app keys and try again.", ok: false },
  not_configured: { text: "The Clio Grow app keys aren't set yet, so there's nothing to connect to.", ok: false },
  forbidden: { text: "Only intake or admin logins can connect Clio Grow.", ok: false },
}

function fmt(iso: string | null | undefined) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function StatusPill({ state }: { state: "ok" | "waiting" | "problem" }) {
  const map = {
    ok: { icon: CheckCircle2, label: "Working", cls: "bg-success/15 text-success" },
    waiting: { icon: CircleDashed, label: "Waiting", cls: "bg-secondary text-secondary-foreground" },
    problem: { icon: AlertTriangle, label: "Needs attention", cls: "bg-destructive/15 text-destructive" },
  }[state]
  const Icon = map.icon
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", map.cls)}>
      <Icon className="h-3.5 w-3.5" /> {map.label}
    </span>
  )
}

export default async function IntakeSettingsPage({
  searchParams,
}: {
  searchParams: { clio?: string; grow?: string }
}) {
  const banner = searchParams.clio
    ? CLIO_MESSAGES[searchParams.clio]
    : searchParams.grow
      ? GROW_MESSAGES[searchParams.grow]
      : undefined

  // ── Acuity ──
  const acuityKeys = Boolean(process.env.ACUITY_USER_ID && process.env.ACUITY_API_KEY)
  const admin = createAdminClient()
  const { data: lastAcuity } = admin
    ? await admin
        .from("intake_leads")
        .select("created_at")
        .eq("source", "acuity")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null }

  // ── Clio ──
  const configured = clioConfigured()
  const status = await clioStatus()
  let live = false
  if (status.connected) {
    try {
      await clioFetch("/api/v4/users/who_am_i?fields=id")
      live = true
    } catch {
      live = false
    }
  }
  const clioState: "ok" | "waiting" | "problem" = !configured
    ? "waiting"
    : !status.connected
      ? "waiting"
      : live
        ? "ok"
        : "problem"

  // ── Clio Grow ──
  const growKeys = growConfigured()
  const grow = await growStatus()
  let growLive = false
  if (grow.connected) {
    try {
      await growFetch("/users/who_am_i")
      growLive = true
    } catch {
      growLive = false
    }
  }
  const growState: "ok" | "waiting" | "problem" = !growKeys || !grow.connected ? "waiting" : growLive ? "ok" : "problem"
  const growAuto = process.env.GROW_AUTO_NOTES !== "off"

  // ── Automatic intake ──
  const autoMode = autoIntakeMode()
  const { data: lastAuto } = admin
    ? await admin
        .from("intake_steps")
        .select("created_at")
        .eq("step_key", "auto_intake")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null }
  const autoState: "ok" | "waiting" | "problem" =
    autoMode === "on" ? (status.connected && slackConfigured() ? "ok" : "problem") : "waiting"
  const autoFrom = new Date(autoIntakeFrom()).toLocaleDateString("en-US", {
    timeZone: "America/Phoenix",
    month: "short",
    day: "numeric",
    year: "numeric",
  })

  // ── Intake bot (lib/bot.ts) ──
  const bot = botMode()
  const botReady = Boolean(process.env.BOT_SECRET)
  // Without it the bot still runs every hour; with it a booking wakes it at once.
  const botWake = Boolean(process.env.GITHUB_BOT_TOKEN)
  const { data: lastBot } = admin
    ? await admin
        .from("intake_steps")
        .select("created_at")
        .or("step_key.like.bot_%,detail->>by.eq.Bot")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null }
  const botState: "ok" | "waiting" | "problem" = bot === "off" ? "waiting" : botReady ? "ok" : "problem"
  const botSince = new Date(botFrom()).toLocaleDateString("en-US", { timeZone: "America/Phoenix", month: "short", day: "numeric", year: "numeric" })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight text-foreground">
          Intake Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The outside systems the intake automation reads from and writes to.
        </p>
      </div>

      {banner && (
        <p
          className={cn(
            "rounded-md border px-3 py-2 text-sm",
            banner.ok
              ? "border-success/40 bg-success/10 text-success"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          )}
        >
          {banner.text}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Acuity */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">Acuity Scheduling</h2>
            <StatusPill state={acuityKeys ? (lastAcuity ? "ok" : "waiting") : "problem"} />
          </div>
          <p className="text-xs text-muted-foreground">
            Every booking (LexiDesk, self-scheduled, staff) lands in Acuity and is sent here
            by webhook, then filled in from the Acuity API.
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">API key</dt>
              <dd className="text-foreground">{acuityKeys ? "Set" : "Missing"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Last booking received</dt>
              <dd className="text-foreground">
                {lastAcuity ? fmt(lastAcuity.created_at) : "None yet (webhook not set?)"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Self-schedule alert</dt>
              <dd className="text-right text-foreground">
                {selfScheduleAlertOn() ? "On, posts in #clientadvocates" : "Off (Zapier still sends it)"}
              </dd>
            </div>
          </dl>
        </div>

        {/* Clio */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">Clio Manage</h2>
            <StatusPill state={clioState} />
          </div>
          <p className="text-xs text-muted-foreground">
            Where client contacts and matters get created. Every record is attributed to the
            Clio user who approved the connection.
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">App keys</dt>
              <dd className="text-foreground">{configured ? "Set" : "Missing"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Acting as</dt>
              <dd className="truncate text-foreground">
                {status.connected ? status.account_name ?? "Connected" : "Not connected"}
              </dd>
            </div>
            {status.connected && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Connected</dt>
                <dd className="text-foreground">{fmt(status.updated_at)}</dd>
              </div>
            )}
          </dl>
          <div className="mt-4">
            {configured ? (
              <Button asChild size="sm" variant={status.connected ? "outline" : "default"} className="gap-1.5">
                <a href="/api/clio/connect">
                  <Link2 className="h-4 w-4" />
                  {status.connected ? "Reconnect Clio" : "Connect Clio"}
                </a>
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Add the Clio app keys first, then a Connect button appears here.
              </p>
            )}
          </div>
        </div>

        {/* Clio Grow */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">Clio Grow</h2>
            <StatusPill state={growState} />
          </div>
          <p className="text-xs text-muted-foreground">
            Each new booking&apos;s details go on the client&apos;s Grow matter as a note, so the team
            finds everything in Grow. Moves and cancellations add a short note too.
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">App keys</dt>
              <dd className="text-foreground">{growKeys ? "Set" : "Missing"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Acting as</dt>
              <dd className="truncate text-foreground">
                {grow.connected ? grow.account_name ?? "Connected" : "Not connected"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Automatic notes</dt>
              <dd className="text-foreground">{growAuto ? "On" : "Off (buttons on the lead page only)"}</dd>
            </div>
          </dl>
          <div className="mt-4">
            {growKeys ? (
              <Button asChild size="sm" variant={grow.connected ? "outline" : "default"} className="gap-1.5">
                <a href="/api/grow/connect">
                  <Link2 className="h-4 w-4" />
                  {grow.connected ? "Reconnect Clio Grow" : "Connect Clio Grow"}
                </a>
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Add the Clio Grow app keys first, then a Connect button appears here.
              </p>
            )}
          </div>
        </div>

        {/* Automatic intake */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">Automatic intake</h2>
            <StatusPill state={autoState} />
          </div>
          <p className="text-xs text-muted-foreground">
            For new bookings, the dashboard creates the Clio contact and matter, sends the portal
            invite, posts in #initialconsultations and creates the follow-up tasks on its own once
            the conflict check is clear and an advocate is assigned, then approves the intake when
            the text and Lexi are done too.
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Mode</dt>
              <dd className="text-right text-foreground">
                {autoMode === "on"
                  ? "On"
                  : autoMode === "log"
                    ? "Test run (records what it would do)"
                    : "Off (buttons on the lead page only)"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Bookings from</dt>
              <dd className="text-foreground">{autoFrom}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Last run</dt>
              <dd className="text-foreground">{lastAuto ? fmt(lastAuto.created_at) : "None yet"}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            Set with AUTO_INTAKE (on, log or off) in Vercel, then redeploy.
          </p>
        </div>

        {/* Intake bot */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">Intake bot</h2>
            <StatusPill state={botState} />
          </div>
          <p className="text-xs text-muted-foreground">
            The steps no API allows. It pauses Lexi&apos;s follow-ups in LexiDesk for bookings Lexi didn&apos;t make
            (LexiDesk stops its own), and later the Clio confirmation text. It runs on GitHub Actions; anything it
            can&apos;t settle goes to Intake Recovery.
          </p>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Mode</dt>
              <dd className="text-right text-foreground">
                {bot === "on" ? "On" : bot === "dry" ? "Test run (notes what it would do)" : "Off"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Bookings from</dt>
              <dd className="text-foreground">{botSince}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Key</dt>
              <dd className="text-foreground">{botReady ? "Set" : "Missing"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Runs</dt>
              <dd className="text-right text-foreground">{botWake ? "On each booking, and hourly" : "Hourly"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Last result</dt>
              <dd className="text-foreground">{lastBot ? fmt(lastBot.created_at) : "None yet"}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">
            Set with BOT_MODE (on, dry or off) in Vercel, then redeploy.
          </p>
        </div>
      </div>
    </div>
  )
}
