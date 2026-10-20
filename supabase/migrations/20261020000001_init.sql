-- PIXEL CLAW CLUB
-- Private three-member group schema, constraints, and row level security.
-- Financial amounts live only in financial_records, which is not granted to the API roles.
-- Apply with the Supabase SQL editor or CLI. This file is the source of truth for production rules.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers. SECURITY DEFINER reads bypass RLS so policies can call them
-- without recursing. search_path is fixed. EXECUTE is granted explicitly.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seoul_week_start(ts timestamptz)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT date_trunc('week', ts AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul';
$$;

CREATE OR REPLACE FUNCTION public.seoul_week_end(ts timestamptz)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.seoul_week_start(ts) + interval '7 days';
$$;

CREATE OR REPLACE FUNCTION public.seoul_month_start(ts timestamptz)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT date_trunc('month', ts AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul';
$$;

CREATE OR REPLACE FUNCTION public.seoul_month_end(ts timestamptz)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.seoul_month_start(ts) + interval '1 month';
$$;

CREATE OR REPLACE FUNCTION public.is_active_member(p_group uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group AND user_id = auth.uid() AND status = 'ACTIVE'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_group_owner(p_group uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group AND user_id = auth.uid() AND status = 'ACTIVE' AND role = 'OWNER'
  );
$$;

CREATE OR REPLACE FUNCTION public.my_group_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT group_id FROM public.group_members
  WHERE user_id = auth.uid() AND status = 'ACTIVE'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.seoul_week_start(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seoul_week_end(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seoul_month_start(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seoul_month_end(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_group_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_group_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seoul_week_start(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seoul_week_end(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seoul_month_start(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seoul_month_end(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_group_id() TO authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname text NOT NULL CHECK (char_length(nickname) BETWEEN 1 AND 20),
  avatar_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  owner_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX groups_singleton ON public.groups ((true));

CREATE TABLE public.group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL CHECK (status IN ('INVITED', 'ACTIVE', 'REVOKED')),
  role text NOT NULL CHECK (role IN ('OWNER', 'MEMBER')),
  joined_at timestamptz,
  revoked_at timestamptz,
  UNIQUE (group_id, user_id)
);

CREATE UNIQUE INDEX group_members_one_active_owner
  ON public.group_members (group_id)
  WHERE role = 'OWNER' AND status = 'ACTIVE';

CREATE TABLE public.group_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by uuid REFERENCES auth.users(id),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.privacy_settings (
  member_id uuid PRIMARY KEY REFERENCES auth.users(id),
  group_id uuid NOT NULL REFERENCES public.groups(id),
  show_total_spending text NOT NULL DEFAULT 'PRIVATE' CHECK (show_total_spending IN ('PRIVATE', 'GROUP')),
  show_weekly_spending text NOT NULL DEFAULT 'PRIVATE' CHECK (show_weekly_spending IN ('PRIVATE', 'GROUP')),
  show_store_spending text NOT NULL DEFAULT 'PRIVATE' CHECK (show_store_spending IN ('PRIVATE', 'GROUP')),
  show_individual_record_amounts text NOT NULL DEFAULT 'PRIVATE' CHECK (show_individual_record_amounts IN ('PRIVATE', 'GROUP')),
  show_monthly_statistics text NOT NULL DEFAULT 'PRIVATE' CHECK (show_monthly_statistics IN ('PRIVATE', 'GROUP')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (group_id, member_id) REFERENCES public.group_members (group_id, user_id)
);

CREATE TABLE public.budget_settings (
  member_id uuid PRIMARY KEY REFERENCES auth.users(id),
  group_id uuid NOT NULL REFERENCES public.groups(id),
  weekly_budget_krw integer NOT NULL DEFAULT 10000 CHECK (weekly_budget_krw >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (group_id, member_id) REFERENCES public.group_members (group_id, user_id)
);

CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  address text NOT NULL DEFAULT '',
  latitude double precision,
  longitude double precision,
  notes text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (id, group_id),
  CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
  ),
  FOREIGN KEY (group_id, created_by) REFERENCES public.group_members (group_id, user_id)
);

CREATE TABLE public.visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  store_id uuid NOT NULL,
  member_id uuid NOT NULL,
  visited_at timestamptz NOT NULL,
  notes text NOT NULL DEFAULT '',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (id, group_id),
  FOREIGN KEY (store_id, group_id) REFERENCES public.stores (id, group_id),
  FOREIGN KEY (group_id, member_id) REFERENCES public.group_members (group_id, user_id),
  CHECK (created_by = member_id)
);

CREATE TABLE public.play_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  visit_id uuid NOT NULL,
  player_id uuid NOT NULL,
  created_by uuid NOT NULL,
  played_at timestamptz NOT NULL,
  attempt_count integer NOT NULL CHECK (attempt_count >= 1),
  win_count integer NOT NULL CHECK (win_count >= 0 AND win_count <= attempt_count),
  notes text NOT NULL DEFAULT '',
  machine_label text NOT NULL DEFAULT '',
  idempotency_key text,
  payload_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (id, group_id),
  FOREIGN KEY (visit_id, group_id) REFERENCES public.visits (id, group_id),
  FOREIGN KEY (group_id, player_id) REFERENCES public.group_members (group_id, user_id),
  CHECK (player_id = created_by)
);

CREATE UNIQUE INDEX play_records_idempotency
  ON public.play_records (created_by, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE public.financial_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  play_record_id uuid NOT NULL UNIQUE,
  group_id uuid NOT NULL,
  owner_member_id uuid NOT NULL,
  amount_spent integer NOT NULL CHECK (amount_spent >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (play_record_id, group_id) REFERENCES public.play_records (id, group_id),
  FOREIGN KEY (group_id, owner_member_id) REFERENCES public.group_members (group_id, user_id)
);

CREATE TABLE public.prize_designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  category text NOT NULL DEFAULT '기타',
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, group_id),
  UNIQUE (group_id, name)
);

CREATE TABLE public.prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  owner_member_id uuid NOT NULL,
  prize_design_id uuid NOT NULL,
  acquisition_play_record_id uuid,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '',
  visibility text NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PRIVATE', 'GROUP')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  unlink_note text,
  UNIQUE (id, group_id),
  FOREIGN KEY (group_id, owner_member_id) REFERENCES public.group_members (group_id, user_id),
  FOREIGN KEY (prize_design_id, group_id) REFERENCES public.prize_designs (id, group_id),
  FOREIGN KEY (acquisition_play_record_id, group_id) REFERENCES public.play_records (id, group_id)
);

CREATE TABLE public.prize_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prize_id uuid NOT NULL REFERENCES public.prizes(id),
  asset_type text NOT NULL CHECK (asset_type IN ('original', 'thumbnail', 'pixel', 'sprite')),
  storage_path text NOT NULL,
  processing_status text NOT NULL CHECK (processing_status IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED')),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prize_id, asset_type, version)
);

CREATE TABLE public.image_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prize_id uuid NOT NULL REFERENCES public.prizes(id),
  status text NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED')),
  version integer NOT NULL CHECK (version >= 1),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prize_id, version)
);

CREATE TABLE public.revenge_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  store_id uuid NOT NULL,
  created_by uuid NOT NULL,
  assigned_member_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'COMPLETED', 'ABANDONED')),
  reason text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  completion_play_record_id uuid,
  needs_review boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  FOREIGN KEY (store_id, group_id) REFERENCES public.stores (id, group_id),
  FOREIGN KEY (group_id, assigned_member_id) REFERENCES public.group_members (group_id, user_id),
  FOREIGN KEY (group_id, created_by) REFERENCES public.group_members (group_id, user_id),
  FOREIGN KEY (completion_play_record_id, group_id) REFERENCES public.play_records (id, group_id)
);

CREATE UNIQUE INDEX revenge_one_active_campaign
  ON public.revenge_targets (group_id, store_id, assigned_member_id)
  WHERE status = 'ACTIVE' AND deleted_at IS NULL;

CREATE TABLE public.village_level_thresholds (
  level integer PRIMARY KEY CHECK (level BETWEEN 1 AND 5),
  min_prizes integer NOT NULL CHECK (min_prizes >= 0),
  max_prizes integer,
  label text NOT NULL
);

INSERT INTO public.village_level_thresholds (level, min_prizes, max_prizes, label) VALUES
  (1, 0, 4, '풀밭 마을'),
  (2, 5, 14, '꽃과 나무'),
  (3, 15, 29, '작은 집'),
  (4, 30, 49, '연못 마을'),
  (5, 50, NULL, '넓은 마을');

CREATE TABLE public.village_states (
  group_id uuid PRIMARY KEY REFERENCES public.groups(id),
  current_level integer NOT NULL DEFAULT 1,
  unlocked_level integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.village_characters (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.groups(id),
  prize_id uuid NOT NULL UNIQUE REFERENCES public.prizes(id),
  owner_member_id uuid NOT NULL,
  display_name text NOT NULL,
  sprite_path text,
  col integer NOT NULL,
  row integer NOT NULL,
  introduced_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (group_id, owner_member_id) REFERENCES public.group_members (group_id, user_id)
);

CREATE TABLE public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid,
  actor_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id),
  recipient_id uuid NOT NULL REFERENCES auth.users(id),
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);

