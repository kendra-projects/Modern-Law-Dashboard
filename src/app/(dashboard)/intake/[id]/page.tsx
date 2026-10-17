import Link from "next/link"
import { Suspense } from "react"
import { notFound } from "next/navigation"
import { ArrowLeft, CalendarClock, Video, Phone, MapPin, Scale, Briefcase, Mail, Smartphone } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { ClioStep, ClioStepSkeleton } from "@/components/intake/clio-card"
import { GrowStep, LexiStep, ConflictStep, AdvocateStep, PortalStep, TextStep, SlackStep, TasksStep, SignoffStep } from "@/components/intake/lead-steps"
import { LeadView, BookingDetails, type LeadFact } from "@/components/intake/lead-view"
import type { StepState, WorkspaceStep } from "@/components/intake/lead-workspace"
import type { ActivityRow } from "@/components/intake/lead-activity"
import { ClioSyncPing } from "@/components/intake/clio-sync-ping"
import { followUpPlan } from "@/lib/follow-ups"
import { ADVOCATE_CLIO_NAMES, isAdvocate } from "@/lib/intake"
import { CLIO_APP } from "@/lib/clio-intake"
import { describeStep } from "@/lib/intake-steps"
import { confirmationText, consultMethod, portalInviteText, portalMembers } from "@/lib/client-messages"
import { consultLocation } from "@/lib/attorney-zoom"
import { consultPost } from "@/lib/consult-post"
import { growConfigured, growMatterUrl, growNotesApply, growStatus } from "@/lib/grow"
import { growNote, growState, nameDiffers, referredBy } from "@/lib/grow-note"
import { autoIntakeFrom, autoIntakeMode, clioAutoMatter } from "@/lib/auto-intake"
import { conflictAutoOn, savedSearch } from "@/lib/conflict-search"
import { advocateAutoOn } from "@/lib/advocate-auto"
import { mailConfigured } from "@/lib/mail"
import { CONFLICT_EMAIL, conflictEmailTo } from "@/lib/conflict-email"
import { botHandles, botModeFor, type BotKind } from "@/lib/bot"
import type { IntakeStep } from "@/types/database"

export const dynamic = "force-dynamic"
// Clearing the conflict or assigning the advocate can run the automatic
// intake steps (Clio, portal, Slack, tasks) inside that click's request.
export const maxDuration = 60

function fullName(first: string | null, last: string | null) {
  return [first, last].filter(Boolean).join(" ") || "Unknown lead"
}

const TZ = "America/Phoenix"
const when = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(
    new Date(iso)
  )
const day = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric" }).format(new Date(iso))
const dueDay = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" })

