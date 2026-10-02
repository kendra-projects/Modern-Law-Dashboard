import { cn } from "@/lib/utils"

export function BrandLogo({
  className,
  compact = false,
}: {
  className?: string
  compact?: boolean
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {/* The sidebar chrome is dark in every theme, so the plain white
          (transparent-background) mark always has contrast here — no chip
          needed. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-white.png"
        alt="Modern Law"
        className="h-9 w-9 shrink-0 object-contain"
      />
      {!compact && (
        <div className="flex flex-col leading-none">
          <span className="font-serif text-[15px] font-bold tracking-wide text-sidebar-foreground">
            MODERN LAW
          </span>
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-primary">
            Operations
          </span>
        </div>
      )}
    </div>
  )
}
