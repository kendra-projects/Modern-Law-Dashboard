import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { StatusMeta } from "@/lib/status"

export function StatusBadge({
  meta,
  withDot = true,
  className,
}: {
  meta: StatusMeta
  withDot?: boolean
  className?: string
}) {
  return (
    <Badge variant={meta.variant} className={cn("capitalize", className)}>
      {withDot && (
        <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      )}
      {meta.label}
    </Badge>
  )
}