CREATE INDEX play_records_player_time ON public.play_records (player_id, played_at) WHERE deleted_at IS NULL;
CREATE INDEX financial_records_owner ON public.financial_records (owner_member_id);
CREATE INDEX prizes_owner ON public.prizes (group_id, owner_member_id) WHERE deleted_at IS NULL;
CREATE INDEX stores_group ON public.stores (group_id) WHERE deleted_at IS NULL;
CREATE INDEX visits_member ON public.visits (member_id, visited_at) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_group_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = NEW.id AND user_id = NEW.owner_id AND role = 'OWNER' AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'group owner must be an active owner member';
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER groups_owner_membership
AFTER INSERT OR UPDATE OF owner_id ON public.groups
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.assert_group_owner();

CREATE OR REPLACE FUNCTION public.enforce_member_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_count integer;
BEGIN
  IF NEW.status IS DISTINCT FROM 'ACTIVE' THEN
    RETURN NEW;
  END IF;
  PERFORM 1 FROM public.groups WHERE id = NEW.group_id FOR UPDATE;
  SELECT count(*) INTO active_count
  FROM public.group_members
  WHERE group_id = NEW.group_id AND status = 'ACTIVE';
  IF active_count > 3 THEN
    RAISE EXCEPTION 'group is full' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER group_members_capacity
