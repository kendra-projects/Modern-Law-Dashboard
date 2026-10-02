import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { createManualLead } from "@/app/actions/intake-leads"
import { OFFICES, METHODS, CONSULT_TYPES } from "@/lib/intake"
import { ACUITY_MATTER_TYPES } from "@/lib/acuity-map"
import { Button } from "@/components/ui/button"
import { SubmitButton } from "@/components/intake/submit-button"

export const dynamic = "force-dynamic"

const inputCls =
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  )
}

export default function NewLeadPage({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/intake"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Intake queue
      </Link>

      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight text-foreground">
          New consultation lead
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          For advocate-scheduled bookings, or to test the queue. Only the name is
          required — everything else can be filled in later.
        </p>
      </div>

      {searchParams.error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Could not save the lead. Please try again.
        </p>
      )}

      <form action={createManualLead} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name">
            <input name="client_first" className={inputCls} autoComplete="off" />
          </Field>
          <Field label="Last name">
            <input name="client_last" className={inputCls} autoComplete="off" />
          </Field>
          <Field label="Email">
            <input name="email" type="email" className={inputCls} autoComplete="off" />
          </Field>
          <Field label="Phone">
            <input name="phone" className={inputCls} autoComplete="off" />
          </Field>
          <Field label="Method">
            <select name="method" className={inputCls} defaultValue="">
              <option value="">—</option>
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Office">
            <select name="office" className={inputCls} defaultValue="">
              <option value="">—</option>
              {OFFICES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Consult type">
            <select name="consult_type" className={inputCls} defaultValue="">
              <option value="">—</option>
              {CONSULT_TYPES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority (0–100)">
            <input
              name="priority_score"
              type="number"
              min={0}
              max={100}
              className={inputCls}
            />
          </Field>
          <Field label="Matter type">
            <select name="matter_type" className={inputCls} defaultValue="">
              <option value="">—</option>
              {ACUITY_MATTER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t === "Terminatino" ? "Termination" : t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Opposing party">
            <input name="opposing_party_name" className={inputCls} autoComplete="off" />
          </Field>
          <Field label="Consulting attorney">
            <input name="consulting_attorney" className={inputCls} autoComplete="off" placeholder="e.g. Hillary Ryan" />
          </Field>
          <Field label="County">
            <input name="county" className={inputCls} autoComplete="off" placeholder="e.g. Maricopa" />
          </Field>
        </div>

        <Field label="Description">
          <textarea
            name="description"
            rows={4}
            className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </Field>

        <div className="flex gap-2">
          <SubmitButton pendingText="Creating…">Create lead</SubmitButton>
          <Button asChild variant="outline">
            <Link href="/intake">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
