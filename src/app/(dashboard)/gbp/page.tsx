import { getGbpPosts } from "@/lib/queries"
import { GbpClient } from "@/components/gbp/gbp-client"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Google Business Profile (GBP) Posts | Modern Law",
  description: "Automated localized Google Business Profile posts across Arizona branches.",
}

export default async function GbpPage() {
  const posts = await getGbpPosts()

  return <GbpClient initialPosts={posts} />
}
