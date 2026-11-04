-- Team members: email invites and the record of who opened the dashboard.
-- Safe to run more than once. Both tables are read and written only by the
-- server (service role): row level security is on, with no policies.

CREATE TABLE IF NOT EXISTS public.member_invites (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash   text NOT NULL UNIQUE,
  email        text NOT NULL,
  full_name    text NOT NULL,
  role         text NOT NULL CHECK (role IN ('content', 'intake')),
  invited_by   text NOT NULL,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'canceled')),
  expires_at   timestamptz NOT NULL,
  responded_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS member_invites_one_pending ON public.member_invites (email) WHERE status = 'pending';
ALTER TABLE public.member_invites ENABLE ROW LEVEL SECURITY;

-- No link to auth.users: the history stays after a member is removed.
CREATE TABLE IF NOT EXISTS public.login_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  email      text NOT NULL,
  full_name  text,
  role       text NOT NULL CHECK (role IN ('content', 'intake', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_events_created ON public.login_events (created_at DESC);
CREATE INDEX IF NOT EXISTS login_events_user ON public.login_events (user_id, created_at DESC);
ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;
