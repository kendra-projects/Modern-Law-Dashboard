// Shared, API-free constants for the consultation-intake UI. These are hand-set
// choices (who the advocates are, which offices exist) that the human-gate UI
// and the manual-lead form both read, so they can't drift apart.

/**
 * The advocates a lead can be handed to at the assignment gate. Matches Acuity's
 * "Intake by which Team Member" options (field 12016550): the four named intake
 * staff. "Other"/"Client" there are not real advocates, so they're left out.
 */
export const ADVOCATES = ["Shane", "Mia", "Mandie", "Linda"] as const

/** One of the four advocates (Acuity's "Client" and "Other" are not). */
export const isAdvocate = (name: string | null | undefined) => Boolean(name && (ADVOCATES as readonly string[]).includes(name))

/** Each advocate's Clio user (the client portal needs the firm-user record). */
export const ADVOCATE_CLIO_NAMES: Record<string, string> = {
  Shane: "Shane Harper",
  Mia: "Mia Damon",
  Mandie: "Mandie Alean",
  Linda: "Linda Diamond",
}

/**
 * Physical offices. Confirmed against the live Acuity account: only Mesa, Peoria
 * and Tucson exist — there is NO Scottsdale. A virtual consult isn't an office;
 * it's method = zoom with office left empty.
 */
export const OFFICES: { value: "mesa" | "peoria" | "tucson"; label: string }[] = [
  { value: "mesa", label: "Mesa" },
  { value: "peoria", label: "Peoria" },
  { value: "tucson", label: "Tucson" },
]

/** How the consult happens. */
export const METHODS: { value: "zoom" | "phone" | "in_person"; label: string }[] = [
  { value: "zoom", label: "Zoom" },
  { value: "phone", label: "Phone" },
  { value: "in_person", label: "In person" },
]

/** Consultation type: Initial Consult vs Limited-Scope Session. */
export const CONSULT_TYPES: { value: "IC" | "LSS"; label: string }[] = [
  { value: "IC", label: "IC — Initial Consult" },
  { value: "LSS", label: "LSS — Limited-Scope Session" },
]

/**
 * Clio has no conflict-check API, so staff run it in Clio itself. This opens
 * Clio Manage's Conflict checks page.
 */
export const CLIO_CONFLICT_URL = "https://app.clio.com/conflict_checks"
