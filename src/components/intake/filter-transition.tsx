"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

// Instant feedback for filters that only change the URL's query string.
// Next's loading.tsx only shows when you enter a new page, so changing a filter
// on the same page would otherwise freeze the old list until the server answers.
// Filters navigate inside a transition; while it's pending, <PendingArea> swaps
// the list for its skeleton.

const PendingCtx = React.createContext<{
  pending: boolean
  go: (href: string, opts?: { scroll?: boolean }) => void
}>({ pending: false, go: () => {} })

export function FilterTransition({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const go = React.useCallback(
    (href: string, opts?: { scroll?: boolean }) =>
      startTransition(() => router.push(href, { scroll: opts?.scroll ?? false })),
    [router]
  )
  return <PendingCtx.Provider value={{ pending, go }}>{children}</PendingCtx.Provider>
}

export function FilterLink({
  href,
  className,
  scroll = false,
  children,
}: {
  href: string
  className?: string
  /** true when opening another page (scroll to its top), false for filters. */
  scroll?: boolean
  children: React.ReactNode
}) {
  const { go } = React.useContext(PendingCtx)
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        go(href, { scroll })
      }}
    >
      {children}
    </a>
  )
}

/** A GET form whose submit goes through the transition instead of a full reload. */
export function FilterForm({
  action,
  className,
  children,
}: {
  action: string
  className?: string
  children: React.ReactNode
}) {
  const { go } = React.useContext(PendingCtx)
  return (
    <form
      action={action}
      className={className}
      onChange={(e) => {
        // Dropdown filters apply the moment a value is picked; no Apply button.
        if ((e.target as HTMLElement).tagName === "SELECT") e.currentTarget.requestSubmit()
      }}
      onSubmit={(e) => {
        e.preventDefault()
        const params = new URLSearchParams()
        new FormData(e.currentTarget).forEach((v, k) => {
          if (typeof v === "string" && v) params.set(k, v)
        })
        const qs = params.toString()
        go(qs ? `${action}?${qs}` : action)
      }}
    >
      {children}
    </form>
  )
}

export function PendingArea({
  fallback,
  children,
}: {
  fallback: React.ReactNode
  children: React.ReactNode
}) {
  const { pending } = React.useContext(PendingCtx)
  return <>{pending ? fallback : children}</>
}