AFTER INSERT OR UPDATE OF status ON public.group_members
FOR EACH ROW EXECUTE FUNCTION public.enforce_member_capacity();

CREATE OR REPLACE FUNCTION public.protect_owner_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.groups WHERE id = NEW.group_id AND owner_id = NEW.user_id
  ) AND (NEW.status <> 'ACTIVE' OR NEW.role <> 'OWNER') THEN
    RAISE EXCEPTION 'owner membership cannot be revoked without transferring ownership';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER group_members_protect_owner
BEFORE UPDATE ON public.group_members
FOR EACH ROW EXECUTE FUNCTION public.protect_owner_membership();

CREATE OR REPLACE FUNCTION public.ensure_member_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'ACTIVE' THEN
    INSERT INTO public.privacy_settings (member_id, group_id)
    VALUES (NEW.user_id, NEW.group_id)
    ON CONFLICT (member_id) DO NOTHING;
    INSERT INTO public.budget_settings (member_id, group_id)
    VALUES (NEW.user_id, NEW.group_id)
    ON CONFLICT (member_id) DO NOTHING;
    INSERT INTO public.village_states (group_id)
    VALUES (NEW.group_id)
    ON CONFLICT (group_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER group_members_settings
AFTER INSERT OR UPDATE OF status ON public.group_members
FOR EACH ROW EXECUTE FUNCTION public.ensure_member_settings();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nickname)
  VALUES (
    NEW.id,
    left(COALESCE(NULLIF(split_part(NEW.email, '@', 1), ''), '새 멤버'), 20)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER stores_touch BEFORE UPDATE ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER play_records_touch BEFORE UPDATE ON public.play_records
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER prizes_touch BEFORE UPDATE ON public.prizes
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Membership functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bootstrap_group(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  gid uuid := gen_random_uuid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  PERFORM pg_advisory_xact_lock(481516234);
  IF EXISTS (SELECT 1 FROM public.groups) THEN
    RAISE EXCEPTION 'group already exists';
  END IF;
  INSERT INTO public.groups (id, name, owner_id) VALUES (gid, btrim(p_name), uid);
  INSERT INTO public.group_members (group_id, user_id, status, role, joined_at)
  VALUES (gid, uid, 'ACTIVE', 'OWNER', now());
  RETURN gid;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_invitation(p_token_hash text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gid uuid;
  new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid invitation token';
  END IF;
  SELECT group_id INTO gid FROM public.group_members
  WHERE user_id = auth.uid() AND status = 'ACTIVE' AND role = 'OWNER';
  IF gid IS NULL THEN
    RAISE EXCEPTION 'owner only';
  END IF;
  INSERT INTO public.group_invitations (group_id, token_hash, expires_at, created_by)
  VALUES (gid, p_token_hash, now() + interval '7 days', auth.uid())
  RETURNING id INTO new_id;
  INSERT INTO public.audit_events (group_id, actor_id, action, entity_type, entity_id)
  VALUES (gid, auth.uid(), 'invitation_created', 'group_invitations', new_id);
  RETURN new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_invitation(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.group_invitations
  SET revoked_at = now()
  WHERE id = p_id AND used_at IS NULL AND revoked_at IS NULL AND public.is_group_owner(group_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_invitation(p_token_hash text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.group_invitations%ROWTYPE;
  active_count integer;
  existing public.group_members%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO inv FROM public.group_invitations WHERE token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid invitation';
  END IF;
  IF inv.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'invitation already used';
  END IF;
  IF inv.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'invitation revoked';
  END IF;
  IF inv.expires_at <= now() THEN
    UPDATE public.group_invitations SET revoked_at = now() WHERE id = inv.id;
    RAISE EXCEPTION 'invitation expired';
  END IF;
  PERFORM 1 FROM public.groups WHERE id = inv.group_id FOR UPDATE;
  SELECT * INTO existing FROM public.group_members
  WHERE group_id = inv.group_id AND user_id = auth.uid();
  IF existing.status = 'ACTIVE' THEN
    RAISE EXCEPTION 'already a member';
  END IF;
  SELECT count(*) INTO active_count FROM public.group_members
  WHERE group_id = inv.group_id AND status = 'ACTIVE';
  IF active_count >= 3 THEN
    RAISE EXCEPTION 'group is full';
  END IF;
  IF existing.id IS NOT NULL THEN
    UPDATE public.group_members
    SET status = 'ACTIVE', role = 'MEMBER', joined_at = now(), revoked_at = NULL
    WHERE id = existing.id;
  ELSE
    INSERT INTO public.group_members (group_id, user_id, status, role, joined_at)
    VALUES (inv.group_id, auth.uid(), 'ACTIVE', 'MEMBER', now());
  END IF;
  UPDATE public.group_invitations SET used_at = now(), used_by = auth.uid() WHERE id = inv.id;
  INSERT INTO public.audit_events (group_id, actor_id, action, entity_type, entity_id)
  VALUES (inv.group_id, auth.uid(), 'invitation_accepted', 'group_invitations', inv.id);
  RETURN inv.group_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_member(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gid uuid;
BEGIN
  SELECT group_id INTO gid FROM public.group_members
  WHERE user_id = auth.uid() AND status = 'ACTIVE' AND role = 'OWNER';
  IF gid IS NULL OR p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'owner cannot revoke that member';
  END IF;
  UPDATE public.group_members
  SET status = 'REVOKED', revoked_at = now()
  WHERE group_id = gid AND user_id = p_user_id AND status = 'ACTIVE';
END;
$$;

-- ---------------------------------------------------------------------------
-- Financial reads. Callers cannot pass another user id.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.budget_fingerprint(
  p_member uuid,
  p_week timestamptz,
  p_spent integer,
  p_amount integer,
  p_budget integer,
  p_record uuid
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT encode(digest(
    p_member::text || '|' ||
    to_char(p_week AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || '|' ||
    p_spent::text || '|' || p_amount::text || '|' || p_budget::text || '|' ||
    coalesce(p_record::text, ''),
    'sha256'
  ), 'hex');
$$;

CREATE OR REPLACE FUNCTION public.my_week_spent(p_played_at timestamptz, p_exclude uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(f.amount_spent), 0)::integer
  FROM public.financial_records f
  JOIN public.play_records p ON p.id = f.play_record_id
  WHERE f.owner_member_id = auth.uid()
    AND p.deleted_at IS NULL
    AND (p_exclude IS NULL OR p.id <> p_exclude)
    AND p.played_at >= public.seoul_week_start(p_played_at)
    AND p.played_at < public.seoul_week_end(p_played_at);
$$;

REVOKE ALL ON FUNCTION public.bootstrap_group(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_invitation(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_invitation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_invitation(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.budget_fingerprint(uuid, timestamptz, integer, integer, integer, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_week_spent(timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bootstrap_group(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invitation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_week_spent(timestamptz, uuid) TO authenticated;

-- budget_fingerprint is an implementation detail of save_play_record.
-- It is not granted to API roles.

CREATE OR REPLACE FUNCTION public.ranking_inputs(p_period text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gid uuid := public.my_group_id();
  range_start timestamptz;
  range_end timestamptz;
BEGIN
  IF gid IS NULL OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_period = 'week' THEN
    range_start := public.seoul_week_start(now());
    range_end := public.seoul_week_end(now());
  ELSIF p_period = 'month' THEN
    range_start := public.seoul_month_start(now());
    range_end := public.seoul_month_end(now());
  ELSIF p_period = 'all' THEN
    range_start := NULL;
    range_end := NULL;
  ELSE
    RAISE EXCEPTION 'invalid period';
  END IF;
  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT
        m.user_id AS member_id,
        pr.nickname,
        COALESCE((
          SELECT SUM(r.attempt_count) FROM public.play_records r
          WHERE r.player_id = m.user_id AND r.deleted_at IS NULL
            AND (range_start IS NULL OR (r.played_at >= range_start AND r.played_at < range_end))
        ), 0) AS attempt_count,
        COALESCE((
          SELECT SUM(r.win_count) FROM public.play_records r
          WHERE r.player_id = m.user_id AND r.deleted_at IS NULL
            AND (range_start IS NULL OR (r.played_at >= range_start AND r.played_at < range_end))
        ), 0) AS win_count,
        (
          SELECT count(*) FROM public.prizes z
          WHERE z.owner_member_id = m.user_id AND z.deleted_at IS NULL
            AND (range_start IS NULL OR (z.acquired_at >= range_start AND z.acquired_at < range_end))
        ) AS prize_count,
        (
          SELECT count(DISTINCT v.store_id) FROM public.visits v
          WHERE v.member_id = m.user_id AND v.deleted_at IS NULL
            AND (range_start IS NULL OR (v.visited_at >= range_start AND v.visited_at < range_end))
        ) AS distinct_store_count,
        (
          SELECT count(*) FROM public.revenge_targets g
          WHERE g.assigned_member_id = m.user_id AND g.status = 'COMPLETED' AND g.needs_review = false
            AND g.completed_at IS NOT NULL
            AND (range_start IS NULL OR (g.completed_at >= range_start AND g.completed_at < range_end))
        ) AS completed_revenge_count,
        (
          SELECT count(DISTINCT z.prize_design_id) FROM public.prizes z
          WHERE z.owner_member_id = m.user_id AND z.deleted_at IS NULL
            AND (range_start IS NULL OR (z.acquired_at >= range_start AND z.acquired_at < range_end))
        ) AS distinct_design_count,
        CASE
          WHEN (
            (p_period = 'week' AND ps.show_weekly_spending = 'GROUP')
            OR (p_period = 'month' AND ps.show_monthly_statistics = 'GROUP')
            OR (p_period = 'all' AND ps.show_total_spending = 'GROUP')
          )
          THEN (
            SELECT COALESCE(SUM(f.amount_spent), 0)
            FROM public.financial_records f
            JOIN public.play_records r ON r.id = f.play_record_id
            WHERE f.owner_member_id = m.user_id AND r.deleted_at IS NULL
              AND (range_start IS NULL OR (r.played_at >= range_start AND r.played_at < range_end))
          )
          ELSE NULL
        END AS spending
      FROM public.group_members m
      JOIN public.profiles pr ON pr.id = m.user_id
      JOIN public.privacy_settings ps ON ps.member_id = m.user_id
      WHERE m.group_id = gid AND m.status = 'ACTIVE'
    ) t
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.my_budget_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  budget integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  SELECT weekly_budget_krw INTO budget FROM public.budget_settings WHERE member_id = uid;
  RETURN jsonb_build_object(
    'budget', COALESCE(budget, 10000),
    'week_spent', COALESCE((
      SELECT SUM(f.amount_spent) FROM public.financial_records f
      JOIN public.play_records r ON r.id = f.play_record_id
      WHERE f.owner_member_id = uid AND r.deleted_at IS NULL
        AND r.played_at >= public.seoul_week_start(now())
        AND r.played_at < public.seoul_week_end(now())
    ), 0),
    'month_spent', COALESCE((
      SELECT SUM(f.amount_spent) FROM public.financial_records f
      JOIN public.play_records r ON r.id = f.play_record_id
      WHERE f.owner_member_id = uid AND r.deleted_at IS NULL
        AND r.played_at >= public.seoul_month_start(now())
        AND r.played_at < public.seoul_month_end(now())
    ), 0),
    'lifetime_spent', COALESCE((
      SELECT SUM(f.amount_spent) FROM public.financial_records f
      JOIN public.play_records r ON r.id = f.play_record_id
      WHERE f.owner_member_id = uid AND r.deleted_at IS NULL
    ), 0),
    'wins', COALESCE((
      SELECT SUM(win_count) FROM public.play_records
      WHERE player_id = uid AND deleted_at IS NULL
    ), 0),
    'week_start', public.seoul_week_start(now()),
    'week_end', public.seoul_week_end(now())
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.disclosed_period_spending(p_field text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gid uuid := public.my_group_id();
  range_start timestamptz;
  range_end timestamptz;
BEGIN
  IF gid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_field = 'show_weekly_spending' THEN
    range_start := public.seoul_week_start(now());
    range_end := public.seoul_week_end(now());
  ELSIF p_field = 'show_monthly_statistics' THEN
    range_start := public.seoul_month_start(now());
    range_end := public.seoul_month_end(now());
  ELSIF p_field = 'show_total_spending' THEN
    range_start := NULL;
    range_end := NULL;
  ELSE
    RAISE EXCEPTION 'invalid disclosure field';
  END IF;
  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'member_id', m.user_id,
      'nickname', pr.nickname,
      'spent', CASE
        WHEN m.user_id = auth.uid() THEN (
          SELECT COALESCE(SUM(f.amount_spent), 0)
          FROM public.financial_records f
          JOIN public.play_records r ON r.id = f.play_record_id
          WHERE f.owner_member_id = m.user_id AND r.deleted_at IS NULL
            AND (range_start IS NULL OR (r.played_at >= range_start AND r.played_at < range_end))
        )
        WHEN p_field = 'show_weekly_spending' AND ps.show_weekly_spending = 'GROUP' THEN (
          SELECT COALESCE(SUM(f.amount_spent), 0)
          FROM public.financial_records f
          JOIN public.play_records r ON r.id = f.play_record_id
          WHERE f.owner_member_id = m.user_id AND r.deleted_at IS NULL
            AND r.played_at >= range_start AND r.played_at < range_end
        )
        WHEN p_field = 'show_monthly_statistics' AND ps.show_monthly_statistics = 'GROUP' THEN (
          SELECT COALESCE(SUM(f.amount_spent), 0)
          FROM public.financial_records f
          JOIN public.play_records r ON r.id = f.play_record_id
          WHERE f.owner_member_id = m.user_id AND r.deleted_at IS NULL
            AND r.played_at >= range_start AND r.played_at < range_end
        )
        WHEN p_field = 'show_total_spending' AND ps.show_total_spending = 'GROUP' THEN (
          SELECT COALESCE(SUM(f.amount_spent), 0)
          FROM public.financial_records f
          JOIN public.play_records r ON r.id = f.play_record_id
          WHERE f.owner_member_id = m.user_id AND r.deleted_at IS NULL
        )
        ELSE NULL
      END
    )), '[]'::jsonb)
    FROM public.group_members m
    JOIN public.profiles pr ON pr.id = m.user_id
    JOIN public.privacy_settings ps ON ps.member_id = m.user_id
    WHERE m.group_id = gid AND m.status = 'ACTIVE'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.visible_record_amounts(p_ids uuid[])
RETURNS TABLE(play_record_id uuid, amount_spent integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.play_record_id, f.amount_spent
  FROM public.financial_records f
  JOIN public.privacy_settings ps ON ps.member_id = f.owner_member_id
  WHERE f.play_record_id = ANY(p_ids)
    AND public.is_active_member(f.group_id)
    AND (
      f.owner_member_id = auth.uid()
      OR ps.show_individual_record_amounts = 'GROUP'
    );
$$;

REVOKE ALL ON FUNCTION public.ranking_inputs(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_budget_dashboard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.disclosed_period_spending(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.visible_record_amounts(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ranking_inputs(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_budget_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.disclosed_period_spending(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.visible_record_amounts(uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.privacy_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.play_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prize_designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prize_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.image_processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenge_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.village_level_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.village_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.village_characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.group_members mine
    JOIN public.group_members theirs ON theirs.group_id = mine.group_id
    WHERE mine.user_id = auth.uid()
      AND mine.status = 'ACTIVE'
      AND theirs.user_id = profiles.id
      AND theirs.status = 'ACTIVE'
  )
);
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY groups_select ON public.groups FOR SELECT TO authenticated
USING (public.is_active_member(id));
CREATE POLICY groups_update ON public.groups FOR UPDATE TO authenticated
USING (public.is_group_owner(id)) WITH CHECK (public.is_group_owner(id));

CREATE POLICY members_select ON public.group_members FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_active_member(group_id));

CREATE POLICY privacy_select ON public.privacy_settings FOR SELECT TO authenticated
USING (member_id = auth.uid() OR public.is_active_member(group_id));
CREATE POLICY privacy_update ON public.privacy_settings FOR UPDATE TO authenticated
USING (member_id = auth.uid()) WITH CHECK (member_id = auth.uid());

CREATE POLICY budget_select ON public.budget_settings FOR SELECT TO authenticated
USING (member_id = auth.uid());
CREATE POLICY budget_update ON public.budget_settings FOR UPDATE TO authenticated
USING (member_id = auth.uid()) WITH CHECK (member_id = auth.uid());

CREATE POLICY stores_select ON public.stores FOR SELECT TO authenticated
USING (public.is_active_member(group_id) AND deleted_at IS NULL);
CREATE POLICY stores_insert ON public.stores FOR INSERT TO authenticated
WITH CHECK (public.is_active_member(group_id) AND created_by = auth.uid() AND group_id = public.my_group_id());
CREATE POLICY stores_update ON public.stores FOR UPDATE TO authenticated
USING (public.is_active_member(group_id) AND (created_by = auth.uid() OR public.is_group_owner(group_id)))
WITH CHECK (public.is_active_member(group_id));

CREATE POLICY visits_all ON public.visits FOR SELECT TO authenticated
USING (public.is_active_member(group_id));
CREATE POLICY visits_insert ON public.visits FOR INSERT TO authenticated
WITH CHECK (
  public.is_active_member(group_id) AND member_id = auth.uid() AND created_by = auth.uid()
  AND group_id = public.my_group_id()
);

CREATE POLICY records_select ON public.play_records FOR SELECT TO authenticated
USING (public.is_active_member(group_id));

CREATE POLICY designs_select ON public.prize_designs FOR SELECT TO authenticated
USING (public.is_active_member(group_id));
CREATE POLICY designs_insert ON public.prize_designs FOR INSERT TO authenticated
WITH CHECK (public.is_active_member(group_id) AND group_id = public.my_group_id());

CREATE POLICY prizes_select ON public.prizes FOR SELECT TO authenticated
USING (
  deleted_at IS NULL AND (
    owner_member_id = auth.uid()
    OR (visibility = 'GROUP' AND public.is_active_member(group_id))
  )
);
CREATE POLICY prizes_insert ON public.prizes FOR INSERT TO authenticated
WITH CHECK (owner_member_id = auth.uid() AND group_id = public.my_group_id());
CREATE POLICY prizes_update ON public.prizes FOR UPDATE TO authenticated
USING (owner_member_id = auth.uid()) WITH CHECK (owner_member_id = auth.uid());

CREATE POLICY assets_select ON public.prize_assets FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.prizes p
  WHERE p.id = prize_id AND (
    p.owner_member_id = auth.uid()
    OR (p.visibility = 'GROUP' AND public.is_active_member(p.group_id))
  )
));
CREATE POLICY assets_insert ON public.prize_assets FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.prizes p
  WHERE p.id = prize_id AND p.owner_member_id = auth.uid() AND p.deleted_at IS NULL
));

CREATE POLICY jobs_select ON public.image_processing_jobs FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.prizes p WHERE p.id = prize_id AND p.owner_member_id = auth.uid()
));
CREATE POLICY jobs_insert ON public.image_processing_jobs FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.prizes p WHERE p.id = prize_id AND p.owner_member_id = auth.uid()
));
CREATE POLICY jobs_update ON public.image_processing_jobs FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.prizes p WHERE p.id = prize_id AND p.owner_member_id = auth.uid()
));

CREATE POLICY revenge_select ON public.revenge_targets FOR SELECT TO authenticated
USING (public.is_active_member(group_id) AND deleted_at IS NULL);
CREATE POLICY revenge_insert ON public.revenge_targets FOR INSERT TO authenticated
WITH CHECK (
  public.is_active_member(group_id) AND created_by = auth.uid() AND status = 'ACTIVE'
  AND group_id = public.my_group_id()
);
CREATE POLICY revenge_update ON public.revenge_targets FOR UPDATE TO authenticated
USING (
  status = 'ACTIVE' AND public.is_active_member(group_id)
  AND (created_by = auth.uid() OR assigned_member_id = auth.uid() OR public.is_group_owner(group_id))
)
WITH CHECK (status IN ('ACTIVE', 'ABANDONED'));

CREATE POLICY levels_select ON public.village_level_thresholds FOR SELECT TO authenticated
USING (true);
CREATE POLICY village_select ON public.village_states FOR SELECT TO authenticated
USING (public.is_active_member(group_id));
CREATE POLICY characters_select ON public.village_characters FOR SELECT TO authenticated
USING (public.is_active_member(group_id));
CREATE POLICY characters_update ON public.village_characters FOR UPDATE TO authenticated
USING (public.is_active_member(group_id))
WITH CHECK (public.is_active_member(group_id));

CREATE POLICY audit_select ON public.audit_events FOR SELECT TO authenticated
USING (group_id IS NOT NULL AND public.is_active_member(group_id));
CREATE POLICY notifications_select ON public.notification_events FOR SELECT TO authenticated
USING (recipient_id = auth.uid());
CREATE POLICY notifications_update ON public.notification_events FOR UPDATE TO authenticated
USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());

GRANT SELECT ON public.profiles, public.groups, public.group_members, public.privacy_settings,
  public.budget_settings, public.stores, public.visits, public.play_records, public.prize_designs,
  public.prizes, public.prize_assets, public.image_processing_jobs, public.revenge_targets,
  public.village_level_thresholds, public.village_states, public.village_characters,
  public.audit_events, public.notification_events TO authenticated;
GRANT INSERT ON public.stores, public.visits, public.prize_designs, public.prizes, public.revenge_targets,
  public.prize_assets, public.image_processing_jobs TO authenticated;
GRANT UPDATE ON public.profiles, public.groups, public.privacy_settings, public.budget_settings,
  public.stores, public.prizes, public.revenge_targets, public.village_characters,
  public.notification_events, public.prize_assets, public.image_processing_jobs TO authenticated;

REVOKE ALL ON public.financial_records FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.group_invitations FROM PUBLIC, anon, authenticated;

CREATE VIEW public.invitation_summaries AS
SELECT id, group_id, expires_at, used_at, used_by, created_by, revoked_at, created_at
FROM public.group_invitations
WHERE public.is_group_owner(group_id);

GRANT SELECT ON public.invitation_summaries TO authenticated;

-- Play-record mutations and image bytes are performed by later SQL functions
-- and server actions. financial_records has no API grant.
