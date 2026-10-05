"use client"

import * as React from "react"
import { Copy, Check, ExternalLink, ShieldCheck, ShieldAlert, UserCheck, Send, ListChecks, BadgeCheck, PauseCircle, StickyNote } from "lucide-react"
import {
  setConflictDecision,
  assignAdvocate,
  approveIntake,
  markClientMessage,
  markLexiFollowUps,
  postConsultToSlack,
  sendPortalInvite,
  createFollowUps,
  addGrowNote,
} from "@/app/actions/intake-leads"
import { ADVOCATES, CLIO_CONFLICT_URL } from "@/lib/intake"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// What sits inside each step of the lead workspace (lead-workspace.tsx draws the
// steps, in the order the work is done). One component per step; each runs its
// own action and shows its own result.

type Result = { ok: boolean; message: string }

function useAction() {
  const [pending, start] = React.useTransition()
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null)
  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      const r = await fn()
      setMsg({ ok: r.ok, text: r.message })
    })
  const note = msg && <p className={cn("text-xs", msg.ok ? "text-muted-foreground" : "text-destructive")}>{msg.text}</p>
  return { pending, run, note }
}

const Hint = ({ children }: { children: React.ReactNode }) => <p className="text-xs text-muted-foreground">{children}</p>
const Row = ({ children }: { children: React.ReactNode }) => <div className="flex flex-wrap items-center gap-2">{children}</div>
const Box = ({ children }: { children: React.ReactNode }) => (
  <div className="whitespace-pre-wrap rounded-lg bg-muted/30 px-3 py-2.5 text-sm text-foreground [overflow-wrap:anywhere]">
    {children}
  </div>
)
const due = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" })

function OpenLink({ href, label = "Open in Clio" }: { href: string | null; label?: string }) {
  if (!href) return null
  return (
    <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
      <a href={href} target="_blank" rel="noreferrer">
        {label} <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </Button>
  )
}

/**
 * One click: copies the text and opens the page it gets pasted into (Clio's
 * Text messages tab, LexiDesk's search). Neither can be handed the text in the
 * link, so the clipboard carries it. The copy starts before the new tab takes
 * focus, which the clipboard needs.
 */
function CopyAndOpen({
  text,
  href,
  label = "Copy & open in Clio",
  copiedLabel = "Copied, opening Clio",
}: {
  text: string
  href: string
  label?: string
  copiedLabel?: string
}) {
  const [copied, setCopied] = React.useState(false)
  return (
    <Button asChild size="sm" className="h-8 gap-1.5 text-xs">
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={() => {
          navigator.clipboard?.writeText(text).then(() => setCopied(true))
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? copiedLabel : label}
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </Button>
  )
}

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-8 gap-1.5 text-xs"
      onClick={() =>
        navigator.clipboard?.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  )
}

