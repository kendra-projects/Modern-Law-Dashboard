"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

/** Each show's public WordPress site — used to build the live post URL. */
function siteBase(showName: string | null | undefined): string | null {
  const s = (showName ?? "").toLowerCase()
  if (s.includes("business of law")) return "https://billietarascio.com"
  if (s.includes("modern")) return "https://mymodernlaw.com"
  return null
}

/**
 * Called from the Blogs page after the reviewer has actually clicked Publish
 * inside WordPress. It records the blog as LIVE: writes the public post URL and
 * flips wordpress_status to published, so the lifecycle status becomes
 * "Published" everywhere (overview, archive, upload, blogs) and an Open link
 * appears. `/?p=<id>` resolves to the real permalink once the post is public.
 */
export async function markBlogPublished(
  episodeId: string,
  pastedUrl?: string
): Promise<{ ok: boolean; message: string; url?: string }> {
  if (!episodeId) return { ok: false, message: "Missing episode." }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: "Not signed in." }

  const { data: ep } = await supabase
    .from("episodes_content")
    .select("id, show_name, wordpress_post_id, wordpress_url")
    .eq("id", episodeId)
    .maybeSingle()

  if (!ep) return { ok: false, message: "Blog not found." }

  const base = siteBase(ep.show_name)
  const postId = (ep.wordpress_post_id ?? "").trim()
  // Link priority: (1) the exact URL the reviewer pasted from WordPress — the
  // real permalink; (2) any URL already stored; (3) built `/?p=<id>` from a
  // numeric post id, which WordPress redirects to the real permalink once the
  // post is live. Non-numeric (seed/test) ids can't build a working link.
  const pasted = (pastedUrl ?? "").trim()
  let url = ""
  if (/^https?:\/\/\S+$/i.test(pasted)) url = pasted
  else if ((ep.wordpress_url ?? "").trim()) url = (ep.wordpress_url ?? "").trim()
  else if (base && /^\d+$/.test(postId)) url = `${base}/?p=${postId}`
  if (!url)
    return {
      ok: false,
      message:
        "No URL available — paste the published post URL from WordPress.",
    }

  const { error } = await supabase
    .from("episodes_content")
    .update({ wordpress_url: url, wordpress_status: "published" })
    .eq("id", episodeId)

  if (error) return { ok: false, message: error.message }

  revalidatePath("/blogs")
  revalidatePath("/archive")
  revalidatePath("/upload")
  revalidatePath("/")
  return { ok: true, message: "Blog marked as published.", url }
}
