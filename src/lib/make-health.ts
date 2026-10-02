import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Make.com health poller.
 *
 * Why the Make API and not the error emails Make sends to the client's inbox:
 * Make only emails when a scenario itself FAILS. Our resilient 2.0 design
 * deliberately catches publisher errors (`onerror -> enqueue to retry_queue ->
 * Ignore`), so those runs finish as SUCCESS and never generate an email — i.e.
 * the failures we care about most would be invisible to an inbox watcher. The
 * API instead returns the error class, message and the exact failing module,
 * for every scenario, without editing a single one of them.
 *
 * Two layers now cover failures:
 *   retry_queue  — handled publisher failures (detailed, retryable)
 *   this poller  — hard scenario failures, including the scenarios nobody
 *                  instrumented (Zoom/Clio stack, GBP publisher, Clio Grow…)
 */

const DEFAULT_BASE = "https://us2.make.com/api/v2"
const DEFAULT_TEAM_ID = "1555038"

/** Marks rows this poller wrote, so it can dedupe its own inserts. */
export const POLLER_SOURCE = "make-api-poller"

/** Make execution status codes seen in this account's data. */
const STATUS_WARNING = 2
const STATUS_ERROR = 3

export interface SyncOptions {
  /** Only consider executions newer than this many hours. Default 24. */
  lookbackHours?: number
  /** Executions to pull per scenario. Default 20. */
  perScenario?: number
  /** Report what would be written without writing. */
  dryRun?: boolean
  /**
   * Supabase client to write with. A signed-in dashboard user can insert
   * `system_logs` under the normal authenticated-only RLS policies, so the
   * viewer-driven sync passes its session client here and needs no privileged
   * key at all. Only the unattended scheduler — which has no session — falls
   * back to the service_role client.
   */
  client?: SupabaseWriter | null
}

/** The narrow slice of the Supabase client this module actually uses. */
type SupabaseWriter = {
  from: (table: "system_logs") => {
    select: (cols: string) => {
      filter: (
        col: string,
        op: string,
        val: string
      ) => {
        gte: (
          col: string,
          val: string
        ) => {
          limit: (n: number) => PromiseLike<{
            data: Array<{ details: unknown }> | null
            error: { message: string } | null
          }>
        }
      }
    }
    insert: (rows: unknown[]) => PromiseLike<{
      error: { message: string } | null
    }>
  }
}

export interface SyncResult {
  ok: boolean
  message: string
  scenariosScanned: number
  failuresFound: number
  inserted: number
  alreadyRecorded: number
  warnings: string[]
}

interface MakeScenario {
  id: number
  name: string
  isActive?: boolean
  dlqCount?: number
}

interface MakeExecution {
  id?: string
  imtId?: string
  status?: number
  timestamp?: string
  duration?: number
  operations?: number
  error?: {
    name?: string
    message?: string
    causeModule?: { name?: string; appName?: string }
  }
}

function config() {
  const token = process.env.MAKE_API_TOKEN
  const base = (process.env.MAKE_API_BASE || DEFAULT_BASE).replace(/\/+$/, "")
  const teamId = process.env.MAKE_TEAM_ID || DEFAULT_TEAM_ID
  return { token, base, teamId }
}

