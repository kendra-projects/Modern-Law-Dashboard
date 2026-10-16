import type { StatusMeta } from "@/lib/status"

// A platform the automation can't post to, such as a Facebook video longer than
// the 90 second Reel limit (and too big for Make's normal video upload): staff
// upload it by hand. Its recovery row is resolved with this marker, so it leaves
// the Recovery Queue, the episode reads as its blog's state (Drafted /
// Published), and the Archive says to upload it by hand.
export const MANUAL_UPLOAD = "manual_upload"

const NOTES: Record<string, string> = {
  facebook:
    "The video is too long for an automatic Facebook post (Reels take up to 90 seconds), so upload it to the Facebook page by hand.",
}

export const manualUploadNote = (platform: string) =>
  NOTES[platform.toLowerCase()] ?? "This one can't be posted automatically, so upload it by hand."

export const manualUploadMeta: StatusMeta = { label: "Upload by hand", variant: "warning", dot: "bg-warning" }
