"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import type { NavSignals } from "@/lib/signals"

/**
 * Turns "what exists" (from the server) into "what YOU have not seen yet".
 *
 * The read receipt lives in this browser's localStorage rather than in the
 * database, because that is what the signal actually means: this person, on
 * this machine, has looked. Two people sharing the login should not clear each
 * other's dots, and it should not cost a database write per page view.
 *
 * Everything that already existed the first time this runs is treated as read.
 * Lighting up all seven rows on the client's first login would teach them to
 * ignore the dot before it had told them anything.
 */

const STORAGE_KEY = "nav-seen:v1"

/** Red rather than amber: these mean something is broken, not merely new. */
const ALERT_ROUTES = new Set(["/recovery", "/logs", "/intake/recovery", "/intake/activity"])

/** Past this the badge reads "40+"; it matches the server's window. */
const WINDOW = 40

type SeenMap = Record<string, number>

interface SignalsApi {
  countFor: (href: string) => number
  toneFor: (href: string) => "new" | "alert"
}

const SignalsContext = React.createContext<SignalsApi>({
  countFor: () => 0,
  toneFor: () => "new",
})

function read(): SeenMap {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === "object" ? (parsed as SeenMap) : {}
  } catch {
    // Private window or blocked storage — badges just never persist.
    return {}
  }
}

function write(map: SeenMap) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Nothing to do: worst case the dot comes back on the next load.
  }
}

/** The nav section a URL belongs to — longest match, so /archive/x still counts. */
function sectionFor(pathname: string, hrefs: string[]): string | null {
  return (
    [...hrefs]
      .sort((a, b) => b.length - a.length)
      .find((h) => pathname === h || pathname.startsWith(h + "/")) ?? null
  )
}

export function NavSignalsProvider({
  signals,
  children,
}: {
  signals: NavSignals
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [seen, setSeen] = React.useState<SeenMap | null>(null)

  // Hydrate once. Until this lands, seen is null and no badge renders — which
  // also keeps the server and client markup identical on first paint.
  const hrefsRef = React.useRef(Object.keys(signals))
  React.useEffect(() => {
    const stored = read()
    const now = Date.now()
    let changed = false
    for (const href of hrefsRef.current) {
      if (typeof stored[href] !== "number") {
        stored[href] = now
        changed = true
      }
    }
    if (changed) write(stored)
    setSeen(stored)
  }, [])

  // Looking at a page marks it read — and keeps marking it read as the page
  // auto-refreshes, so a failure that lands while you are watching the Recovery
  // Queue does not leave a badge on the row you are already on.
  const ready = seen !== null
  React.useEffect(() => {
    if (!ready) return
    const href = sectionFor(pathname, hrefsRef.current)
    if (!href) return
    // Take the newest item's own timestamp when it is ahead of this clock:
    // a few seconds of skew between the browser and Postgres would otherwise
    // leave a badge that cannot be cleared by looking at it.
    const newest = signals[href]?.[0] ?? 0
    const at = Math.max(Date.now(), newest)
    setSeen((prev) => {
      if (!prev || prev[href] === at) return prev
      const next = { ...prev, [href]: at }
      write(next)
      return next
    })
  }, [pathname, signals, ready])

  const api = React.useMemo<SignalsApi>(
    () => ({
      countFor: (href) => {
        if (!seen) return 0
        const since = seen[href]
        const list = signals[href]
        if (typeof since !== "number" || !list) return 0
        // Sorted newest first, so we can stop at the first one already seen.
        let n = 0
        for (const t of list) {
          if (t <= since) break
          n++
        }
        return n
      },
      toneFor: (href) => (ALERT_ROUTES.has(href) ? "alert" : "new"),
    }),
    [seen, signals]
  )

  return (
    <SignalsContext.Provider value={api}>{children}</SignalsContext.Provider>
  )
}

export function useNavSignals() {
  return React.useContext(SignalsContext)
}

/**
 * A single dot for the mobile menu button. The sidebar is hidden below lg, so
 * without this the whole signal disappears on a phone — which is where the
 * client is most likely to be when something breaks.
 */
export function NavMenuDot({ hrefs }: { hrefs: string[] }) {
  const { countFor, toneFor } = useNavSignals()
  const hit = hrefs.filter((h) => countFor(h) > 0)
  if (hit.length === 0) return null
  const alert = hit.some((h) => toneFor(h) === "alert")
  return (
    <span
      title={`${hit.length} ${hit.length === 1 ? "section has" : "sections have"} something new`}
      className={cn(
        "absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full ring-2 ring-background",
        alert ? "bg-destructive" : "bg-amber-500"
      )}
    />
  )
}

/**
 * The badge itself. `dot` is the collapsed-sidebar form, where there is no room
 * for a number — it sits on the corner of the icon with a ring in the sidebar's
 * own colour so it reads as a marker rather than part of the glyph.
 */
export function NavBadge({ href, dot }: { href: string; dot?: boolean }) {
  const { countFor, toneFor } = useNavSignals()
  const count = countFor(href)
  if (count < 1) return null

  const alert = toneFor(href) === "alert"
  const label = `${count > WINDOW - 1 ? `${WINDOW}+` : count} new since you last looked`

  if (dot) {
    return (
      <span
        title={label}
        className={cn(
          "absolute right-2.5 top-2.5 h-2 w-2 rounded-full ring-2 ring-sidebar",
          alert ? "bg-destructive" : "bg-amber-500"
        )}
      />
    )
  }

  return (
    <span
      title={label}
      className={cn(
        "ml-auto inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums leading-none",
        alert
          ? "bg-destructive text-destructive-foreground"
          : "bg-amber-500 text-stone-950 font-bold"
      )}
    >
      {count > WINDOW - 1 ? `${WINDOW}+` : count}
    </span>
  )
}
