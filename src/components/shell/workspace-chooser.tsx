"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import Image from "next/image"
import { motion } from "framer-motion"
import { FileText, Inbox, ArrowRight, Loader2, LogOut } from "lucide-react"
import { switchWorkspace } from "@/app/actions/workspace"
import type { Workspace } from "./nav-items"
import { cn } from "@/lib/utils"

// Admin's landing screen: a full-screen picker (covers the sidebar and topbar)
// for which half of the dashboard to work in. The choice is remembered, and
// the sidebar switch changes it any time after.

const SPACES: {
  key: Workspace
  title: string
  blurb: string
  pages: string[]
  icon: typeof Inbox
  image: string
}[] = [
  {
    key: "content",
    title: "Content",
    blurb: "Media uploads, blogs, local posts and publishing across every channel.",
    pages: ["Upload", "Blogs", "GBP Posts", "Meetings", "Archive"],
    icon: FileText,
    // Free stock photos (Unsplash License), served from Unsplash's CDN.
    image: "https://images.unsplash.com/photo-1764664035176-8e92ff4f128e?w=900&q=75&auto=format&fit=crop",
  },
  {
    key: "intake",
    title: "Consultation Intake",
    blurb: "New consult leads, the Acuity schedule, conflict checks and Clio.",
    pages: ["Leads", "Appointments", "Recovery", "Activity", "Settings"],
    icon: Inbox,
    image: "https://images.unsplash.com/photo-1763729805496-b5dbf7f00c79?w=900&h=420&q=75&auto=format&fit=crop&crop=entropy",
  },
]

export function WorkspaceChooser({ email }: { email: string }) {
  const [pending, start] = React.useTransition()
  const [picked, setPicked] = React.useState<Workspace | null>(null)
  // Rendered into <body> through a portal: the page wrapper is animated with a
  // transform, which would otherwise trap this "fixed" overlay inside it.
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => {
    setMounted(true)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])
  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
      {/* Backdrop stays put (fixed) so nothing behind ever shows through. */}
      <div className="fixed inset-0">
        <Image src="/login-bg-atrium.jpg" alt="" fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="relative max-h-full w-full max-w-[860px] overflow-y-auto rounded-3xl border border-white/10 bg-background/90 p-5 shadow-2xl backdrop-blur-xl sm:p-7"
      >
        <div className="flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-white.png" alt="Modern Law" className="theme-logo-white h-10 w-10 object-contain [@media(max-height:620px)]:!hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-black.png" alt="Modern Law" className="theme-logo-black h-10 w-10 object-contain [@media(max-height:620px)]:!hidden" />
          <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.2em] text-primary [@media(max-height:760px)]:hidden">Modern Law Operations</p>
          <h1 className="mt-1.5 font-serif text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Where are you working today?
          </h1>
          <p className="mt-1.5 max-w-md text-sm text-muted-foreground [@media(max-height:760px)]:hidden">
            Pick a workspace. You can switch any time from the top of the sidebar.
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 sm:gap-5 [@media(max-height:760px)]:mt-4">
          {SPACES.map(({ key, title, blurb, pages, icon: Icon, image }, i) => (
            <motion.button
              key={key}
              type="button"
              disabled={pending}
              onClick={() => {
                setPicked(key)
                start(() => switchWorkspace(key))
              }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.1, duration: 0.4, ease: "easeOut" }}
              className={cn(
                "group flex flex-col overflow-hidden rounded-2xl border border-border bg-card text-left shadow-card transition-all duration-300",
                "hover:-translate-y-1 hover:border-primary/60 hover:shadow-glow disabled:cursor-wait",
                picked === key && "border-primary shadow-glow"
              )}
            >
              <div className="relative h-[clamp(120px,26vh,220px)] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                {/* Only a thin fade at the very bottom, so the photo stays visible. */}
                <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-card to-transparent" />
              </div>

              <div className="flex flex-1 flex-col p-4 pt-3 sm:p-5 sm:pt-4">
                <h2 className="flex items-center gap-2.5 font-serif text-xl font-semibold text-foreground">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  {title}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{blurb}</p>
                <ul className="mt-3 flex flex-wrap gap-1.5 [@media(max-height:620px)]:hidden">
                  {pages.map((p) => (
                    <li key={p} className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[11px] text-muted-foreground">
                      {p}
                    </li>
                  ))}
                </ul>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-semibold text-primary">
                  {pending && picked === key ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Opening…
                    </>
                  ) : (
                    <>
                      Open {title}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </span>
              </div>
            </motion.button>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
          <span>
            Signed in as <span className="text-foreground">{email}</span>
          </span>
          <form action="/auth/signout" method="post">
            <button type="submit" className="inline-flex items-center gap-1 hover:text-destructive">
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </button>
          </form>
        </div>
      </motion.div>
    </div>,
    document.body
  )
}
