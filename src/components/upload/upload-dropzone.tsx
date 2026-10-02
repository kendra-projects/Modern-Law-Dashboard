"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  UploadCloud,
  FileVideo,
  Loader2,
  CheckCircle2,
  Fingerprint,
} from "lucide-react"
import { registerUpload } from "@/app/actions/intake"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

const ACCEPT = ".mp4,.mov,.mp3,.wav,video/*,audio/*"

// Matches the Supabase upload limit. The project is on the Pro plan, so the
// storage upload limit is configurable — set to 1 GB (bucket file_size_limit
// and the project global limit both raised to match). We stop oversized files
// here first with a clear message rather than letting the upload fail silently.
const MAX_UPLOAD_BYTES = 1 * 1024 * 1024 * 1024 // 1 GB
const MAX_UPLOAD_LABEL = "1 GB"

function formatSize(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`
}

// A whole-file SHA-256 over a large video is slow and, at ~300MB+, unreliable in
// the browser: loading the entire file into memory produced INCONSISTENT digests
// for the SAME file, so re-uploads were not caught as duplicates. Instead we
// fingerprint the size plus the first and last 4MB — this reads only ~8MB, is
// deterministic at any size, and still distinguishes different videos.
async function fileFingerprint(file: File): Promise<string> {
  const CHUNK = 4 * 1024 * 1024
  const head = file.slice(0, CHUNK)
  const tail = file.size > CHUNK ? file.slice(file.size - CHUNK) : new Blob()
  const [hb, tb] = await Promise.all([head.arrayBuffer(), tail.arrayBuffer()])
  const combined = new Uint8Array(hb.byteLength + tb.byteLength)
  combined.set(new Uint8Array(hb), 0)
  combined.set(new Uint8Array(tb), hb.byteLength)
  const digest = await crypto.subtle.digest("SHA-256", combined)
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  return `sha256:${file.size}:${hex.slice(0, 24)}`
}

type Phase = "idle" | "hashing" | "uploading" | "registering" | "done"

export function UploadDropzone({ compact = false }: { compact?: boolean }) {
  const router = useRouter()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [show, setShow] = React.useState("Modern Law")
  const [dragging, setDragging] = React.useState(false)
  const [phase, setPhase] = React.useState<Phase>("idle")
  const [progress, setProgress] = React.useState(0)
  const [current, setCurrent] = React.useState<string | null>(null)

  const busy = phase !== "idle" && phase !== "done"

  async function handleFiles(files: FileList | null) {
    if (!files?.length || busy) return
    const file = files[0]

    // Reject oversized files up-front (notification-style) — a big video would
    // otherwise be refused by Storage and, before the fix below, silently create
    // an intake with no file behind it.
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("Video too large", {
        description: `"${file.name}" is ${formatSize(
          file.size
        )} — the limit is ${MAX_UPLOAD_LABEL}. Please compress or trim it and upload again.`,
      })
      return
    }

    setCurrent(file.name)

    try {
      setPhase("hashing")
      setProgress(15)
      const hash = await fileFingerprint(file)

      // One storage path, used for BOTH the upload and the DB record, so the
      // Make scenario can sign + download the exact object later. The filename
      // is sanitized (no spaces / odd chars) so the signed-URL path is always
      // URL-safe — a raw space in the object key otherwise 400s the sign call.
      const safeName = file.name
        .normalize("NFKD")
        .replace(/[^\w.\- ]+/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .toLowerCase()
      const storagePath = `podcast/${Date.now()}-${safeName || "upload"}`
      setPhase("uploading")
      setProgress(45)
      const supabase = createClient()
      const { error: uploadError } = await supabase.storage
        .from("media")
        .upload(storagePath, file, {
          upsert: false,
          contentType: file.type || undefined,
        })

      // The file must actually land in Storage before we register the intake.
      // Registering a row whose file_url points at a missing object produces an
      // orphan that the Make pipeline then fails to download (NoSuchKey). So on
      // any upload error we stop here and tell the user — no orphan row.
      if (uploadError) {
        const tooBig = /exceed|maximum|too large|size|413|payload/i.test(
          uploadError.message
        )
        toast.error(tooBig ? "Video too large" : "Upload failed", {
          description: tooBig
            ? `"${file.name}" is over the ${MAX_UPLOAD_LABEL} limit — please compress or trim it and try again.`
            : `Could not save "${file.name}" to storage. ${uploadError.message}`,
        })
        setPhase("idle")
        setProgress(0)
        setCurrent(null)
        return
      }

      setPhase("registering")
      setProgress(80)
      const res = await registerUpload({
        fileName: file.name,
        fileHash: hash,
        showName: show,
        sizeBytes: file.size,
        storagePath,
      })

      setProgress(100)
      setPhase("done")
      if (res.duplicate) {
        toast.warning("Duplicate detected", { description: res.message })
      } else if (res.ok) {
        toast.success("Media ingested", { description: res.message })
      } else {
        toast.error("Upload failed", { description: res.message })
      }
      router.refresh()
      setTimeout(() => {
        setPhase("idle")
        setProgress(0)
        setCurrent(null)
      }, 1600)
    } catch {
      toast.error("Upload failed", { description: "Could not process the file." })
      setPhase("idle")
      setProgress(0)
    }
  }

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="text-sm font-medium text-foreground">
            Show
          </span>
          <Select value={show} onValueChange={setShow}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Modern Law">Modern Law</SelectItem>
              <SelectItem value="Business of Law">Business of Law</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          handleFiles(e.dataTransfer.files)
        }}
        onClick={() => !busy && inputRef.current?.click()}
        className={cn(
          "relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors",
          compact ? "min-h-[140px]" : "min-h-[200px]",
          dragging
            ? "border-primary bg-primary/10"
            : "border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        {phase === "idle" && (
          <>
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/12 text-primary">
              <UploadCloud className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-foreground">
              Drag &amp; drop media, or click to browse
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              .mp4 · .mov · .mp3 · .wav — hashed on device for idempotency
            </p>
          </>
        )}

        {phase === "done" && (
          <>
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-foreground">
              {current} processed
            </p>
          </>
        )}

        {busy && (
          <div className="w-full max-w-xs">
            <div className="mb-3 flex items-center justify-center gap-2 text-primary">
              {phase === "hashing" ? (
                <Fingerprint className="h-5 w-5" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin" />
              )}
              <FileVideo className="h-5 w-5" />
            </div>
            <p className="mb-2 truncate text-sm font-medium text-foreground">
              {current}
            </p>
            <Progress value={progress} />
            <p className="mt-2 text-xs capitalize text-muted-foreground">
              {phase === "hashing"
                ? "Computing content hash…"
                : phase === "uploading"
                  ? "Uploading to private storage…"
                  : "Registering intake…"}
            </p>
          </div>
        )}
      </div>

      {!compact && (
        <Button
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <UploadCloud className="h-4 w-4" /> Select file
        </Button>
      )}
    </div>
  )
}
