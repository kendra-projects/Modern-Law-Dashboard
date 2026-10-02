"use server"

import { createClient } from "@/lib/supabase/server"

/**
 * Signs the private uploaded source media (the file the user dropped) so it can
 * be previewed in the dashboard without ever making the object public. The
 * `media` bucket is private; an "auth read media" storage policy lets the
 * authenticated dashboard user mint a short-lived signed URL (1 hour).
 *
 * `fileUrl` is the bucket-relative path stored on intake_transcripts.file_url,
 * e.g. "media/podcast/1788-modern-law-4.mp4" — we strip the leading bucket name
 * to get the object key inside the "media" bucket.
 */
export async function getSignedMediaUrl(
  fileUrl: string | null
): Promise<{ url: string | null }> {
  if (!fileUrl) return { url: null }

  // External URLs (e.g. Zoom docs, recordings, direct links) are already valid URLs
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
    return { url: fileUrl }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { url: null }

  const path = fileUrl.replace(/^media\//, "")
  const { data, error } = await supabase.storage
    .from("media")
    .createSignedUrl(path, 3600)

  if (error || !data?.signedUrl) return { url: null }
  return { url: data.signedUrl }
}

/**
 * Heavy per-record fields (blog HTML, full transcripts, full summaries) are NOT
 * shipped with the archive list — that payload made the page slow to hydrate and
 * laggy to click. They are fetched on demand when a row's detail drawer opens.
 */
export async function getArchiveDetail(
  kind: "episode" | "consultation",
  id: string
): Promise<{
  blogHtml: string | null
  rawTranscript: string | null
  cleanTranscript: string | null
  summaryText: string | null
}> {
  const empty = {
    blogHtml: null,
    rawTranscript: null,
    cleanTranscript: null,
    summaryText: null,
  }
  if (!id) return empty

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return empty

  if (kind === "episode") {
    const { data } = await supabase
      .from("episodes_content")
      .select("blog_html, intake_transcripts(raw_transcript, clean_transcript)")
      .eq("id", id)
      .maybeSingle()
    const it = data?.intake_transcripts as
      | { raw_transcript: string | null; clean_transcript: string | null }
      | null
      | undefined
    return {
      blogHtml: data?.blog_html ?? null,
      rawTranscript: it?.raw_transcript ?? null,
      cleanTranscript: it?.clean_transcript ?? null,
      summaryText: null,
    }
  }

  const { data } = await supabase
    .from("summaries_matters")
    .select("summary_text, intake_transcripts(raw_transcript, clean_transcript)")
    .eq("id", id)
    .maybeSingle()
  const it = data?.intake_transcripts as
    | { raw_transcript: string | null; clean_transcript: string | null }
    | null
    | undefined
  return {
    blogHtml: null,
    rawTranscript: it?.raw_transcript ?? null,
    cleanTranscript: it?.clean_transcript ?? null,
    summaryText: (data?.summary_text as string | null) ?? null,
  }
}
