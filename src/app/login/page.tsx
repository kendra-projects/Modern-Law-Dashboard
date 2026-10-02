import { Sparkles } from "lucide-react"
import { LoginForm } from "@/components/auth/login-form"
import { ThemeToggle } from "@/components/theme-toggle"
import { Card, CardContent } from "@/components/ui/card"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectedFrom?: string }>
}) {
  const { redirectedFrom } = await searchParams
  const redirectTo = redirectedFrom || "/"

  return (
    <main className="relative flex min-h-screen items-center overflow-hidden bg-background">
      {/* Theme switcher */}
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>

      {/* Hero photo — fades into the page background on the left (behind the
          form) and reads clearly on the right, tinted per-theme via the
          background/foreground CSS vars so it never fights the palette. */}
      <div className="pointer-events-none absolute inset-0 hidden lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/login-bg-atrium.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/92 to-background/15" />
        <div className="absolute inset-0 bg-gradient-to-t from-background/50 via-transparent to-background/40" />
      </div>

      {/* Ambient background (mobile / behind the form everywhere) */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-accent/20 blur-[120px] lg:hidden" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground)) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col items-center justify-center gap-10 px-4 py-6 lg:flex-row lg:items-start lg:justify-between lg:px-12 lg:py-10 xl:px-20">
        <div className="w-full max-w-md">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-black.png"
                alt="Modern Law"
                className="theme-logo-black h-11 w-11 object-contain"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-white.png"
                alt="Modern Law"
                className="theme-logo-white h-11 w-11 object-contain"
              />
            </div>
            <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
              Modern Law
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Operations Dashboard · Mission Control
            </p>
          </div>

          <Card className="glass border-border/60 shadow-2xl">
            <CardContent className="p-6 sm:p-8">
              <div className="mb-6 flex items-center gap-2 text-sm font-medium text-foreground">
                <Sparkles className="h-4 w-4 text-accent" />
                Sign in to continue
              </div>
              <LoginForm redirectTo={redirectTo} />
            </CardContent>
          </Card>
        </div>

        {/* Marketing copy over the hero photo — colors are theme tokens, so
            they stay legible and on-brand across all three themes. The glass
            panel lifts contrast off the photo without hiding it. The invisible
            spacer above it exactly mirrors the logo/heading block on the left
            so the two panels' TOP EDGES line up, instead of the card and the
            glass panel appearing staggered. */}
        <div className="hidden max-w-sm flex-col lg:flex">
          <div
            aria-hidden="true"
            className="invisible mb-6 flex flex-col items-center text-center"
          >
            <div className="mb-3 h-12 w-12" />
            <h1 className="font-serif text-3xl font-bold">Modern Law</h1>
            <p className="mt-1 text-sm">Operations Dashboard · Mission Control</p>
          </div>
          <div className="rounded-2xl border border-border/40 bg-background/55 p-7 shadow-xl backdrop-blur-md">
            <p className="font-serif text-[2.1rem] font-semibold leading-[1.15] text-foreground">
              From recording to
              <br />
              published post — tracked live.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-foreground/70">
              Supabase intake, Make.com automation, and the Historical Archive
              — unified in one mission control.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
