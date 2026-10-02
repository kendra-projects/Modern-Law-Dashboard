import { PlayCircle } from "lucide-react"

/**
 * The content pipeline drops the episode's video into the blog as a WordPress
 * `[embed]…[/embed]` shortcode (or, on older posts, a bare YouTube URL). That
 * shortcode is expanded into a player by WordPress on the live site — but in the
 * dashboard preview it is just inert text, and DOMPurify strips any raw iframe.
 *
 * So here we (1) pull the YouTube id out of the blog HTML and render a real,
 * sandboxed player ourselves, and (2) strip the shortcode/URL out of the HTML
 * that gets sanitised, so the same video does not also show as leftover text.
 */

const PATTERNS = [
  /\[embed\]\s*https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([\w-]{6,})/i,
  /youtube\.com\/watch\?v=([\w-]{6,})/i,
  /youtu\.be\/([\w-]{6,})/i,
  /youtube\.com\/embed\/([\w-]{6,})/i,
]

export function extractYouTubeId(html: string | null | undefined): string | null {
  if (!html) return null
  for (const re of PATTERNS) {
    const m = html.match(re)
    if (m) return m[1]
  }
  return null
}

/** Remove the [embed]…[/embed] shortcode so it does not render as raw text. */
export function stripVideoEmbed(html: string | null | undefined): string {
  if (!html) return ""
  return html.replace(/\[embed\][\s\S]*?\[\/embed\]/gi, "")
}

export function BlogVideo({ html }: { html: string | null | undefined }) {
  const id = extractYouTubeId(html)
  if (!id) return null
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <PlayCircle className="h-3.5 w-3.5" /> Video in this blog
      </p>
      <div className="overflow-hidden rounded-lg border border-border bg-black">
        <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
          <iframe
            className="absolute inset-0 h-full w-full"
            src={`https://www.youtube.com/embed/${id}`}
            title="Blog video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  )
}
