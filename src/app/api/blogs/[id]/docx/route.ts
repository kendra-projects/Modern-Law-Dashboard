import { NextRequest } from "next/server"
import HTMLtoDOCX from "html-to-docx"
import { createClient } from "@/lib/supabase/server"

// The docx build needs Node APIs (Buffer, image fetch) — not the Edge runtime.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** Fetch a remote image and return a base64 data URI so Word embeds it inline
 * (a bare remote <img src> is often not pulled when the .docx is opened). */
async function inlineImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const type = res.headers.get("content-type") || "image/png"
    if (!type.startsWith("image/")) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return `data:${type};base64,${buf.toString("base64")}`
  } catch {
    return null
  }
}

async function inlineAllImages(html: string): Promise<string> {
  const srcs = new Set<string>()
  const re = /<img[^>]+src=["']([^"']+)["']/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    if (m[1] && /^https?:\/\//i.test(m[1])) srcs.add(m[1])
  }
  const pairs = await Promise.all(
    Array.from(srcs).map(async (s) => [s, await inlineImage(s)] as const)
  )
  let out = html
  for (const [orig, data] of pairs) {
    if (data) out = out.split(orig).join(data)
  }
  return out
}

// ── Brand templates ────────────────────────────────────────────────────────
// html-to-docx only honours INLINE styles reliably, so each brand supplies a
// per-tag inline style. Palettes are drawn from the two live sites:
//   Modern Law   → mymodernlaw.com (navy / teal / amber, serif headings)
//   Business of Law → billietarascio.com (gold / blue / slate, serif display)
interface Brand {
  label: string
  serif: string
  ink: string
  h1: string
  h2: string
  h3: string
  accent: string
  panelBg: string
  panelBorder: string
  link: string
}

const SERIF = `Georgia, 'Times New Roman', serif`

const BRANDS: Record<"ml" | "bol", Brand> = {
  ml: {
    label: "MODERN LAW",
    serif: SERIF,
    ink: "#1f2933",
    h1: "#10192D",
    h2: "#0B5B66",
    h3: "#0B5B66",
    accent: "#FA9C0F",
    panelBg: "#FAF6F1",
    panelBorder: "#0B5B66",
    link: "#0B5B66",
  },
  bol: {
    label: "THE BUSINESS OF LAW",
    serif: `'Namdhinggo', ${SERIF}`,
    ink: "#334155",
    h1: "#1E293B",
    h2: "#046BD2",
    h3: "#1E293B",
    accent: "#FBA92C",
    panelBg: "#F0F5FA",
    panelBorder: "#046BD2",
    link: "#046BD2",
  },
}

function pickBrand(showName: string | null): Brand {
  return /business/i.test(showName || "") ? BRANDS.bol : BRANDS.ml
}

/** The stored blog is often PLAIN TEXT with blank-line paragraph breaks (the
 * same shape WordPress turns into <p> via wpautop) rather than real HTML. If it
 * has no block-level tags, rebuild paragraphs from blank lines so Word shows the
 * same separated paragraphs — otherwise it all collapses into one block. */
function normalizeBody(raw: string): string {
  const hasBlock =
    /<(p|h[1-6]|ul|ol|li|blockquote|table|figure|div|section|article)\b/i.test(
      raw
    )
  if (hasBlock) return raw
  const hasInlineTag = /<[a-z][\s\S]*?>/i.test(raw)
  return raw
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const safe = hasInlineTag ? block : escapeHtml(block)
      return `<p>${safe.replace(/\n/g, "<br>")}</p>`
    })
    .join("")
}

/** Strip attributes we do not want to keep (existing inline style/class), then
 * inject our brand's inline style onto each structural tag. href/src/alt are
 * preserved because we only insert a style attribute after the tag name. */
