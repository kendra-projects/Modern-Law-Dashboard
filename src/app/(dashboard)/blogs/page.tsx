import { getBlogs } from "@/lib/queries"
import { deriveEpisodeStatus } from "@/lib/status"
import { BlogsClient, type BlogRow } from "@/components/blogs/blogs-client"

export const dynamic = "force-dynamic"

function wpAdminEdit(showName: string | null, postId: string | null) {
  if (!postId || !/^\d+$/.test(postId)) return null
  const s = (showName ?? "").toLowerCase()
  const base = s.includes("business of law")
    ? "https://billietarascio.com"
    : s.includes("modern")
      ? "https://mymodernlaw.com"
      : null
  return base ? `${base}/wp-admin/post.php?post=${postId}&action=edit` : null
}

export default async function BlogsPage({
  searchParams,
}: {
  searchParams: { open?: string }
}) {
  const { episodes, exhausted } = await getBlogs()

  const rows: BlogRow[] = episodes.map((e) => {
    const status = deriveEpisodeStatus({
      wordpressStatus: e.wordpress_status,
      youtubeStatus: e.youtube_status,
      instagramStatus: e.instagram_status,
      facebookStatus: e.facebook_status,
      intakeStatus: e.intake_transcripts?.status,
      showName: e.show_name,
      wordpressPostId: e.wordpress_post_id,
      wordpressUrl: e.wordpress_url,
      retriesExhausted: exhausted.has(e.id),
      // This page is about the blog itself — a drafted blog reads "Drafted"
      // even if a social platform failed (that shows in Archive / Recovery).
      preferBlogState: true,
    })
    return {
      id: e.id,
      title: e.title ?? "Untitled blog",
      showName: e.show_name ?? "—",
      status,
      isPublished: status === "published",
      date: e.created_at,
      // Prefer the branded banner (headline + Billie's photo overlay) over the
      // plain AI image — that template render is what represents the blog.
      imageUrl: e.bannerbear_image_url ?? e.image_url ?? null,
      description: e.description ?? null,
      seoKeywords: e.seo_keywords ?? null,
      wordpressPostId: e.wordpress_post_id ?? null,
      wordpressUrl: e.wordpress_url ?? null,
      wpAdminUrl: wpAdminEdit(e.show_name, e.wordpress_post_id),
    }
  })

  const drafted = rows.filter((r) => r.status === "drafted").length
  const published = rows.filter((r) => r.isPublished).length

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight text-foreground">
          Blogs
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every AI-drafted blog. Review the draft and its image, publish it in
          WordPress, then mark it live — the status updates everywhere.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Drafted</p>
          <p className="mt-1 font-serif text-2xl font-bold text-accent">
            {drafted}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Published</p>
          <p className="mt-1 font-serif text-2xl font-bold text-success">
            {published}
          </p>
        </div>
      </div>

      <BlogsClient rows={rows} initialOpenId={searchParams.open} />
    </div>
  )
}
