import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const TONE = {
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  accent: "text-accent",
  foreground: "text-foreground",
} as const

export type StatTone = keyof typeof TONE

/**
 * The dashboard's stat tile: a small muted label with a big serif number in a
 * status colour. No icon — the label carries the meaning.
 *
 * Extracted from the Logs page so every page renders these identically. The
 * GBP page had grown its own variant (icon on the right, sans-serif number,
 * hardcoded colours) and that alone made it read like a different product.
 */
export function StatTile({
  label,
  value,
  tone = "primary",
  className,
}: {
  label: string
  value: number | string
  tone?: StatTone
  className?: string
}) {
  return (
    <Card className={className}>
      <CardContent className="p-3 sm:p-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p
          className={cn(
            "mt-1 font-serif text-xl font-bold sm:text-2xl",
            TONE[tone]
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  )
}
