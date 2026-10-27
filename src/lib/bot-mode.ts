// Which of the intake bot's jobs run, and how (lib/bot.ts). Kept apart from
// lib/bot.ts so the automatic intake can ask without importing the bot itself.
//
// BOT_MODE=on lets the bot click; BOT_MODE=dry sends it through the same pages
// without the clicks that change anything (a test run, recorded on the lead);
// anything else gives it nothing to do. BOT_<JOB>_MODE sets one job's mode on
// its own. BOT_KINDS lists the jobs that run at all: "lexi", "text", "grow",
// "portal" (comma separated). A job not in BOT_KINDS does nothing, whatever
// its mode.

export type BotMode = "off" | "dry" | "on"
export type BotKind = "lexi" | "text" | "grow" | "portal"
export const BOT_KIND_LIST: readonly BotKind[] = ["lexi", "text", "grow", "portal"]

export function botMode(): BotMode {
  const v = (process.env.BOT_MODE ?? "").trim().toLowerCase()
  return v === "on" || v === "dry" ? v : "off"
}

/** One job's mode: BOT_<JOB>_MODE when set, else BOT_MODE. */
export function botModeFor(kind: BotKind): BotMode {
  const v = (process.env[`BOT_${kind.toUpperCase()}_MODE`] ?? "").trim().toLowerCase()
  return v === "on" || v === "dry" || v === "off" ? v : botMode()
}

export function botKinds(): BotKind[] {
  const v = (process.env.BOT_KINDS ?? "lexi").toLowerCase()
  return BOT_KIND_LIST.filter((k) => v.includes(k))
}

/** The job is listed in BOT_KINDS and set to "on" (not a test run). */
export const botJobLive = (kind: BotKind) => botKinds().includes(kind) && botModeFor(kind) === "on"
