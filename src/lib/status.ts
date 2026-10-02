import type { BadgeProps } from "@/components/ui/badge"
import type {
  IntakeStatus,
  AttorneyStatus,
  SocialStatus,
  WordpressStatus,
  LogEventType,
  LogStatus,
  RetryStatus,
} from "@/types/database"

type BadgeVariant = NonNullable<BadgeProps["variant"]>

export interface StatusMeta {
  label: string
  variant: BadgeVariant
  dot: string // tailwind bg-* color for indicator dots
}

export const intakeStatusMeta: Record<IntakeStatus, StatusMeta> = {
  pending: { label: "Pending", variant: "muted", dot: "bg-muted-foreground" },
  processing: { label: "Processing", variant: "warning", dot: "bg-warning" },
  completed: { label: "Completed", variant: "success", dot: "bg-success" },
  failed: { label: "Failed", variant: "destructive", dot: "bg-destructive" },
}

export const attorneyStatusMeta: Record<AttorneyStatus, StatusMeta> = {
  pending_review: {
    label: "Pending Review",
    variant: "warning",
    dot: "bg-warning",
  },
  approved: { label: "Approved", variant: "success", dot: "bg-success" },
  overridden: { label: "Overridden", variant: "accent", dot: "bg-accent" },
}

export const socialStatusMeta: Record<SocialStatus, StatusMeta> = {
  pending: { label: "Pending", variant: "muted", dot: "bg-muted-foreground" },
  published: { label: "Published", variant: "success", dot: "bg-success" },
  failed: { label: "Failed", variant: "destructive", dot: "bg-destructive" },
}

export const wordpressStatusMeta: Record<WordpressStatus, StatusMeta> = {
  draft: { label: "Draft", variant: "muted", dot: "bg-muted-foreground" },
  published: { label: "Published", variant: "success", dot: "bg-success" },
  failed: { label: "Failed", variant: "destructive", dot: "bg-destructive" },
}

export const logEventMeta: Record<LogEventType, StatusMeta> = {
  info: { label: "Info", variant: "muted", dot: "bg-muted-foreground" },
  warning: { label: "Warning", variant: "warning", dot: "bg-warning" },
  error: { label: "Error", variant: "destructive", dot: "bg-destructive" },
}

export const logStatusMeta: Record<LogStatus, StatusMeta> = {
  logged: { label: "Logged", variant: "muted", dot: "bg-muted-foreground" },
  retrying: { label: "Retrying", variant: "warning", dot: "bg-warning" },
  resolved: { label: "Resolved", variant: "success", dot: "bg-success" },
}

export const retryStatusMeta: Record<RetryStatus, StatusMeta> = {
  failed: { label: "Failed", variant: "destructive", dot: "bg-destructive" },
  retrying: { label: "Retrying", variant: "warning", dot: "bg-warning" },
  resolved: { label: "Resolved", variant: "success", dot: "bg-success" },
  needs_attention: {
    label: "Needs attention",
    variant: "destructive",
    dot: "bg-destructive",
  },
}


// ── Unified episode lifecycle ────────────────────────────────────────────────
// One canonical status used EVERYWHERE an episode/upload is shown (archive
// table, detail drawer, recent-uploads, overview stream) so the same record can
// never read "Published" in one place and "Pending" in another. It is derived
// from the real platform-publish statuses + the intake status, so a success that
// arrives via the recovery drainer (which patches the *_status columns) is
// reflected immediately, with no dependence on any single writeback.
export type LifecycleStatus =
  | "pending"
  | "processing"
  | "drafted"
  | "published"
  | "failed"

export const lifecycleMeta: Record<LifecycleStatus, StatusMeta> = {
  pending: { label: "Pending", variant: "muted", dot: "bg-muted-foreground" },
  processing: { label: "Processing", variant: "warning", dot: "bg-warning" },
  drafted: { label: "Drafted", variant: "accent", dot: "bg-accent" },
  published: { label: "Published", variant: "success", dot: "bg-success" },
  failed: { label: "Failed", variant: "destructive", dot: "bg-destructive" },
}

export function deriveEpisodeStatus(input: {
  wordpressStatus?: WordpressStatus | null
  youtubeStatus?: SocialStatus | null
  instagramStatus?: SocialStatus | null
  facebookStatus?: SocialStatus | null
  intakeStatus?: IntakeStatus | null
  /** Show name — decides which platforms are actually targeted. Business of Law
   * only publishes to YouTube + WordPress, so Instagram/Facebook must NOT be
   * required for it to read "Published" (they stay pending forever otherwise).
   * Modern Law publishes to all four. */
  showName?: string | null
  /** true when a platform exhausted all recovery retries (retry_queue row is
   * needs_attention) — a permanent failure that should read Failed, not stay
   * stuck on Processing forever. */
  retriesExhausted?: boolean
  /** WordPress post id — set once the blog draft has been created on WordPress.
   * Presence = a draft exists to review. */
  wordpressPostId?: string | null
  /** WordPress live URL — only filled once the blog is actually PUBLISHED on
   * WordPress (via the dashboard's "Mark as published"). Presence = live. */
  wordpressUrl?: string | null
  /** Blogs page only: that page is about the blog itself, so a drafted/published
   * blog must read "Drafted"/"Published" even if a downstream social platform
   * failed. The Archive / Overview keep failure-first (a permanent platform
   * failure reads "Failed"). */
  preferBlogState?: boolean
}): LifecycleStatus {
  // Business of Law is a YouTube + WordPress show only — Instagram/Facebook do
  // not apply, so we exclude them from the social checks.
  const businessOfLaw = (input.showName ?? "")
    .toLowerCase()
    .includes("business of law")
  const socials = businessOfLaw
    ? [input.youtubeStatus]
    : [input.youtubeStatus, input.instagramStatus, input.facebookStatus]

  // The blog is the primary artefact this status describes. WordPress blogs are
  // created as DRAFTS for review; "Live" = a real published URL was written back
  // (via the dashboard's Mark-as-published).
  const wpLive = !!input.wordpressUrl?.trim()
  const wpDraft = !!input.wordpressPostId?.trim()

  // Blogs page: the blog's own state wins — a finished draft/post is never
  // relabelled "Failed" just because a social platform failed (that surfaces in
  // the Archive / Recovery instead).
  if (input.preferBlogState) {
    if (wpLive) return "published"
    if (wpDraft) return "drafted"
  }

  // A PERMANENT failure surfaces as Failed even when a blog draft/post exists.
  // (Product decision: a platform whose recovery retries are exhausted, or an
  // explicit failed status, must read at the headline — not only in the
  // Publishing tab / Recovery Queue.) retriesExhausted is a settled signal
  // (retry_queue needs-attention), so this does not fire on transient misses.
  if (
    input.retriesExhausted ||
    socials.some((s) => s === "failed") ||
    input.wordpressStatus === "failed" ||
    input.intakeStatus === "failed"
  )
    return "failed"

  // Otherwise the blog's WordPress post — live or draft — is the truthful state.
  if (wpLive) return "published"
  if (wpDraft) return "drafted"

  // Work has started or is partially out, but the blog is not made yet.
  if (
    socials.some((s) => s === "published") ||
    input.intakeStatus === "processing" ||
    input.intakeStatus === "completed"
  )
    return "processing"
  return "pending"
}
