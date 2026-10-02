"use client"

import * as React from "react"
import { Check, ChevronsUpDown, Plus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { searchClioMatters, type ClioMatter } from "@/app/actions/meetings"

// Every lookup is a Make scenario run, billed at four operations, so a repeated
// query must not become a repeated run. The cache lives at module scope
// deliberately: an attorney working through several consultations opens the
// picker on each one, and that is the same list every time.
const cache = new Map<string, { at: number; rows: ClioMatter[] }>()
const CACHE_TTL = 5 * 60 * 1000

// Long enough to sit through a human pause mid-word. At 300ms an attorney
// typing a client name thoughtfully fired a run per character — 30 runs in
// fourteen minutes, measured.
const DEBOUNCE = 700

export function ClioCombobox({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [matters, setMatters] = React.useState<ClioMatter[]>([])
  const [loading, setLoading] = React.useState(false)
  // Remembered separately from the result list so the trigger keeps showing a
  // readable matter after the list is refetched or the popover is reopened.
  const [picked, setPicked] = React.useState<ClioMatter | null>(null)

  // Opening the picker searches with an empty query, which Clio answers with the
  // most recent open matters — so there is always something to look at and click,
  // and typing narrows it. A cached answer is used outright; only a query nobody
  // has asked recently costs a scenario run. Each result is checked against the
  // request that is still current, so a slow early reply cannot overwrite a fast
  // later one.
  React.useEffect(() => {
    if (!open) {
      setLoading(false)
      return
    }
    const q = query.trim()

    const hit = cache.get(q)
    if (hit && Date.now() - hit.at < CACHE_TTL) {
      setMatters(hit.rows)
      setLoading(false)
      return
    }

    let live = true
    setLoading(true)
    const t = setTimeout(async () => {
      const rows = await searchClioMatters(q)
      cache.set(q, { at: Date.now(), rows })
      if (!live) return
      setMatters(rows)
      setLoading(false)
    }, q ? DEBOUNCE : 0)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [query, open])

  const selected = matters.find((m) => m.id === value) ?? picked

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value
              ? selected
                ? `${selected.display_number} · ${selected.client}`
                : value
              : "Choose a Clio matter…"}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        {/* Clio has already filtered by the query, so Command must not filter
            again — its fuzzy match would hide perfectly good results. */}
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Client name or matter number…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {loading ? (
                <span className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching Clio…
                </span>
              ) : !query.trim() ? (
                <span className="block py-3 text-sm text-muted-foreground">
                  No open matters in Clio.
                </span>
              ) : (
                <button
                  className="flex w-full items-center gap-2 px-2 py-3 text-sm text-primary"
                  onClick={() => {
                    onChange(query.trim())
                    setOpen(false)
                  }}
                >
                  <Plus className="h-4 w-4" /> No match — use &ldquo;{query.trim()}
                  &rdquo; as the Matter ID
                </button>
              )}
            </CommandEmpty>
            <CommandGroup>
              {matters.map((m) => (
                <CommandItem
                  key={m.id}
                  value={m.id}
                  onSelect={() => {
                    onChange(m.id)
                    setPicked(m)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "h-4 w-4",
                      value === m.id ? "opacity-100 text-primary" : "opacity-0"
                    )}
                  />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">
                      {m.display_number || m.id}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {[m.client, m.description].filter(Boolean).join(" · ") ||
                        m.status}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