// ── Booking note in Clio Grow ───────────────────────────────────────────────
export function GrowStep({
  leadId,
  noted,
  extra,
  failed,
  match,
  preview,
}: {
  leadId: string
  /** Set once the booking note is on a Grow matter. */
  noted: { matterName: string; matterUrl: string; who: string } | null
  /** Later notes on the same matter (rescheduled, canceled). */
  extra: string[]
  failed: string | null
  /** Matters that could be the one, when the automatic match couldn't be sure. */
  match: { result: "several" | "hired"; candidates: { id: number; name: string; detail: string; created: string; url: string }[] } | null
  preview: { subject: string; body: string }
}) {
  const { pending, run, note } = useAction()
  const [ref, setRef] = React.useState("")
  if (noted)
    return (
      <div className="space-y-3">
        <Hint>
          The booking details are on {noted.matterName} in Clio Grow ({noted.who}).{extra.length ? ` ${extra.join(" ")}` : ""}
        </Hint>
        <Row>
          <OpenLink href={noted.matterUrl} label="Open in Clio Grow" />
        </Row>
      </div>
    )
  return (
    <div className="space-y-3">
      {failed && <p className="text-xs text-destructive">{failed}</p>}
      <Hint>
        {match?.result === "several"
          ? "More than one Grow matter fits this client, so nothing was added on its own. Pick the one for this consult:"
          : match?.result === "hired"
            ? "The client's only Grow matter is a hired one, probably an earlier case. Add the note there, or wait: it is added on its own once a new intake matter appears."
            : "Waiting for the client's matter in Clio Grow (LexiDesk or staff create it). The note is added on its own once it is there. Or paste the matter's Grow link below."}
      </Hint>
      {match && match.candidates.length > 0 && (
        <ul className="space-y-1.5">
          {match.candidates.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/30 px-3 py-2">
              <div className="min-w-0">
                <a href={c.url} target="_blank" rel="noreferrer" className="text-sm text-foreground hover:underline">
                  {c.name}
                </a>
                <p className="truncate text-xs text-muted-foreground">{[c.detail, `opened ${c.created}`].filter(Boolean).join(" · ")}</p>
              </div>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={pending} onClick={() => run(() => addGrowNote(leadId, String(c.id)))}>
                <StickyNote className="h-3.5 w-3.5" /> Add note here
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Row>
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder="Grow matter link or number"
          aria-label="Clio Grow matter link or number"
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring sm:max-w-xs"
        />
        <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={pending || !ref.trim()} onClick={() => run(() => addGrowNote(leadId, ref))}>
          <StickyNote className="h-3.5 w-3.5" /> {pending ? "Adding…" : "Add note"}
        </Button>
      </Row>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Preview the note</summary>
        <div className="mt-1.5">
          <Box>{[preview.subject, preview.body].join("\n\n")}</Box>
        </div>
      </details>
      {note}
    </div>
  )
}

// ── 2. Lexi follow-ups ──────────────────────────────────────────────────────
const LEXIDESK_URL = "https://lexidesk.ai/dashboard"

export function LexiStep({
  leadId,
  conversationUrl,
  clientName,
  result,
}: {
  leadId: string
  /** The LexiDesk conversation Acuity got the booking from, when Lexi booked it. */
  conversationUrl: string | null
  clientName: string
  /** Set once staff have recorded the check. */
  result: "paused" | "none" | null
}) {
  const { pending, run, note } = useAction()
  return (
    <div className="space-y-3">
      <Hint>
        {result === "paused"
          ? "Lexi's follow-ups for this client are paused."
          : result === "none"
            ? "Nothing was pending in Lexi for this client."
            : conversationUrl
              ? "Lexi booked this consult. Open the conversation and, if it shows Scheduled Follow-up Active, click Pause."
              : "Lexi didn't book this one, but the client may have called or chatted with it before. The button copies their name and opens LexiDesk: search it and click Pause on any conversation showing Scheduled Follow-up Active. If nothing comes up for their name, phone or email, they never spoke to Lexi: click Nothing pending."}
      </Hint>
      <Row>
        {conversationUrl ? (
          <OpenLink href={conversationUrl} label="Open in LexiDesk" />
        ) : (
          <CopyAndOpen text={clientName} href={LEXIDESK_URL} label="Copy name & open LexiDesk" copiedLabel="Copied, opening LexiDesk" />
        )}
        {!result && (
          <>
            <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={pending} onClick={() => run(() => markLexiFollowUps(leadId, "paused"))}>
              <PauseCircle className="h-3.5 w-3.5" /> Paused
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={pending} onClick={() => run(() => markLexiFollowUps(leadId, "none"))}>
              Nothing pending
            </Button>
          </>
        )}
      </Row>
      {note}
    </div>
  )
}

// ── 3. Conflict check ───────────────────────────────────────────────────────
export function ConflictStep({
  leadId,
  status,
  closed,
  clientName,
  opposingParty,
}: {
  leadId: string
  status: "pending" | "clear" | "conflict"
  closed: boolean
  clientName: string
  opposingParty: string | null
}) {
  const { pending, run, note } = useAction()
  if (status === "clear") return <Hint>No conflict. The intake can go ahead.</Hint>
  if (status === "conflict") return <Hint>A conflict was found, so the intake stopped here.</Hint>
  return (
    <div className="space-y-3">
      <Hint>
        Open{" "}
        <a href={CLIO_CONFLICT_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
          Clio conflict checks <ExternalLink className="h-3 w-3" />
        </a>
        , click Run conflict check and search these names:
      </Hint>
      <Row>
        <CopyButton text={clientName} label={`Client: ${clientName}`} />
        {opposingParty && <CopyButton text={opposingParty} label={`Opposing: ${opposingParty}`} />}
      </Row>
      {!closed && (
        <Row>
          <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={pending} onClick={() => run(() => setConflictDecision(leadId, "clear"))}>
            <ShieldCheck className="h-3.5 w-3.5" /> No conflict
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => setConflictDecision(leadId, "conflict"))}
            className="h-8 gap-1.5 border-destructive/40 text-xs text-destructive hover:bg-destructive/10"
          >
            <ShieldAlert className="h-3.5 w-3.5" /> Conflict, stop
          </Button>
        </Row>
      )}
      {note}
    </div>
  )
}

// ── 4. Advocate ─────────────────────────────────────────────────────────────
export function AdvocateStep({ leadId, assigned }: { leadId: string; assigned: string | null }) {
  const { pending, run, note } = useAction()
  const [advocate, setAdvocate] = React.useState(assigned ?? "")
  return (
    <div className="space-y-2">
      <Row>
        <select
          value={advocate}
          onChange={(e) => setAdvocate(e.target.value)}
          disabled={pending}
          className="h-8 rounded-md border border-border bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Pick an advocate</option>
          {ADVOCATES.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-xs"
          disabled={pending || !advocate || advocate === assigned}
          onClick={() => run(() => assignAdvocate(leadId, advocate))}
        >
          <UserCheck className="h-3.5 w-3.5" /> Save
        </Button>
      </Row>
      {note}
    </div>
  )
}

// ── 6. Portal invite ────────────────────────────────────────────────────────
export function PortalStep({
  leadId,
  members,
  message,
  sent,
  blocker,
  portalsUrl,
}: {
  leadId: string
  members: { client: string | null; advocate: string | null; attorney: string | null }
  message: string
  sent: boolean
  blocker: string | null
  /** The matter's Communications, Client portals tab in Clio. */
  portalsUrl: string | null
}) {
  const { pending, run, note } = useAction()
  return (
    <div className="space-y-3">
      {/* One line each in a narrow panel; three across when there is room. */}
      <dl className="grid gap-1.5 xl:grid-cols-3">
        {(
          [
            ["Client", members.client],
            ["Advocate", members.advocate],
            ["Attorney", members.attorney],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex min-w-0 items-baseline justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2 xl:block">
            <dt className="shrink-0 text-xs text-muted-foreground xl:text-[11px]">{label}</dt>
            <dd className="truncate text-sm text-foreground" title={value ?? undefined}>{value || "—"}</dd>
          </div>
        ))}
      </dl>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Preview the message</summary>
        <div className="mt-1.5">
          <Box>{message}</Box>
        </div>
      </details>
      {!sent && <Hint>{blocker ?? "Never add Billing Department or Caitlin."}</Hint>}
      <Row>
        {!sent && (
          <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={pending || Boolean(blocker)} onClick={() => run(() => sendPortalInvite(leadId))}>
            <Send className="h-3.5 w-3.5" /> {pending ? "Sending…" : "Send portal invite"}
          </Button>
        )}
        <OpenLink href={portalsUrl} label="Open Client portals" />
        {!sent && (
          <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={pending} onClick={() => run(() => markClientMessage(leadId, "portal"))}>
            Already sent
          </Button>
        )}
      </Row>
      {note}
    </div>
  )
}

// ── 7. Confirmation text ────────────────────────────────────────────────────
export function TextStep({
  leadId,
  text,
  missing,
  sent,
  textsUrl,
}: {
  leadId: string
  text: string | null
  missing: string[]
  sent: boolean
  /** The matter's Communications, Text messages tab in Clio. */
  textsUrl: string | null
}) {
  const { pending, run, note } = useAction()
  if (!text) return <Hint>Needs: {missing.join(", ")}.</Hint>
  return (
    <div className="space-y-3">
      <Box>{text}</Box>
      {!sent && <Hint>The button copies the text and opens this matter&apos;s Text messages in Clio: paste it there (Ctrl+V) and send, then mark it sent here.</Hint>}
      <Row>
        {textsUrl ? <CopyAndOpen text={text} href={textsUrl} /> : <CopyButton text={text} label="Copy text" />}
        {!sent && (
          <Button size="sm" className="h-8 text-xs" disabled={pending} onClick={() => run(() => markClientMessage(leadId, "text"))}>
            Mark sent
          </Button>
        )}
      </Row>
      {note}
    </div>
  )
}

// ── 8. Initial Consultations post ──────────────────────────────────────────
export function SlackStep({
  leadId,
  draft,
  missing,
  posted,
  link,
  blocker,
}: {
  leadId: string
  draft: string | null
  missing: string[]
  posted: boolean
  /** The post in Slack, once there is one. */
  link: string | null
  blocker: string | null
}) {
  const { pending, run, note } = useAction()
  const [text, setText] = React.useState(draft ?? "")
  if (posted)
    return (
      <div className="space-y-3">
        <Hint>Posted in #initialconsultations.</Hint>
        <Row>
          <OpenLink href={link} label="Open in Slack" />
        </Row>
      </div>
    )
  if (!draft) return <Hint>Needs: {missing.join(", ")}.</Hint>
  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={Math.min(18, text.split("\n").length + 1)}
        aria-label="Slack post"
        className="w-full resize-y rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <Hint>{blocker ?? "Check it and edit anything that needs it, the description especially. Posting tags the attorney and the advocate."}</Hint>
      <Row>
        <Button
          size="sm"
          className="h-8 gap-1.5 text-xs"
          disabled={pending || Boolean(blocker) || !text.trim()}
          onClick={() => {
            if (window.confirm("Post this in #initialconsultations?")) run(() => postConsultToSlack(leadId, text))
          }}
        >
          <Send className="h-3.5 w-3.5" /> {pending ? "Posting…" : "Post to #initialconsultations"}
        </Button>
        <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={pending} onClick={() => run(() => markClientMessage(leadId, "slack"))}>
          Already posted
        </Button>
      </Row>
      {note}
    </div>
  )
}

// ── 9. Follow-up tasks ──────────────────────────────────────────────────────
export function TasksStep({
  leadId,
  tasks,
  assignee,
  blocker,
  done,
}: {
  leadId: string
  tasks: { name: string; due: string }[]
  assignee: string | null
  blocker: string | null
  done: boolean
}) {
  const { pending, run, note } = useAction()
  return (
    <div className="space-y-3">
      {tasks.length === 0 ? (
        <Hint>Due dates show once the consult date is known.</Hint>
      ) : (
        <dl className="grid gap-1.5 xl:grid-cols-3">
          {tasks.map((t) => (
            <div key={t.name} className="flex min-w-0 items-baseline justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2 xl:block">
              <dt className="truncate text-sm text-foreground" title={t.name}>{t.name}</dt>
              <dd className="shrink-0 text-xs tabular-nums text-muted-foreground">Due {due(t.due)}</dd>
            </div>
          ))}
        </dl>
      )}
      {!done && (
        <>
          <Hint>{blocker ?? `Assigned to ${assignee} in Clio.`}</Hint>
          <Row>
            <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={pending || Boolean(blocker)} onClick={() => run(() => createFollowUps(leadId))}>
              <ListChecks className="h-3.5 w-3.5" /> {pending ? "Creating…" : "Create tasks in Clio"}
            </Button>
          </Row>
        </>
      )}
      {note}
    </div>
  )
}

// ── 10. Final sign-off ───────────────────────────────────────────────────────
export function SignoffStep({ leadId, approved, blocker }: { leadId: string; approved: boolean; blocker: string | null }) {
  const { pending, run, note } = useAction()
  if (approved) return <Hint>The intake is complete.</Hint>
  return (
    <div className="space-y-2">
      <Row>
        <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={pending || Boolean(blocker)} onClick={() => run(() => approveIntake(leadId))}>
          <BadgeCheck className="h-3.5 w-3.5" /> Approve intake
        </Button>
      </Row>
      {blocker && <Hint>{blocker}</Hint>}
      {note}
    </div>
  )
}