export default async function IntakeDetailPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { step?: string }
}) {
  const supabase = await createClient()
  // Independent reads, fetched together.
  const [{ data: lead }, { data: steps }, { data: appts }] = await Promise.all([
    supabase.from("intake_leads").select("*").eq("id", params.id).maybeSingle(),
    supabase
      .from("intake_steps")
      .select("*")
      .eq("lead_id", params.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("appointments")
      .select("datetime, end_time, location, paid:raw->>paid, notes:raw->>notes")
      .eq("lead_id", params.id)
      .eq("canceled", false)
      .order("datetime", { ascending: false })
      .limit(1),
  ])

  if (!lead) notFound()
  const allSteps = (steps ?? []) as IntakeStep[]

  // Who did a step and when: a person, or "Clio" when the sync found the work
  // already done there.
  const lastDone = (key: string) => allSteps.slice().reverse().find((x) => x.step_key === key && x.state === "done")
  const whoOf = (s: IntakeStep) => {
    const d = (s.detail ?? {}) as { by?: string; action?: string }
    if (d.by) return d.by.split("@")[0]
    if (d.action === "detected") return s.step_key.startsWith("slack") ? "Found in Slack" : "Found in Clio"
    if (d.action === "auto") return "Automatic"
    return undefined
  }
  const whoWhen = (key: string) => {
    const s = lastDone(key)
    return s ? [whoOf(s) ?? "Done", day(s.created_at)].join(" · ") : undefined
  }

  const appt = appts?.[0]
  const consultAt = lead.consult_datetime ?? appt?.datetime ?? null
  const closed = ["canceled", "stopped", "failed"].includes(lead.status)
  const halted = lead.status === "canceled" || lead.status === "stopped"
  // The matter's Communications tabs in Clio (tab 2 is Client portals, 3 is Text messages).
  const commsUrl = (tab: number) => (lead.clio_matter_id ? `${CLIO_APP}/matters/${lead.clio_matter_id}/communications?tab=${tab}` : null)
  const { data: office } = lead.office
    ? await supabase.from("office_addresses").select("address").eq("office", lead.office).maybeSingle()
    : { data: null }
  // A self-scheduled Zoom consult has no link in Acuity: use the attorney's room.
  const { location, zoomFromAttorney } = await consultLocation(supabase, lead, appt?.location ?? null)
  const method = consultMethod(lead.method, location)
  const sms = confirmationText({
    firstName: lead.client_first,
    advocate: lead.assigned_advocate,
    datetime: consultAt,
    method,
    location,
    officeAddress: office?.address ?? null,
  })
  // Staff-booked consults carry their description in Acuity's notes; the
  // client's own booking form fills lead.description.
  const post = consultPost({
    lead,
    method,
    start: consultAt,
    end: appt?.end_time ?? null,
    feePaid: appt?.paid ?? null,
    description: lead.description ?? appt?.notes ?? null,
  })
  const slackStep = lastDone("slack_posted")
  const slackLink = (slackStep?.detail as { link?: string } | null)?.link ?? null
  const plan = consultAt ? followUpPlan(consultAt) : []
  const matterName = (lastDone("clio_matter")?.detail as { display?: string } | null)?.display

  // Booking note in Clio Grow: shown once Grow is connected, for bookings that
  // came in after that (or that already have a Grow step). It is added on its
  // own, so it only asks for staff when the matter match wasn't sure.
  const growSteps = allSteps.filter((s) => s.step_key.startsWith("grow_"))
  const showGrow =
    growConfigured() && (growNotesApply(lead.created_at) || growSteps.length > 0) && (await growStatus()).connected
  const grow = growState(growSteps)
  // The skill's check: Acuity and Grow are typed in separately, so a typo or a
  // nickname can split one client into two spellings.
  const growNameDiffers = grow.noted ? nameDiffers(lead.client_first, lead.client_last, grow.noted.clientName) : false
  const growNoted = grow.noted
    ? {
        matterName: grow.noted.matterName ?? `matter #${grow.noted.matterId}`,
        matterUrl: growMatterUrl(grow.noted.matterId),
        who: [grow.noted.by ? grow.noted.by.split("@")[0] : "added automatically", day(grow.noted.at)].join(", "),
        nameWarning: growNameDiffers
          ? `The booking says "${fullName(lead.client_first, lead.client_last)}" but Grow has "${grow.noted.clientName}". Check which spelling is right before the text, the portal invite or the Slack post goes out.`
          : null,
      }
    : null
  const growExtra = [
    lastDone("grow_note_rescheduled") ? "A reschedule note was added too." : null,
    grow.canceled ? "A cancellation note was added too." : null,
  ].filter((x): x is string => Boolean(x))
  // Step numbers in the hints move down one when the Grow step is shown.
  const n = (step: number) => step + (showGrow ? 1 : 0)

  const portalDone = Boolean(lead.clio_portal_id) || Boolean(lastDone("clio_portal_sent"))
  const textDone = Boolean(lastDone("clio_text_sent"))
  const tasksDone = Boolean(lastDone("clio_tasks"))
  const approved = lead.status === "done"
  const needsMatter = !lead.clio_matter_id ? `Needs the Clio matter first (step ${n(5)}).` : null
  const needsClear = lead.conflict_status !== "clear" ? `Clear the conflict check first (step ${n(3)}).` : null
  const clientName = fullName(lead.client_first, lead.client_last)
  // Lexi's follow-ups: the conversation link Acuity carries when Lexi booked
  // the consult, and what staff recorded after checking.
  const lexiUrl = ((lead.raw_payload as { extras?: { lexidesk_conversation_url?: string } } | null)?.extras?.lexidesk_conversation_url ?? null)
  const lexiStep = lastDone("lexi_followups")
  const lexiRaw = (lexiStep?.detail as { result?: string } | null)?.result
  const lexiResult = lexiStep ? (lexiRaw === "none" ? "none" : lexiRaw === "auto" ? "auto" : "paused") : null

  // What the dashboard's conflict search found (lib/conflict-search.ts). The
  // sync this page pings runs it when it is missing or out of date.
  const found = savedSearch(allSteps)
  const conflictSearch = found
    ? {
        when: when(found.at),
        searched: found.searched,
        opposing: found.opposing,
        opposingSkipped: found.opposing_skipped && !found.opposing_skipped.startsWith("The booking names no") ? found.opposing_skipped : null,
        flagged: found.hits.filter((h) => h.flag),
        others: found.hits.filter((h) => !h.flag && !h.self),
        own: found.hits.filter((h) => !h.flag && h.self),
        errors: found.errors,
      }
    : null

  const emailStep = allSteps.find((x) => x.step_key === CONFLICT_EMAIL)
  const conflictEmailed = emailStep
    ? emailStep.state === "done"
      ? `Emailed to ${(emailStep.detail as { to?: string } | null)?.to ?? "Kendra"} on ${when(emailStep.created_at)}.`
      : `The email to ${(emailStep.detail as { to?: string } | null)?.to ?? "Kendra"} didn't go out: ${emailStep.error ?? "unknown error"}`
    : null

  // Who picked the advocate, and why when it was automatic (lib/advocate-auto.ts).
  const advocateStep = lastDone("advocate_assigned")
  const advocateBy = (advocateStep?.detail as { by?: string } | null)?.by
  const advocateWaiting = allSteps.find((x) => x.step_key === "advocate_auto")
  const advocateWhy =
    advocateBy === "Automatic" && isAdvocate(lead.assigned_advocate)
      ? `Picked automatically: ${(advocateStep!.detail as { why?: string }).why ?? ""}`
      : !isAdvocate(lead.assigned_advocate) && advocateWaiting
        ? `Not assigned automatically yet: ${(advocateWaiting.detail as { why?: string } | null)?.why ?? ""}`
        : null

  const yesNo = (v: boolean | null) => (v == null ? null : v ? "Yes" : "No")
  const referrer = referredBy(lead)

  // New Acuity bookings get the API steps done for them (lib/auto-intake.ts).
  const auto =
    autoIntakeMode() === "on" &&
    lead.source === "acuity" &&
    new Date(lead.created_at).getTime() >= new Date(autoIntakeFrom()).getTime()
  const autoLine = auto ? " Done on its own once the conflict check is clear and an advocate is assigned." : ""
  // The two steps with no API are the intake bot's (lib/bot.ts).
  const botLine = (kind: BotKind, what: string) =>
    !botHandles(lead, kind)
      ? ""
      : botModeFor(kind) === "on"
        ? ` The bot ${what} on its own.`
        : " The bot is on a test run: it notes what it would do, and staff still do this step."

  // The intake steps, in the order the work is done.
  const raw: (Omit<WorkspaceStep, "state"> & { ok: boolean | "failed" | "waiting" })[] = [
    {
      key: "booked",
      title: "Booking received",
      ok: true,
      summary: `${lead.source === "acuity" ? "Acuity" : lead.source} · ${day(lead.created_at)}`,
      description: `Booked ${when(lead.created_at)}${lead.source === "acuity" ? " in Acuity" : ""}, as the client gave it.`,
      body: (
        <BookingDetails
          groups={[
            {
              title: "Contact",
              fields: [
                ["Email", lead.email],
                ["Phone", lead.phone],
                ["Referral source", lead.referral_source],
                // Only when the booking names someone; most leads come from Google.
                ...(referrer ? [["Referred by", referrer] as [string, string]] : []),
              ],
            },
            {
              title: "Consult",
              fields: [
                ["When", consultAt ? when(consultAt) : null],
                ["How", method === "in_person" ? `In person${lead.office ? `, ${lead.office}` : ""}` : method === "phone" ? "Phone" : method === "zoom" ? "Zoom" : null],
                ["Type", lead.consult_type === "LSS" ? "Limited-Scope Session" : lead.consult_type === "IC" ? "Initial Consult" : lead.consult_type],
                ["Booked by", lead.self_scheduled == null ? null : lead.self_scheduled ? "The client" : "Staff"],
              ],
            },
            {
              title: "Case",
              fields: [
                ["Matter type", lead.matter_type],
                ["Opposing party", lead.opposing_party_name],
                ["County", lead.county],
                ["Qualified lead", yesNo(lead.qualified)],
              ],
            },
          ]}
          description={lead.description}
        />
      ),
    },
    ...(showGrow
      ? [
          {
            key: "grow",
            title: "Booking note in Clio Grow",
            ok: grow.noted ? true : grow.failed || grow.match?.result === "several" ? false : ("waiting" as const),
            summary: grow.noted
              ? growNameDiffers
                ? "Name differs in Grow"
                : whoWhen("grow_note")
              : grow.match?.result === "several"
                ? "Pick the Grow matter"
                : grow.failed
                  ? "Didn't go through"
                  : "Waiting for the Grow matter",
            description:
              "The booking details as a note on the client's Clio Grow matter, so the team finds everything in Grow. It is added on its own; a moved or canceled consult adds a short note too.",
            body: (
              <GrowStep
                leadId={lead.id}
                noted={growNoted}
                extra={growExtra}
                failed={grow.failed}
                match={
                  grow.match
                    ? {
                        result: grow.match.result,
                        candidates: grow.match.candidates.map((c) => ({ ...c, created: day(c.created_at), url: growMatterUrl(c.id) })),
                      }
                    : null
                }
                preview={growNote("booked", lead, appt ? { end_time: appt.end_time, location, paid: appt.paid, notes: appt.notes } : null, office?.address ?? null)}
              />
            ),
          },
        ]
      : []),
    {
      key: "lexi",
      title: "Pause Lexi follow-ups",
      ok: Boolean(lexiResult),
      summary: lexiStep ? whoWhen("lexi_followups") : lexiUrl ? "Booked by Lexi" : "Not checked",
      description: `Stops LexiDesk's automatic follow-up texts now that staff are handling the client. LexiDesk has no API, so the pause is clicked in LexiDesk.${botLine("lexi", "pauses them")}`,
      body: <LexiStep leadId={lead.id} conversationUrl={lexiUrl} clientName={clientName} result={lexiResult} />,
    },
    {
      key: "conflict",
      title: "Conflict check",
      ok: lead.conflict_status === "clear" ? true : lead.conflict_status === "conflict" ? "failed" : false,
      summary:
        lead.conflict_status === "clear"
          ? whoWhen("conflict_check") ?? "Cleared"
          : lead.conflict_status === "conflict"
            ? "Conflict found"
            : conflictSearch?.flagged.length
              ? `${conflictSearch.flagged.length} to look at`
              : conflictSearch
                ? "Nothing flagged, confirm"
                : "Waiting on the check",
      description: conflictAutoOn()
        ? `The dashboard searches Clio for the client and the opposing party. A clean search clears the check on its own; a match, or a name it couldn't search, waits here for staff to decide${mailConfigured() ? ` and is emailed to ${conflictEmailTo()}` : ""}.`
        : "The dashboard searches Clio for the client and the opposing party and flags what needs a look. Staff decide and record the result here.",
      body: (
        <ConflictStep
          leadId={lead.id}
          status={lead.conflict_status}
          closed={closed}
          clientName={clientName}
          opposingParty={lead.opposing_party_name}
          search={conflictSearch}
          emailed={conflictEmailed}
        />
      ),
    },
    {
      key: "advocate",
      title: "Assign the advocate",
      ok: isAdvocate(lead.assigned_advocate),
      summary: isAdvocate(lead.assigned_advocate)
        ? `${ADVOCATE_CLIO_NAMES[lead.assigned_advocate!]}${advocateBy === "Automatic" ? " (automatic)" : ""}`
        : "Not assigned",
      description: `The advocate signs the confirmation text, joins the client portal and gets the follow-up tasks.${
        advocateAutoOn()
          ? " A booking nobody was assigned to gets the free advocate on its own once the conflict check is clear: not out of office in Slack or on the Clio calendar, and the fewest open consults ahead. Change it here any time."
          : ""
      }`,
      body: <AdvocateStep leadId={lead.id} assigned={isAdvocate(lead.assigned_advocate) ? lead.assigned_advocate : null} why={advocateWhy} />,
    },
    {
      key: "clio",
      title: "Clio contact & matter",
      ok: Boolean(lead.clio_matter_id),
      summary: lead.clio_matter_id ? matterName ?? `Matter #${lead.clio_matter_id}` : "Not in Clio yet",
      description: clioAutoMatter()
        ? `The client's contact and the consult's matter in Clio Manage. A matter staff made in Clio is picked up here on its own.${autoLine}`
        : `The client's contact and the consult's matter. Push the matter from Clio Grow with "Convert to Clio Manage" so Grow and Manage stay linked — the dashboard picks it up here on its own. Use "Create in Clio" only for a lead with no Grow matter.`,
      body: (
        // Clio lookups can take a moment; the rest of the page doesn't wait.
        <Suspense fallback={<ClioStepSkeleton />}>
          <ClioStep lead={lead} />
        </Suspense>
      ),
    },
    {
      key: "portal",
      title: "Client portal invite",
      ok: portalDone,
      summary: portalDone ? whoWhen("clio_portal_sent") ?? "Portal open in Clio" : "Not sent",
      description: `Opens the client's portal in Clio with only the client, the advocate and the attorney, and emails the client the invite.${autoLine}`,
      body: (
        <PortalStep
          leadId={lead.id}
          members={portalMembers(lead)}
          message={portalInviteText(lead.client_first)}
          sent={portalDone}
          portalsUrl={commsUrl(2)}
          blocker={needsClear ?? needsMatter ?? (!lead.consulting_attorney ? "Needs a consulting attorney." : null)}
        />
      ),
    },
    {
      key: "text",
      title: "Confirmation text",
      ok: textDone,
      summary: textDone ? whoWhen("clio_text_sent") : "Not sent",
      description: `The consult confirmation in the firm's wording, sent to the client from Clio Texting.${botLine("text", "sends it from the matter once the conflict check is clear and an advocate is assigned")}`,
      body: (
        <TextStep
          leadId={lead.id}
          text={sms.text}
          missing={sms.missing}
          sent={textDone}
          textsUrl={commsUrl(3)}
          zoomFrom={zoomFromAttorney ? lead.consulting_attorney : null}
        />
      ),
    },
    {
      key: "slack",
      title: "Initial Consultations post",
      ok: Boolean(slackStep),
      summary: slackStep ? whoWhen("slack_posted") : "Not posted",
      description: `Tells the attorney about the consult in Slack's #initialconsultations, in the format the team uses there.${autoLine}`,
      body: <SlackStep leadId={lead.id} draft={post.text} missing={post.missing} posted={Boolean(slackStep)} link={slackLink} blocker={needsClear} />,
    },
    {
      key: "tasks",
      title: "Follow-up tasks",
      ok: tasksDone,
      summary: tasksDone ? whoWhen("clio_tasks") : plan.length ? `Due ${dueDay(plan[0].due)}` : "Waiting on the consult date",
      description: `Three tasks on the Clio matter for the advocate, due one and two business days after the consult.${autoLine}`,
      body: (
        <TasksStep
          leadId={lead.id}
          tasks={plan}
          done={tasksDone}
          assignee={lead.assigned_advocate ? ADVOCATE_CLIO_NAMES[lead.assigned_advocate] ?? lead.assigned_advocate : null}
          blocker={
            needsClear ??
            needsMatter ??
            (!lead.assigned_advocate ? `Assign the advocate first (step ${n(4)}).` : !consultAt ? "The consult date isn't known yet." : null)
          }
        />
      ),
    },
    {
      key: "signoff",
      title: "Final sign-off",
      ok: approved,
      summary: approved ? whoWhen("final_signoff") ?? "Approved" : "Not yet",
      description: auto
        ? "Approved on its own once every step above is done, the text and Lexi included. It then leaves the queue's open list."
        : "Approve the intake once the steps above are done. It then leaves the queue's open list.",
      body: <SignoffStep leadId={lead.id} approved={approved} blocker={closed ? `This lead is ${lead.status}.` : needsClear ?? needsMatter} />,
    },
  ]

  let currentSet = false
  const workspace: WorkspaceStep[] = raw.map(({ ok, ...s }) => {
    let state: StepState
    if (ok === true) state = "done"
    else if (ok === "failed") state = "failed"
    else if (halted) state = "stopped"
    else if (ok === "waiting") state = "waiting"
    else if (!currentSet) {
      state = "current"
      currentSet = true
    } else state = "todo"
    return { ...s, state }
  })

  // The facts staff look for first, on one line under the name.
  const MethodIcon = method === "phone" ? Phone : method === "in_person" ? MapPin : Video
  const facts: LeadFact[] = [
    consultAt ? { icon: CalendarClock, text: when(consultAt) } : null,
    method ? { icon: MethodIcon, text: method === "in_person" ? "In person" : method === "phone" ? "Phone" : "Zoom" } : null,
    lead.matter_type ? { icon: Briefcase, text: lead.matter_type } : null,
    lead.consulting_attorney ? { icon: Scale, text: lead.consulting_attorney } : null,
    lead.phone ? { icon: Smartphone, text: lead.phone, href: `tel:${lead.phone.replace(/[^\d+]/g, "")}` } : null,
    lead.email ? { icon: Mail, text: lead.email, href: `mailto:${lead.email}` } : null,
  ].filter((f): f is LeadFact => Boolean(f))

  const activity: ActivityRow[] = [
    { id: "created", text: "Lead received", at: lead.created_at, state: "done" },
    ...allSteps.map((s) => ({ id: s.id, text: describeStep(s), at: s.created_at, by: whoOf(s), state: s.state, error: s.error })),
  ]

  return (
    <div className="space-y-4">
      {/* Picks up work staff did straight in Clio, then refreshes this page. */}
      <ClioSyncPing leadId={lead.id} />
      <Link
        href="/intake"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Intake queue
      </Link>

      <LeadView
        name={clientName}
        status={lead.status.replace(/_/g, " ")}
        facts={facts}
        steps={workspace}
        note={halted ? `This lead is ${lead.status}. Nothing further will run for it.` : undefined}
        activity={activity}
        initialStep={searchParams.step}
      />
    </div>
  )
}
