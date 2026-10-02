import { ExternalLink, UserRound, UserPlus, Briefcase, CheckCircle2 } from "lucide-react"
import type { IntakeLead } from "@/types/database"
import { CLIO_APP, lookupLeadInClio, matterDescription, practiceAreaName, type ClioMatter } from "@/lib/clio-intake"
import { Skeleton } from "@/components/ui/skeleton"
import { ClioCreateButton } from "@/components/intake/clio-create-button"
import { cn } from "@/lib/utils"

// Step 4 of the lead page: is this person in Clio, which matter is the
// consult's, what the Clio entry holds, and (when nothing is linked yet) what
// "Create in Clio" will do. Rendering only reads Clio; the write is the button.
// Built for the step panel: names wrap instead of being cut off.

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{children}</p>
)

function Tile({
  href,
  icon: Icon,
  tone,
  title,
  meta,
  tag,
}: {
  href?: string
  icon: typeof UserRound
  tone: "success" | "muted" | "primary"
  title: string
  meta?: string
  tag?: string
}) {
  const body = (
    <>
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          tone === "success" && "bg-success/15 text-success",
          tone === "primary" && "bg-primary/15 text-primary",
          tone === "muted" && "bg-muted text-muted-foreground"
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-snug text-foreground [overflow-wrap:anywhere]">{title}</span>
        {meta && <span className="mt-0.5 block text-xs text-muted-foreground">{meta}</span>}
        {tag && (
          <span className="mt-1.5 inline-block rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">{tag}</span>
        )}
      </span>
      {href && <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />}
    </>
  )
  const cls = "group flex items-start gap-3 rounded-lg border px-3 py-2.5"
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(cls, "border-border/70 transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
    >
      {body}
    </a>
  ) : (
    <div className={cn(cls, "border-dashed border-border")}>{body}</div>
  )
}

const matterMeta = (m: ClioMatter) => [m.status, m.practice_area?.name, `opened ${fmtDate(m.created_at)}`].filter(Boolean).join(" · ")

export async function ClioStep({ lead }: { lead: IntakeLead }) {
  const r = await lookupLeadInClio(lead)
  const linkedId = lead.clio_matter_id
  const closed = lead.status === "canceled" || lead.status === "stopped"
  const leadName = [lead.client_first, lead.client_last].filter(Boolean).join(" ") || "the client"

  if (r.state === "not_connected")
    return <p className="text-sm text-muted-foreground">Clio isn&apos;t connected. Connect it in Intake Settings.</p>
  if (r.state === "error") return <p className="text-sm text-destructive">Couldn&apos;t reach Clio: {r.message}</p>

  const linked = r.matters.find((m) => String(m.id) === linkedId) ?? null
  // The consult's matter: the linked one, or the recent one Create in Clio would reuse.
  const consultMatter = linked ?? (!linkedId ? r.recentMatter : null)
  const others = r.matters.filter((m) => m.id !== consultMatter?.id)

  const entry: [string, string | null | undefined][] = linkedId
    ? [
        ["Contact", r.contact?.name],
        ["Matter", linked?.display_number ?? `#${linkedId}`],
        ["Practice area", linked?.practice_area?.name],
        ["Opposing party", lead.opposing_party_name],
        ["County", lead.county],
        ["Status", linked?.status ?? "Pending"],
      ]
    : [
        ["Contact", r.contact ? `Reuse ${r.contact.name}` : `Create ${leadName}`],
        ["Matter", r.recentMatter ? `Reuse ${r.recentMatter.display_number}` : `Create "${matterDescription(lead)}"`],
        ["Practice area", r.recentMatter ? r.recentMatter.practice_area?.name : practiceAreaName(lead.matter_type) ?? lead.matter_type],
        ["Opposing party", lead.opposing_party_name],
        ["County", lead.county],
        ["Status", "Pending"],
      ]

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <Label>Contact</Label>
          {r.contact ? (
            <Tile
              href={`${CLIO_APP}/contacts/${r.contact.id}`}
              icon={UserRound}
              tone="success"
              title={r.contact.name}
              meta={`Matched by ${r.matchedBy} · added ${fmtDate(r.contact.created_at)}${r.contact.is_client ? " · client" : ""}`}
            />
          ) : (
            <Tile icon={UserPlus} tone="muted" title="Not in Clio yet" meta={`Create in Clio adds ${leadName}.`} />
          )}
        </div>

        <div className="min-w-0">
          <Label>Consult matter</Label>
          {consultMatter ? (
            <Tile
              href={`${CLIO_APP}/matters/${consultMatter.id}`}
              icon={Briefcase}
              tone="primary"
              title={consultMatter.display_number}
              meta={matterMeta(consultMatter)}
              tag={linked ? "This consult" : "Will be reused"}
            />
          ) : (
            <Tile icon={Briefcase} tone="muted" title="No matter yet" meta={`Create in Clio opens "${matterDescription(lead)}".`} />
          )}
        </div>
      </div>

      {others.length > 0 && (
        <div>
          <Label>Their other matters ({others.length})</Label>
          <ul className="grid gap-2 sm:grid-cols-2">
            {others.slice(0, 4).map((m) => (
              <li key={m.id} className="min-w-0">
                <Tile href={`${CLIO_APP}/matters/${m.id}`} icon={Briefcase} tone="muted" title={m.display_number} meta={matterMeta(m)} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <Label>{linkedId ? "In Clio" : "Create in Clio will set"}</Label>
        <dl className="grid gap-x-6 gap-y-2.5 rounded-lg bg-muted/30 px-4 py-3 sm:grid-cols-2">
          {entry.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-sm text-foreground [overflow-wrap:anywhere]">{value || "—"}</dd>
            </div>
          ))}
        </dl>
      </div>

      {linkedId ? (
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" />
          Linked to Clio matter
          <a href={`${CLIO_APP}/matters/${linkedId}`} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            #{linkedId}
          </a>
        </p>
      ) : closed ? (
        <p className="text-sm text-muted-foreground">This lead is {lead.status}, so nothing will be created.</p>
      ) : (
        <ClioCreateButton leadId={lead.id} />
      )}
    </div>
  )
}

/** Placeholder while Clio answers. */
export function ClioStepSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        ))}
      </div>
      <Skeleton className="h-28 w-full rounded-lg" />
    </div>
  )
}
