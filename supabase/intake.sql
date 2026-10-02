-- =============================================================================
-- MODERN LAW — Consultation Intake Automation: schema (additive)
-- Adds role-gating (profiles) + the intake state machine (intake_leads/steps)
-- + small config tables. Safe to re-run. See "INTAKE AUTOMATION - MASTER PLAN.md".
-- =============================================================================

-- ---------- ROLE-GATING: profiles --------------------------------------------
-- One row per auth user. role decides which section of the dashboard they see:
--   content = existing content pages (upload/blogs/archive/gbp/…)
--   intake  = the new consultation-intake pages
--   admin   = both
CREATE TABLE IF NOT EXISTS public.profiles (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'content' CHECK (role IN ('content', 'intake', 'admin')),
  full_name  text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles select authenticated" ON public.profiles;
CREATE POLICY "profiles select authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);
-- No INSERT/UPDATE/DELETE policy: role changes go through service_role only,
-- so a signed-in user can never escalate their own role.

-- Auto-create a profile (least-privilege 'content') for every new auth user.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, role)
  VALUES (new.id, 'content')
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill: existing users are the current team (they see everything today) -> admin.
INSERT INTO public.profiles (id, role)
  SELECT id, 'admin' FROM auth.users
  ON CONFLICT (id) DO NOTHING;

-- ---------- INTAKE ENUMS -----------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'intake_lead_source') THEN
    CREATE TYPE public.intake_lead_source AS ENUM ('lexidesk', 'acuity', 'manual');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'intake_method') THEN
    CREATE TYPE public.intake_method AS ENUM ('zoom', 'phone', 'in_person');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'intake_office') THEN
    CREATE TYPE public.intake_office AS ENUM ('mesa', 'peoria', 'scottsdale', 'tucson');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'intake_consult_type') THEN
    CREATE TYPE public.intake_consult_type AS ENUM ('IC', 'LSS');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'intake_conflict_status') THEN
    CREATE TYPE public.intake_conflict_status AS ENUM ('pending', 'clear', 'conflict');
  END IF;
END $$;

-- ---------- INTAKE LEADS (one row per consultation booking) -------------------
-- `status` is the state machine; kept as text + CHECK so new states can be added
-- without an enum migration. See MASTER PLAN §6.
CREATE TABLE IF NOT EXISTS public.intake_leads (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source              public.intake_lead_source NOT NULL DEFAULT 'manual',
  external_id         text,                         -- LexiDesk conversation id / Acuity appt id (idempotency)
  -- client
  client_first        text,
  client_last         text,
  email               text,
  phone               text,
  -- booking
  consult_datetime    timestamptz,
  method              public.intake_method,
  office              public.intake_office,
  self_scheduled      boolean,
  consult_type        public.intake_consult_type,
  -- matter
  matter_type         text,
  opposing_party_name text,                         -- NULL / 'N/A' when none
  county              text,
  referral_source     text DEFAULT 'Google',
  description         text,
  priority_score      int,
  qualified           boolean,
  recording_url       text,
  -- people
  consulting_attorney text,
  assigned_advocate   text,                         -- Shane | Mandie | Mia | NULL
  -- clio ids
  clio_matter_id      text,
  clio_client_contact_id text,
  clio_op_contact_id  text,
  clio_portal_id      text,
  -- gates + state
  conflict_status     public.intake_conflict_status NOT NULL DEFAULT 'pending',
  status              text NOT NULL DEFAULT 'received' CHECK (status IN (
                        'received','enriched','conflict_pending','conflict_clear','stopped',
                        'matter_created','manage_finished','portal_sent','text_sent',
                        'slack_pending','slack_posted','tasks_set','done','failed')),
  raw_payload         jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
-- idempotency: a re-delivered webhook for the same booking must not double-insert
CREATE UNIQUE INDEX IF NOT EXISTS intake_leads_source_external_uidx
  ON public.intake_leads (source, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS intake_leads_status_idx     ON public.intake_leads (status);
CREATE INDEX IF NOT EXISTS intake_leads_created_at_idx ON public.intake_leads (created_at DESC);

ALTER TABLE public.intake_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "intake_leads authenticated" ON public.intake_leads;
CREATE POLICY "intake_leads authenticated" ON public.intake_leads
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- The LexiDesk/Acuity webhook writes via service_role (RLS-bypass); the dashboard
-- reads + gate-writes via the authenticated SSR session.

-- ---------- INTAKE STEPS (per-lead step status for the timeline + recovery) ---
CREATE TABLE IF NOT EXISTS public.intake_steps (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    uuid NOT NULL REFERENCES public.intake_leads(id) ON DELETE CASCADE,
  step_key   text NOT NULL,                         -- e.g. 'conflict_check','create_matter','slack_post'
  state      text NOT NULL DEFAULT 'pending' CHECK (state IN (
               'pending','running','done','skipped','failed','awaiting_human')),
  detail     jsonb,
  error      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS intake_steps_lead_step_uidx ON public.intake_steps (lead_id, step_key);
CREATE INDEX IF NOT EXISTS intake_steps_lead_idx ON public.intake_steps (lead_id);

ALTER TABLE public.intake_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "intake_steps authenticated" ON public.intake_steps;
CREATE POLICY "intake_steps authenticated" ON public.intake_steps
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---------- CONFIG: office addresses (seeded) + attorney zoom links -----------
CREATE TABLE IF NOT EXISTS public.office_addresses (
  office  public.intake_office PRIMARY KEY,
  address text NOT NULL
);
INSERT INTO public.office_addresses (office, address) VALUES
  ('mesa',       '4540 E Baseline Road, Suite 105, Mesa, AZ 85206'),
  ('peoria',     '7972 W Thunderbird Road, Suite 106, Peoria, AZ 85381'),
  ('scottsdale', '8707 East Vista Bonita Drive, Suite 155, Scottsdale, AZ 85255'),
  ('tucson',     '7538 N La Cholla Blvd, Tucson, AZ 85741')
ON CONFLICT (office) DO UPDATE SET address = EXCLUDED.address;

CREATE TABLE IF NOT EXISTS public.attorney_zoom_links (
  attorney_name text PRIMARY KEY,                   -- full name, matches consulting_attorney
  zoom_link     text NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.office_addresses    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attorney_zoom_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "office_addresses authenticated" ON public.office_addresses;
CREATE POLICY "office_addresses authenticated" ON public.office_addresses
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "attorney_zoom_links authenticated" ON public.attorney_zoom_links;
CREATE POLICY "attorney_zoom_links authenticated" ON public.attorney_zoom_links
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
