"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Send,
  User,
  ExternalLink,
  ChevronDown,
  CalendarClock,
  Search,
} from "lucide-react"
import { fileConsultationToClio } from "@/app/actions/meetings"
import { ClioCombobox } from "./clio-combobox"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/status-badge"
import { TimeRangeSelect, useCutoff, withinRange } from "@/components/time-range-select"
import { attorneyStatusMeta } from "@/lib/status"
import { timeAgo, shortDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { SummaryWithIntake } from "@/types/database"

const clioMatterUrl = (id: string) => `https://app.clio.com/nc/#/matters/${id}`

function ExceptionCard({
  item,
  initialOpen = false,
}: {
  item: SummaryWithIntake
  initialOpen?: boolean
}) {
  const router = useRouter()
  const suggested = item.clio_matter_id ?? ""
  const [matter, setMatter] = React.useState(suggested)
  const [open, setOpen] = React.useState(initialOpen)
  const [pending, start] = React.useTransition()
  const cardRef = React.useRef<HTMLDivElement>(null)

  // When the Archive deep-links to this consultation (?open=<id>) it lands here
  // pre-expanded; bring it into view so the attorney sees the card they clicked.
  React.useEffect(() => {
    if (initialOpen && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }, [initialOpen])

  // An override is the attorney landing somewhere other than where the Clio
  // auto-match pointed — including the case where it pointed nowhere at all.
  const wasOverride = matter.trim() !== suggested || !suggested

  function fileIt() {
    if (!matter.trim()) {
      toast.error("Assign a Clio Matter ID first.")
      return
    }
    start(async () => {
      const res = await fileConsultationToClio(item.id, matter, wasOverride)
      if (res.ok) toast.success("Sent to Clio", { description: res.message })
      else toast.error(res.message)
      router.refresh()
    })
  }

  const title = item.intake_transcripts?.file_name ?? "Zoom consultation"

  return (
    <Card
      ref={cardRef}
      className="card-hover overflow-hidden border-l-2 border-l-warning"
    >
      {/* Collapsed by default. A consultation summary runs to several thousand
          characters, so a stack of open cards buries the queue it is meant to
          show — the header alone carries what triage needs. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/40"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/12 text-warning">
          <AlertTriangle className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {item.client_name ?? "Unidentified client"}
            </span>
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarClock className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {timeAgo(item.created_at)} · {title}
            </span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Badge
            variant={suggested ? "muted" : "warning"}
            className="hidden sm:inline-flex"
          >
            {suggested ? suggested : "No matter"}
          </Badge>
          <StatusBadge meta={attorneyStatusMeta[item.attorney_status]} />
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-200",
              open && "rotate-180"
            )}
          />
        </div>
      </button>

      {open && (
        <CardContent className="space-y-4 border-t border-border p-5 pt-4">
          {/* Capped and scrollable: these summaries reach several thousand
              characters and would otherwise push the controls off-screen. */}
          <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {/* Zoom occasionally delivers a consultation with no summary at
                all, and it arrives as an empty string rather than null — so a
                ?? fallback left an empty grey box with no explanation. */}
            {item.summary_text?.trim() ||
              "Zoom did not return a summary for this consultation. The transcript, if one was captured, is on the Historical Archive."}
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* min-w-0 is load-bearing: a flex child defaults to
                min-width:auto, so a long matter name ("ADR Office, - Gerald
                Nivison v Jessica Ann Behnke-Sandkamp") widens this box past the
                card and pushes the file button off the right edge. */}
            <div className="min-w-0 flex-1">
              <ClioCombobox value={matter} onChange={setMatter} />
            </div>
            <Button onClick={fileIt} disabled={pending} className="shrink-0">
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Approve &amp; File to Clio
            </Button>
          </div>

          {/* The filing is done by Make, not by this click — saying otherwise
              would hide a failure behind a row that had already vanished. */}
          <p className="text-xs text-muted-foreground">
            Filing runs in Clio. This consultation clears from the review list
            once Clio confirms the note.
          </p>
        </CardContent>
      )}
    </Card>
  )
}

function ResolvedRow({ item }: { item: SummaryWithIntake }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/60 p-3">
      <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {item.client_name ?? "Client"}
        </p>
        {/* Wraps as whole pieces: on a narrow card the date drops below the
            matter id instead of breaking mid-date. */}
        <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-muted-foreground">
          {item.clio_matter_id ? (
            <a
              href={clioMatterUrl(item.clio_matter_id)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 whitespace-nowrap hover:text-foreground hover:underline"
            >
              {item.clio_matter_id}
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            "No matter"
          )}
          <span className="whitespace-nowrap">· filed {shortDate(item.filed_at)}</span>
        </p>
      </div>
      <StatusBadge meta={attorneyStatusMeta[item.attorney_status]} />
    </div>
  )
}

export function MeetingsClient({ items }: { items: SummaryWithIntake[] }) {
  const searchParams = useSearchParams()
  const openId = searchParams.get("open")
  const [q, setQ] = React.useState("")
  const [range, setRange] = React.useState("all")
  const cutoff = useCutoff(range)

  // Time first, then name search — the same filter order every other list uses.
  const matches = React.useCallback(
    (i: SummaryWithIntake) => {
      if (!withinRange(i.created_at, cutoff)) return false
      if (q.trim()) {
        const hay = `${i.client_name ?? ""} ${i.clio_matter_id ?? ""} ${
          i.intake_transcripts?.file_name ?? ""
        }`.toLowerCase()
        if (!hay.includes(q.trim().toLowerCase())) return false
      }
      return true
    },
    [cutoff, q]
  )

  const exceptions = items.filter(
    (i) =>
      (i.attorney_status === "pending_review" || !i.filed_to_clio) && matches(i)
  )
  const resolved = items.filter(
    (i) =>
      i.filed_to_clio && i.attorney_status !== "pending_review" && matches(i)
  )

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-col gap-2.5 p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by client name, matter ID…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-9 pl-9 text-xs sm:text-sm"
            />
          </div>
          <TimeRangeSelect
            value={range}
            onChange={setRange}
            className="h-9 sm:w-44"
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-serif text-lg font-semibold text-foreground">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Needs Attorney Review
          </h2>
          <Badge variant="warning">{exceptions.length} open</Badge>
        </div>

        {exceptions.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
              <CheckCircle2 className="h-10 w-10 text-success" />
              <p className="font-medium text-foreground">Inbox zero</p>
              <p className="text-sm text-muted-foreground">
                Every consultation has been matched and filed to Clio.
              </p>
            </CardContent>
          </Card>
        ) : (
          exceptions.map((item) => (
            <ExceptionCard
              key={item.id}
              item={item}
              initialOpen={!!openId && item.id === openId}
            />
          ))
        )}
      </div>

      <div className="space-y-3">
        <h2 className="flex items-center gap-2 font-serif text-lg font-semibold text-foreground">
          <CheckCircle2 className="h-5 w-5 text-success" />
          Recently Filed
        </h2>
        {resolved.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing filed yet.</p>
        ) : (
          <div className="space-y-2">
            {resolved.map((item) => (
              <ResolvedRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
