"use client"

import * as React from "react"
import { motion, animate, useInView } from "framer-motion"

// Scroll-triggered entrance animations shared by the Overview pages (content
// and intake) and the Upload page. Everything plays once, when it first
// scrolls into view, not on page load.

const rise = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.06 * i, duration: 0.4, ease: "easeOut" as const },
  }),
}

/** Fades + lifts its children in when scrolled into view; `i` staggers siblings. */
export function Rise({ i = 0, className, children }: { i?: number; className?: string; children: React.ReactNode }) {
  return (
    <motion.div
      custom={i}
      variants={rise}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.15 }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/** Counts up from 0 to `value` once visible. */
export function CountUp({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const seen = useInView(ref, { once: true })
  const [n, setN] = React.useState(0)
  React.useEffect(() => {
    if (!seen) return
    const c = animate(0, value, { duration: 0.9, ease: "easeOut", onUpdate: (v) => setN(Math.round(v)) })
    return () => c.stop()
  }, [value, seen])
  return (
    <span ref={ref}>
      {n}
      {suffix}
    </span>
  )
}

/** Mounts its chart only once scrolled into view, so the chart's own draw-in
 *  animation plays where the viewer can see it. */
export function WhenVisible({ height, children }: { height: number; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const seen = useInView(ref, { once: true, amount: 0.3 })
  return (
    <div ref={ref} style={{ minHeight: height }}>
      {seen ? children : null}
    </div>
  )
}
