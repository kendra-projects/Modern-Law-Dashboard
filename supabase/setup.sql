-- =============================================================================
-- MODERN LAW — Operations Dashboard: full database setup
-- Apply this to a fresh Supabase project (SQL Editor or via MCP apply_migration).
-- Safe to re-run: it drops the domain objects first.
-- =============================================================================

-- ---------- RESET (domain objects only) --------------------------------------
DROP TABLE IF EXISTS public.episodes_content   CASCADE;
DROP TABLE IF EXISTS public.summaries_matters  CASCADE;
DROP TABLE IF EXISTS public.intake_transcripts CASCADE;
DROP TABLE IF EXISTS public.system_logs        CASCADE;
DROP TYPE  IF EXISTS public.intake_source_type CASCADE;
DROP TYPE  IF EXISTS public.intake_status      CASCADE;
DROP TYPE  IF EXISTS public.attorney_status    CASCADE;
DROP TYPE  IF EXISTS public.wordpress_status   CASCADE;
DROP TYPE  IF EXISTS public.social_status      CASCADE;
DROP TYPE  IF EXISTS public.log_event_type     CASCADE;
DROP TYPE  IF EXISTS public.log_status         CASCADE;

-- ---------- ENUMS ------------------------------------------------------------
CREATE TYPE public.intake_source_type AS ENUM ('manual_upload', 'zoom_webhook');
CREATE TYPE public.intake_status       AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE public.attorney_status     AS ENUM ('pending_review', 'approved', 'overridden');
CREATE TYPE public.wordpress_status    AS ENUM ('draft', 'published', 'failed');
CREATE TYPE public.social_status       AS ENUM ('pending', 'published', 'failed');
CREATE TYPE public.log_event_type      AS ENUM ('info', 'warning', 'error');
CREATE TYPE public.log_status          AS ENUM ('logged', 'retrying', 'resolved');

