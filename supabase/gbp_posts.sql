-- =============================================================================
-- MODERN LAW — Google Business Profile (GBP) Local Posts Table
-- Run this in Supabase SQL Editor (Project: wxgjachpperfpuggqssu)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.gbp_posts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blog_title     text NOT NULL,
  blog_url       text,
  location_key   text NOT NULL, -- 'phoenix', 'scottsdale', 'mesa', 'tucson', 'peoria', 'yuma', 'arizona', 'mesa_mdn'
  location_name  text NOT NULL, -- e.g. 'Phoenix, AZ (Modern Law Divorce and Family Law Attorneys)'
  content        text NOT NULL,
  ai_model       text NOT NULL DEFAULT 'gemini-3.5-flash', -- 'gemini-3.5-flash' or 'gpt-4o (fallback)'
  status         text NOT NULL DEFAULT 'published', -- 'published', 'queued', 'failed'
  error_message  text,
  character_count integer GENERATED ALWAYS AS (char_length(content)) STORED,
  post_date      timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  metadata       jsonb DEFAULT '{}'::jsonb
);

-- Indexes for lightning fast queries & filtering
CREATE INDEX IF NOT EXISTS idx_gbp_posts_location ON public.gbp_posts(location_key);
CREATE INDEX IF NOT EXISTS idx_gbp_posts_created_at ON public.gbp_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gbp_posts_status ON public.gbp_posts(status);

-- Enable Row Level Security (RLS)
ALTER TABLE public.gbp_posts ENABLE ROW LEVEL SECURITY;

-- Allow public / anon read access (for dashboard display)
DROP POLICY IF EXISTS "Allow public read access to gbp_posts" ON public.gbp_posts;
CREATE POLICY "Allow public read access to gbp_posts"
  ON public.gbp_posts
  FOR SELECT
  USING (true);

-- Allow authenticated / service / anon insert & update
DROP POLICY IF EXISTS "Allow insert and update to gbp_posts" ON public.gbp_posts;
CREATE POLICY "Allow insert and update to gbp_posts"
  ON public.gbp_posts
  FOR ALL
  USING (true)
  WITH CHECK (true);
