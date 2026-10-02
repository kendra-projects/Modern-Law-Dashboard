"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { RefreshCw, RotateCw, Scale, Loader2 } from "lucide-react"
import { retryAllFailed } from "@/app/actions/logs"
import { manualSync } from "@/app/actions/intake"
import { Button } from "@/components/ui/button"

export function OverrideToolbar({ pendingClio }: { pendingClio: number }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [action, setAction] = React.useState<string | null>(null)

  function run(name: string, fn: () => Promise<{ ok: boolean; message: string }>) {
    setAction(name)
    startTransition(async () => {
      const res = await fn()
      if (res.ok) toast.success(res.message)
      else toast.error(res.message)
      router.refresh()
      setAction(null)
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="default"
        size="sm"
        disabled={pending}
        onClick={() => run("retry", retryAllFailed)}
      >
        {pending && action === "retry" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RotateCw className="h-4 w-4" />
        )}
        Force retry stuck
      </Button>

      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => run("sync", manualSync)}
      >
        {pending && action === "sync" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        Manual sync
      </Button>

      <Button variant="secondary" size="sm" asChild>
        <Link href="/meetings">
          <Scale className="h-4 w-4" />
          Approve &amp; file
          {pendingClio > 0 && (
            <span className="ml-1 rounded-full bg-warning/20 px-1.5 text-xs font-semibold text-warning">
              {pendingClio}
            </span>
          )}
        </Link>
      </Button>
    </div>
  )
}