-- ---------- TABLES -----------------------------------------------------------
CREATE TABLE public.intake_transcripts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_uuid     text UNIQUE,
  source_type      public.intake_source_type NOT NULL DEFAULT 'manual_upload',
  file_name        text,
  file_url         text,
  raw_transcript   text,
  clean_transcript text,
  file_hash        text UNIQUE,
  status           public.intake_status NOT NULL DEFAULT 'pending',
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.summaries_matters (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_id        uuid REFERENCES public.intake_transcripts(id) ON DELETE CASCADE,
  summary_text     text,
  client_name      text,
  clio_matter_id   text,
  match_confidence numeric(5,2) CHECK (match_confidence >= 0 AND match_confidence <= 100),
  attorney_status  public.attorney_status NOT NULL DEFAULT 'pending_review',
  filed_to_clio    boolean NOT NULL DEFAULT false,
  filed_at         timestamptz,
  overridden_by    uuid,
  updated_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.episodes_content (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_id            uuid REFERENCES public.intake_transcripts(id) ON DELETE CASCADE,
  title                text,
  description          text,
  confidence_score     int CHECK (confidence_score >= 0 AND confidence_score <= 100),
  blog_html            text,
  seo_keywords         text[],
  image_url            text,
  bannerbear_image_url text,
  wordpress_post_id    text,
  wordpress_url        text,
  instagram_url        text,
  facebook_url         text,
  youtube_url          text,
  wordpress_status     public.wordpress_status NOT NULL DEFAULT 'draft',
  instagram_status     public.social_status NOT NULL DEFAULT 'pending',
  facebook_status      public.social_status NOT NULL DEFAULT 'pending',
  youtube_status       public.social_status NOT NULL DEFAULT 'pending',
  show_name            text,
  updated_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.system_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_name text NOT NULL,
  event_type    public.log_event_type NOT NULL DEFAULT 'info',
  message       text NOT NULL,
  details       jsonb,
  retry_count   int NOT NULL DEFAULT 0,
  status        public.log_status NOT NULL DEFAULT 'logged',
  entity_id     uuid,
  resolved_by   uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------- INDEXES ----------------------------------------------------------
CREATE INDEX idx_intake_status      ON public.intake_transcripts(status);
CREATE INDEX idx_intake_created     ON public.intake_transcripts(created_at DESC);
CREATE INDEX idx_summaries_intake   ON public.summaries_matters(intake_id);
CREATE INDEX idx_summaries_attorney ON public.summaries_matters(attorney_status);
CREATE INDEX idx_episodes_intake    ON public.episodes_content(intake_id);
CREATE INDEX idx_logs_created       ON public.system_logs(created_at DESC);
CREATE INDEX idx_logs_status        ON public.system_logs(status);

-- ---------- RLS (100% of tables) --------------------------------------------
ALTER TABLE public.intake_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.summaries_matters  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.episodes_content   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read intake"  ON public.intake_transcripts FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write intake" ON public.intake_transcripts FOR ALL   TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth read summ"    ON public.summaries_matters  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write summ"   ON public.summaries_matters  FOR ALL   TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth read eps"     ON public.episodes_content   FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write eps"    ON public.episodes_content   FOR ALL   TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth read logs"    ON public.system_logs        FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write logs"   ON public.system_logs        FOR ALL   TO authenticated USING (true) WITH CHECK (true);

-- ---------- PRIVATE MEDIA BUCKET --------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "auth read media"  ON storage.objects;
DROP POLICY IF EXISTS "auth write media" ON storage.objects;
CREATE POLICY "auth read media"  ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'media');
CREATE POLICY "auth write media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'media');

-- ---------- SEED: intake_transcripts ----------------------------------------
INSERT INTO public.intake_transcripts
  (meeting_uuid, source_type, file_name, file_url, raw_transcript, clean_transcript, file_hash, status, created_at) VALUES
('zoom-9f21a7c4-reyes','zoom_webhook','consult-reyes-custody.mp4','media/zoom/consult-reyes-custody.mp4',
 'so um she wants to change the parenting time because he moved to mesa and the kids school is in chandler...',
 'Client seeks modification of the existing parenting-time order after the other parent relocated to Mesa, creating a commute conflict with the children''s school in Chandler. Discussed ARS 25-411 modification standard and best-interests factors under ARS 25-403.',
 'sha256:reyes-8823','completed', now() - interval '2 hours'),
('zoom-3b88de10-whitfield','zoom_webhook','consult-whitfield-divorce.mp4','media/zoom/consult-whitfield-divorce.mp4',
 'we have the house in scottsdale two retirement accounts and a business he started during the marriage...',
 'Divorce consultation covering division of a marital residence in Scottsdale, two retirement accounts, and a business founded during the marriage. Discussed community-property principles under ARS 25-211 and valuation of the business interest.',
 'sha256:whitfield-4410','completed', now() - interval '5 hours'),
('zoom-77c1aa02-nguyen','zoom_webhook','consult-nguyen-relocation.mp4','media/zoom/consult-nguyen-relocation.mp4',
 'i got a job offer in denver and i want to take my daughter but her dad is objecting...',
 'Parent received an out-of-state job offer in Denver and wishes to relocate with the minor child; other parent objects. Reviewed the ARS 25-408 relocation notice requirements and the 60-day written-notice rule.',
 'sha256:nguyen-2091','completed', now() - interval '1 day'),
('zoom-12ff45aa-alvarez','zoom_webhook','consult-alvarez-support.mp4','media/zoom/consult-alvarez-support.mp4',
 'he hasnt paid child support in four months and i dont know what to do...',
 'Client reports the other parent is four months in arrears on child support. Discussed enforcement options, including an ARS 25-501 petition and potential income withholding order.',
 'sha256:alvarez-6633','completed', now() - interval '1 day 3 hours'),
('zoom-90ab22e1-bennett','zoom_webhook','consult-bennett-prenup.mp4','media/zoom/consult-bennett-prenup.mp4',
 'we are getting married in the fall and want to protect my dental practice...',
 'Pre-marital agreement consultation to protect a professional dental practice and separate property. Reviewed ARS 25-201 enforceability standards and full-disclosure requirements.',
 'sha256:bennett-1177','completed', now() - interval '2 days'),
('zoom-4d5e6f7a-doyle','zoom_webhook','consult-doyle-custody.mp4','media/zoom/consult-doyle-custody.mp4',
 'my ex is not following the schedule and keeps the kids past his weekend...',
 'Client alleges repeated violations of the parenting-time schedule by the other parent. Discussed filing a petition to enforce and potential contempt remedies under ARS 25-414.',
 'sha256:doyle-8842','completed', now() - interval '3 days'),
('zoom-5a6b7c8d-carter','zoom_webhook','consult-carter-maintenance.mp4','media/zoom/consult-carter-maintenance.mp4',
 'i was a stay at home mom for fifteen years and now we are divorcing...',
 'Spousal-maintenance consultation for a long-term marriage with a homemaker spouse. Reviewed the ARS 25-319 eligibility and amount/duration guideline factors.',
 'sha256:carter-3390','processing', now() - interval '6 hours'),
('media-arz-403-custody','manual_upload','modern-arizona-ep41-ars403.mp4','media/podcast/modern-arizona-ep41-ars403.mp4',
 'welcome back to modern arizona today we are breaking down ars 25 403 the best interest factors...',
 'In this episode I break down ARS 25-403, the statute that governs how Arizona courts decide legal decision-making and parenting time based on the best interests of the child.',
 'sha256:ep41-arz-2201','completed', now() - interval '4 days'),
('media-arz-house-divorce','manual_upload','modern-arizona-ep42-house.mp4','media/podcast/modern-arizona-ep42-house.mp4',
 'a lot of people ask me what happens to the house in a divorce here in arizona...',
 'What actually happens to the marital home in an Arizona divorce: community-property division, buy-outs, and forced sale scenarios.',
 'sha256:ep42-arz-7756','processing', now() - interval '9 hours'),
('media-bol-scaling','manual_upload','business-of-law-ep17-scaling.mp4','media/podcast/business-of-law-ep17-scaling.mp4',
 'on the business of law today how do you actually scale a family law practice without burning out...',
 'How to scale a family-law practice: systems, delegation, and the metrics that matter, from the Business of Law podcast.',
 'sha256:ep17-bol-9912','completed', now() - interval '6 days'),
('media-arz-relocation','manual_upload','modern-arizona-ep43-reloc.mp4','media/podcast/modern-arizona-ep43-reloc.mp4',
 'can you move out of state with your kids after a divorce the answer is it depends...',
 'Relocation after divorce in Arizona: the ARS 25-408 notice rules and what judges weigh when a parent wants to move with the children.',
 'sha256:ep43-arz-3345','failed', now() - interval '2 days 6 hours'),
('media-bol-associate','manual_upload','business-of-law-ep18-hiring.mp4','media/podcast/business-of-law-ep18-hiring.mp4',
 'hiring your first associate is one of the scariest steps for a solo attorney...',
 'When and how to hire your first associate attorney, and the compensation structures that keep them.',
 'sha256:ep18-bol-5528','processing', now() - interval '3 hours'),
('media-arz-grandparent','manual_upload','modern-arizona-ep44-grand.mp4','media/podcast/modern-arizona-ep44-grand.mp4',
 'do grandparents have visitation rights in arizona a question i get all the time...',
 'Grandparent and third-party visitation rights in Arizona under ARS 25-409, and the high bar the statute sets.',
 'sha256:ep44-arz-6641','completed', now() - interval '8 days'),
('media-arz-support-mod','manual_upload','modern-arizona-ep45-support.mp4','media/podcast/modern-arizona-ep45-support.mp4',
 'lost your job heres how child support modification actually works in arizona...',
 'Modifying child support after a job loss or income change in Arizona, and the substantial-and-continuing-change standard.',
 'sha256:ep45-arz-1108','pending', now() - interval '40 minutes');

-- ---------- SEED: summaries_matters -----------------------------------------
INSERT INTO public.summaries_matters
  (intake_id, summary_text, client_name, clio_matter_id, match_confidence, attorney_status, filed_to_clio, filed_at, updated_at, created_at)
SELECT i.id, v.summary_text, v.client_name, v.clio_matter_id, v.match_confidence,
       v.attorney_status::public.attorney_status, v.filed_to_clio, v.filed_at, v.updated_at, i.created_at + interval '20 minutes'
FROM (VALUES
  ('zoom-9f21a7c4-reyes','Consultation re: parenting-time modification following the father''s relocation to Mesa. Recommend petition to modify under ARS 25-411; strong best-interests argument on school stability.','Maria Reyes','CLIO-MAT-004821',96.0,'approved',true, now() - interval '1 hour', now() - interval '1 hour'),
  ('zoom-3b88de10-whitfield','Divorce intake: marital home in Scottsdale, two retirement accounts, and a spouse-owned business. Community-property analysis and business valuation required.','Gregory Whitfield','CLIO-MAT-004822',88.0,'pending_review',false, NULL, NULL),
  ('zoom-77c1aa02-nguyen','Relocation matter: parent wishes to move to Denver with a minor child over the other parent''s objection. ARS 25-408 notice analysis needed. Client name spoken unclearly on the recording.','T. Nguyen (unconfirmed)',NULL,62.0,'pending_review',false, NULL, NULL),
  ('zoom-12ff45aa-alvarez','Child-support enforcement: obligor four months in arrears. Recommend ARS 25-501 enforcement petition and income-withholding order.','Daniela Alvarez',NULL,74.0,'pending_review',false, NULL, NULL),
  ('zoom-90ab22e1-bennett','Pre-marital agreement to protect a dental practice and separate property. ARS 25-201 enforceability and disclosure schedule to be prepared.','Sophie Bennett','CLIO-MAT-004825',91.0,'approved',true, now() - interval '1 day 20 hours', now() - interval '1 day 20 hours'),
  ('zoom-4d5e6f7a-doyle','Enforcement of parenting-time order after repeated schedule violations. Matter ID was auto-matched to the wrong file and manually corrected by the attorney.','Kevin Doyle','CLIO-MAT-004811',55.0,'overridden',true, now() - interval '2 days 22 hours', now() - interval '2 days 22 hours'),
  ('zoom-5a6b7c8d-carter','Spousal-maintenance consultation, long-term marriage with homemaker spouse. ARS 25-319 factor analysis pending completion of transcript processing.','Angela Carter',NULL,79.0,'pending_review',false, NULL, NULL)
) AS v(meeting_uuid, summary_text, client_name, clio_matter_id, match_confidence, attorney_status, filed_to_clio, filed_at, updated_at)
JOIN public.intake_transcripts i ON i.meeting_uuid = v.meeting_uuid;

-- ---------- SEED: episodes_content ------------------------------------------
INSERT INTO public.episodes_content
  (intake_id, title, description, confidence_score, blog_html, seo_keywords, image_url, bannerbear_image_url,
   wordpress_post_id, wordpress_url, instagram_url, facebook_url, youtube_url,
   wordpress_status, instagram_status, facebook_status, youtube_status, show_name, updated_at, created_at)
SELECT i.id, v.title, v.description, v.confidence_score, v.blog_html, v.seo_keywords, v.image_url, v.bannerbear_image_url,
       v.wordpress_post_id, v.wordpress_url, v.instagram_url, v.facebook_url, v.youtube_url,
       v.wp::public.wordpress_status, v.ig::public.social_status, v.fb::public.social_status, v.yt::public.social_status,
       v.show_name, now() - interval '1 hour', i.created_at + interval '30 minutes'
FROM (VALUES
  ('media-arz-403-custody','What ARS 25-403 Really Means for Your Custody Case','A plain-English breakdown of Arizona''s best-interests statute and how judges actually weigh the factors.',97,
   '<h2>The Question Every Parent Asks</h2><p>When you''re facing a custody dispute, the single most important statute in Arizona is <strong>ARS 25-403</strong>. It lists the factors a judge must weigh to decide what''s in your child''s best interests.</p><h3>The Best-Interests Factors</h3><p>The court looks at the relationship between the child and each parent, the child''s adjustment to home and school, and the mental and physical health of everyone involved. No single factor is automatically decisive.</p><h3>What This Means for You</h3><p>If you''re preparing for a hearing, document everything that shows stability and involvement. If you have questions about your specific situation, reach out for a consultation.</p>',
   ARRAY['ARS 25-403','arizona custody','best interests of the child','parenting time','family law'],
   'media/generated/ep41-header.png','media/generated/ep41-banner.png',
   'wp-10241','https://mymodernlaw.com/ars-25-403-custody','https://instagram.com/reel/abc41','https://facebook.com/modernlaw/posts/41','https://youtube.com/watch?v=arz41',
   'published','published','published','published','Modern Arizona'),
  ('media-arz-house-divorce','Who Gets the House in an Arizona Divorce?','Community property, buy-outs, and forced sale: what really happens to the marital home.',84,
   '<h2>The House Is Usually the Biggest Asset</h2><p>In Arizona, a home bought during the marriage is generally <strong>community property</strong>, which means both spouses have an equal interest regardless of whose name is on the title.</p><p>You have three basic options: one spouse buys out the other, you sell and split the proceeds, or you agree to a deferred sale. Each has tax and financing consequences worth discussing before you decide.</p>',
   ARRAY['arizona divorce','community property','marital home','ARS 25-211','asset division'],
   'media/generated/ep42-header.png',NULL, NULL,NULL,NULL,NULL,NULL,
   'draft','pending','pending','pending','Modern Arizona'),
  ('media-bol-scaling','How to Scale a Family Law Practice Without Burning Out','The systems, delegation, and metrics that let you grow without losing your evenings.',93,
   '<h2>Growth Is a Systems Problem</h2><p>Most family-law attorneys hit a ceiling not because of demand, but because everything routes through them. The fix is building intake, matter management, and billing systems that run without you.</p><p>Track three numbers weekly: consultation-to-retention rate, average matter value, and work-in-progress aging. They tell you where to hire next.</p>',
   ARRAY['law firm growth','legal practice management','delegation','business of law','scaling'],
   'media/generated/ep17-header.png','media/generated/ep17-banner.png',
   'wp-10198','https://billietarascio.com/scaling-family-law','https://instagram.com/reel/bol17','https://facebook.com/billietarascio/posts/17','https://youtube.com/watch?v=bol17',
   'published','published','published','published','Business of Law'),
  ('media-arz-relocation','Can You Move Out of State With Your Kids After Divorce?','Arizona''s relocation notice rules and what judges weigh when a parent wants to move.',90,
   '<h2>It Starts With Written Notice</h2><p>Under <strong>ARS 25-408</strong>, a parent who wants to relocate the children out of state (or more than 100 miles within Arizona) must give the other parent <strong>60 days'' advance written notice</strong> by certified mail.</p><p>If the other parent objects, the court decides based on the child''s best interests and a specific set of relocation factors. The move is never automatic.</p>',
   ARRAY['arizona relocation','ARS 25-408','move away','custody relocation','parenting time'],
   'media/generated/ep43-header.png',NULL, NULL,NULL,'https://instagram.com/reel/arz43',NULL,NULL,
   'failed','published','failed','pending','Modern Arizona'),
  ('media-bol-associate','Hiring Your First Associate Attorney','When to hire, how to structure comp, and how to keep them past year two.',81,
   '<h2>The Scariest Line Item</h2><p>Your first associate is the hire that turns a solo practice into a firm. The rule of thumb: hire when you''re consistently turning away good work, not when you''re merely busy.</p>',
   ARRAY['hiring associates','law firm growth','attorney compensation','business of law'],
   'media/generated/ep18-header.png',NULL, NULL,NULL,NULL,NULL,NULL,
   'draft','pending','pending','pending','Business of Law'),
  ('media-arz-grandparent','Do Grandparents Have Visitation Rights in Arizona?','The high bar ARS 25-409 sets for third-party and grandparent visitation.',95,
   '<h2>A Narrow but Real Door</h2><p>Arizona does allow grandparent visitation under <strong>ARS 25-409</strong>, but only in specific circumstances and only when it''s in the child''s best interests. The statute gives significant weight to a fit parent''s decisions.</p>',
   ARRAY['grandparent rights','ARS 25-409','third party visitation','arizona family law'],
   'media/generated/ep44-header.png','media/generated/ep44-banner.png',
   'wp-10155','https://mymodernlaw.com/grandparent-visitation-arizona','https://instagram.com/reel/arz44','https://facebook.com/modernlaw/posts/44','https://youtube.com/watch?v=arz44',
   'published','published','published','published','Modern Arizona')
) AS v(meeting_uuid, title, description, confidence_score, blog_html, seo_keywords, image_url, bannerbear_image_url,
       wordpress_post_id, wordpress_url, instagram_url, facebook_url, youtube_url, wp, ig, fb, yt, show_name)
JOIN public.intake_transcripts i ON i.meeting_uuid = v.meeting_uuid;

-- ---------- SEED: system_logs -----------------------------------------------
INSERT INTO public.system_logs (scenario_name, event_type, message, details, retry_count, status, created_at) VALUES
('prepare_episode','info','Episode media converted and transcript generated (Gemini).','{"provider":"gemini","duration_ms":48211,"file":"modern-arizona-ep41-ars403.mp4"}',0,'logged', now() - interval '4 days'),
('prepare_episode','warning','Gemini transcription timed out; fell back to OpenAI Whisper.','{"primary":"gemini","fallback":"whisper","file":"modern-arizona-ep42-house.mp4"}',1,'resolved', now() - interval '9 hours'),
('create_blog','info','SEO blog copy generated and WordPress draft created.','{"wordpress_post_id":"wp-10241","words":642}',0,'logged', now() - interval '4 days'),
('publish_instagram','error','Instagram Graph API returned 190: access token expired.','{"http_status":401,"code":190,"platform":"instagram","episode":"ep43"}',3,'retrying', now() - interval '2 days 5 hours'),
('publish_facebook','error','Facebook reel upload failed: rate limit (code 4).','{"http_status":429,"code":4,"platform":"facebook","episode":"ep43"}',2,'retrying', now() - interval '2 days 5 hours'),
('create_blog','error','WordPress REST returned 500 on post create; queued for retry.','{"http_status":500,"platform":"wordpress","episode":"ep43"}',4,'retrying', now() - interval '2 days 4 hours'),
('publish_youtube','info','YouTube upload complete.','{"video_id":"arz44","platform":"youtube"}',0,'logged', now() - interval '8 days'),
('clio_filing','info','Consultation note filed to Clio matter CLIO-MAT-004821.','{"clio_matter_id":"CLIO-MAT-004821","client":"Maria Reyes"}',0,'resolved', now() - interval '1 hour'),
('clio_matching','warning','Low-confidence Clio match (62%); routed to exception panel.','{"confidence":62,"meeting":"zoom-77c1aa02-nguyen"}',0,'logged', now() - interval '23 hours'),
('zoom_webhook','info','Zoom recording received and idempotency check passed.','{"meeting_uuid":"zoom-5a6b7c8d-carter"}',0,'logged', now() - interval '6 hours'),
('prepare_episode','info','Idempotency: duplicate file hash skipped, no reprocessing.','{"file_hash":"sha256:ep41-arz-2201"}',0,'resolved', now() - interval '3 days 12 hours'),
('publish_instagram','info','Instagram reel published successfully.','{"url":"https://instagram.com/reel/abc41"}',0,'logged', now() - interval '4 days'),
('create_blog','warning','Primary blog-copy model slow; used fallback model.','{"primary":"claude","fallback":"openai","episode":"ep17"}',1,'resolved', now() - interval '6 days'),
('meta_ads_report','error','Meta Ads insights fetch failed: OAuth token needs re-consent.','{"http_status":401,"platform":"meta","scenario":"meta_ads_report"}',5,'retrying', now() - interval '12 hours'),
('publish_facebook','info','Facebook reel published successfully.','{"url":"https://facebook.com/modernlaw/posts/44"}',0,'logged', now() - interval '8 days');

-- ---------- ADMIN LOGIN (admin@modernlaw.app / set your own password below) ---------------
-- Provisioned directly in auth.users via pgcrypto (idempotent).
DO $$
DECLARE uid uuid;
BEGIN
  DELETE FROM auth.identities WHERE provider_id IN (SELECT id::text FROM auth.users WHERE email='admin@modernlaw.app');
  DELETE FROM auth.users WHERE email='admin@modernlaw.app';
  uid := gen_random_uuid();
  INSERT INTO auth.users
    (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
     created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
     confirmation_token, recovery_token, email_change_token_new, email_change)
  VALUES
    ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
     'admin@modernlaw.app', extensions.crypt('CHANGE_ME_ADMIN_PASSWORD', extensions.gen_salt('bf')), now(),
     now(), now(), '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Modern Law Admin"}'::jsonb, '', '', '', '');
  INSERT INTO auth.identities
    (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES
    (gen_random_uuid(), uid,
     jsonb_build_object('sub', uid::text, 'email', 'admin@modernlaw.app', 'email_verified', true),
     'email', uid::text, now(), now(), now());
END $$;