async function makeGet<T>(
  url: string,
  token: string
): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Token ${token}` },
      cache: "no-store",
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      return {
        data: null,
        error: `${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`,
      }
    }
    return { data: (await res.json()) as T, error: null }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Make wraps list responses in a named key; accept the plain array too.
 *
 * `recognised` matters more than it looks: if Make ever renames the wrapper,
 * a silent `[]` would make this poller cheerfully report "no failures" forever
 * — the worst possible failure mode for a monitor. Callers surface the
 * unrecognised shape as a warning instead.
 */
function unwrap<T>(
  payload: unknown,
  ...keys: string[]
): { items: T[]; recognised: boolean } {
  if (Array.isArray(payload)) return { items: payload as T[], recognised: true }
  if (payload && typeof payload === "object") {
    for (const k of keys) {
      const v = (payload as Record<string, unknown>)[k]
      if (Array.isArray(v)) return { items: v as T[], recognised: true }
    }
    return { items: [], recognised: false }
  }
  return { items: [], recognised: false }
}

/** Names the keys actually present, so a shape change is debuggable. */
function shapeOf(payload: unknown): string {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return Object.keys(payload).slice(0, 6).join(", ") || "(empty object)"
  }
  return typeof payload
}

function isFailure(x: MakeExecution): boolean {
  return !!x.error || x.status === STATUS_ERROR || x.status === STATUS_WARNING
}

function executionKey(x: MakeExecution): string | null {
  // `id` is the 32-char execution hash; `imtId` is "<epoch>_<id>".
  if (x.id) return x.id
  if (x.imtId) return x.imtId.split("_").pop() || x.imtId
  return null
}

/**
 * Pulls recent failed executions for every scenario in the team and records the
 * new ones in `system_logs`, where the dashboard's Activity & Logs page already
 * renders them. Idempotent: an execution is only ever logged once.
 */
export async function syncMakeHealth(
  opts: SyncOptions = {}
): Promise<SyncResult> {
  const {
    lookbackHours = 24,
    perScenario = 20,
    dryRun = false,
    client = null,
  } = opts
  const warnings: string[] = []
  const empty = {
    scenariosScanned: 0,
    failuresFound: 0,
    inserted: 0,
    alreadyRecorded: 0,
  }

  const { token, base, teamId } = config()
  if (!token) {
    return {
      ok: false,
      message: "MAKE_API_TOKEN is not set — nothing to poll.",
      ...empty,
      warnings,
    }
  }

  const supabase = client ?? (createAdminClient() as SupabaseWriter | null)
  if (!supabase) {
    return {
      ok: false,
      message:
        "No way to write system_logs: this run has no user session, and SUPABASE_SERVICE_ROLE_KEY is not set for the unattended path.",
      ...empty,
      warnings,
    }
  }

  // 1. One call returns every scenario in the team (id, name, isActive).
  const scenariosRes = await makeGet<unknown>(
    `${base}/scenarios?teamId=${encodeURIComponent(teamId)}&pg%5Blimit%5D=100`,
    token
  )
  if (scenariosRes.error) {
    return {
      ok: false,
      message: `Make API /scenarios failed: ${scenariosRes.error}`,
      ...empty,
      warnings,
    }
  }

  const scenarioList = unwrap<MakeScenario>(scenariosRes.data, "scenarios")
  if (!scenarioList.recognised) {
    return {
      ok: false,
      message: `Make API /scenarios returned an unexpected shape (keys: ${shapeOf(scenariosRes.data)}). The poller cannot read it — the response format likely changed.`,
      ...empty,
      warnings,
    }
  }

  // Inactive scenarios can't produce new runs; a non-zero DLQ still deserves a
  // look, since that is exactly a scenario that broke and got switched off.
  const targets = scenarioList.items.filter(
    (s) => s.isActive || (s.dlqCount ?? 0) > 0
  )

  const cutoff = Date.now() - lookbackHours * 3600_000
  const failures: Array<{ scenario: MakeScenario; run: MakeExecution }> = []

  // 2. Only the scenarios that can actually have new runs get a second call.
  for (const s of targets) {
    const runsRes = await makeGet<unknown>(
      `${base}/scenarios/${s.id}/logs?pg%5Blimit%5D=${perScenario}`,
      token
    )
    if (runsRes.error) {
      warnings.push(`scenario ${s.id} (${s.name}): ${runsRes.error}`)
      continue
    }
    const runs = unwrap<MakeExecution>(
      runsRes.data,
      "scenarioLogs",
      "logs",
      "executions"
    )
    if (!runs.recognised) {
      warnings.push(
        `scenario ${s.id} (${s.name}): unreadable execution response (keys: ${shapeOf(runsRes.data)})`
      )
      continue
    }

    for (const run of runs.items) {
      if (!isFailure(run)) continue
      const at = run.timestamp ? Date.parse(run.timestamp) : NaN
      if (Number.isFinite(at) && at < cutoff) continue
      if (!executionKey(run)) continue
      failures.push({ scenario: s, run })
    }
  }

  if (failures.length === 0) {
    // "Nothing found" is only good news if we could actually read every
    // scenario. If some came back unreadable, say so rather than implying all
    // is well.
    const blind = warnings.length
    return {
      ok: blind === 0,
      message:
        blind === 0
          ? `No failed Make executions in the last ${lookbackHours}h.`
          : `Found no failures, but ${blind} of ${targets.length} scenario(s) could not be read — this result is incomplete.`,
      scenariosScanned: targets.length,
      failuresFound: 0,
      inserted: 0,
      alreadyRecorded: 0,
      warnings,
    }
  }

  // 3. Skip anything this poller already logged.
  const { data: seenRows, error: seenErr } = await supabase
    .from("system_logs")
    .select("details")
    .filter("details->>source", "eq", POLLER_SOURCE)
    .gte("created_at", new Date(cutoff - 3600_000).toISOString())
    .limit(1000)

  if (seenErr) {
    return {
      ok: false,
      message: `Could not read existing system_logs: ${seenErr.message}`,
      scenariosScanned: targets.length,
      failuresFound: failures.length,
      inserted: 0,
      alreadyRecorded: 0,
      warnings,
    }
  }

  const seen = new Set(
    (seenRows ?? [])
      .map((r) => {
        const d = r.details as Record<string, unknown> | null
        return typeof d?.execution_id === "string" ? d.execution_id : null
      })
      .filter((v): v is string => !!v)
  )

  const fresh = failures.filter((f) => !seen.has(executionKey(f.run)!))
  const alreadyRecorded = failures.length - fresh.length

  if (fresh.length === 0) {
    return {
      ok: true,
      message: `All ${failures.length} recent failures were already logged.`,
      scenariosScanned: targets.length,
      failuresFound: failures.length,
      inserted: 0,
      alreadyRecorded,
      warnings,
    }
  }

  const rows = fresh.map(({ scenario, run }) => {
    const key = executionKey(run)!
    const err = run.error
    const mod = err?.causeModule
    const where = mod?.appName
      ? ` (${mod.appName}${mod.name ? ` · ${mod.name}` : ""})`
      : ""
    const headline =
      err?.message?.trim() ||
      (run.status === STATUS_WARNING
        ? "Run finished with a warning"
        : "Run failed")

    return {
      scenario_name: scenario.name?.trim() || `Make scenario ${scenario.id}`,
      event_type: (run.status === STATUS_WARNING ? "warning" : "error") as
        | "warning"
        | "error",
      message: `${headline}${where}`,
      details: {
        source: POLLER_SOURCE,
        execution_id: key,
        scenario_id: scenario.id,
        error_name: err?.name ?? null,
        module: mod?.name ?? null,
        app: mod?.appName ?? null,
        operations: run.operations ?? null,
        duration_ms: run.duration ?? null,
        occurred_at: run.timestamp ?? null,
      },
      status: "logged" as const,
      // Keep Make's own timestamp so the timeline orders correctly.
      created_at: run.timestamp ?? new Date().toISOString(),
    }
  })

  if (dryRun) {
    return {
      ok: true,
      message: `Dry run — would insert ${rows.length} row(s).`,
      scenariosScanned: targets.length,
      failuresFound: failures.length,
      inserted: 0,
      alreadyRecorded,
      warnings,
    }
  }

  const { error: insertErr } = await supabase.from("system_logs").insert(rows)
  if (insertErr) {
    return {
      ok: false,
      message: `Insert into system_logs failed: ${insertErr.message}`,
      scenariosScanned: targets.length,
      failuresFound: failures.length,
      inserted: 0,
      alreadyRecorded,
      warnings,
    }
  }

  return {
    ok: true,
    message: `Logged ${rows.length} new Make failure(s).`,
    scenariosScanned: targets.length,
    failuresFound: failures.length,
    inserted: rows.length,
    alreadyRecorded,
    warnings,
  }
}