function applyBrand(bodyHtml: string, b: Brand): string {
  let html = bodyHtml
    .replace(/\sstyle=("[^"]*"|'[^']*')/gi, "")
    .replace(/\sclass=("[^"]*"|'[^']*')/gi, "")

  const tagStyle: Record<string, string> = {
    h2: `font-family:${b.serif};font-size:16pt;font-weight:700;color:${b.h2};margin:22pt 0 8pt;`,
    h3: `font-family:${b.serif};font-size:13pt;font-weight:700;color:${b.h3};margin:18pt 0 6pt;`,
    h4: `font-family:${b.serif};font-size:12pt;font-weight:700;color:${b.h3};margin:14pt 0 6pt;`,
    // NOTE: no line-height — html-to-docx miscompiles CSS line-height on larger
    // fonts into a broken w:line value (renders as ~2.4x spacing in Word).
    // Vertical rhythm is done with paragraph margins instead.
    p: `font-family:Calibri,Arial,sans-serif;font-size:11pt;color:${b.ink};margin:0 0 11pt;`,
    li: `font-family:Calibri,Arial,sans-serif;font-size:11pt;color:${b.ink};margin:0 0 5pt;`,
    a: `color:${b.link};text-decoration:underline;`,
    blockquote: `border-left:3px solid ${b.accent};background:${b.panelBg};padding:8pt 14pt;margin:12pt 0;font-style:italic;color:${b.ink};`,
    img: `max-width:600px;height:auto;`,
  }

  for (const [tag, style] of Object.entries(tagStyle)) {
    html = html.replace(
      new RegExp(`<${tag}\\b`, "gi"),
      `<${tag} style="${style}"`
    )
  }
  return html
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthorized", { status: 401 })

  const { data, error } = await supabase
    .from("episodes_content")
    .select(
      "title, description, show_name, image_url, bannerbear_image_url, blog_html"
    )
    .eq("id", params.id)
    .maybeSingle()

  if (error || !data || !data.blog_html) {
    return new Response("Blog not found", { status: 404 })
  }

  const b = pickBrand(data.show_name as string | null)
  const title = (data.title as string) || "Blog"
  // The client asked for the text/branded banner (Bannerbear render), not the
  // plain header image — fall back to the header only if the banner is missing.
  const hero =
    (data.bannerbear_image_url as string | null) ||
    (data.image_url as string | null) ||
    null

  // Word cannot play embedded video or run scripts — strip them. Everything
  // else (headings, images, lists, links) is kept and re-styled to the brand.
  const cleaned = (data.blog_html as string)
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")

  const styledBody = applyBrand(normalizeBody(cleaned), b)

  // Masthead: brand label + rule, then the hero banner. The `description` field
  // is the YouTube/social caption (hashtags, 👇) — NOT part of the blog, so it
  // is intentionally left out of the article document.
  const masthead =
    `<p style="font-family:Calibri,Arial,sans-serif;font-size:9pt;letter-spacing:2px;font-weight:700;color:${b.accent};margin:0 0 4pt;">${b.label}</p>` +
    `<h1 style="font-family:${b.serif};font-size:22pt;font-weight:700;color:${b.h1};margin:0 0 8pt;">${escapeHtml(
      title
    )}</h1>` +
    `<p style="border-bottom:2px solid ${b.accent};margin:0 0 14pt;"></p>` +
    (hero
      ? `<p style="margin:0 0 14pt;"><img src="${hero}" width="600" alt="${escapeHtml(
          title
        )}" /></p>`
      : "")

  const inner = await inlineAllImages(masthead + styledBody)

  const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Calibri,Arial,sans-serif;color:${b.ink};">${inner}</body></html>`

  const footerHtml = `<p style="font-family:Calibri,Arial,sans-serif;font-size:8pt;color:#94a3b8;text-align:center;">${b.label} — draft for review</p>`

  const buffer = await HTMLtoDOCX(fullHtml, null, {
    orientation: "portrait",
    margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
    footer: true,
    pageNumber: true,
    header: false,
  }, footerHtml)

  const safeName =
    title
      .replace(/[^\w.\- ]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 80) || "blog"

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safeName}.docx"`,
      "Cache-Control": "no-store",
    },
  })
}
