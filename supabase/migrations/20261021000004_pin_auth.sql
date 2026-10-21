-- Do not apply this file to the current production database.
-- It drops credential columns. Apply 20261021000005_club_member_auth.sql instead.
-- Character slots for the three club members.
-- Safe to run again after an older copy of this file created the PIN registration function.
-- Do not run 20261020000001, 20261020000002, or 20261020000003 again.
-- Slot rows are not readable by anon or authenticated.

CREATE TABLE IF NOT EXISTS public.member_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  character_slot smallint NOT NULL CHECK (character_slot BETWEEN 1 AND 3),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.member_credentials DROP COLUMN IF EXISTS pin_hash;
ALTER TABLE public.member_credentials DROP COLUMN IF EXISTS failed_attempts;
ALTER TABLE public.member_credentials DROP COLUMN IF EXISTS locked_until;
ALTER TABLE public.member_credentials DROP COLUMN IF EXISTS updated_at;

CREATE UNIQUE INDEX IF NOT EXISTS member_credentials_one_slot ON public.member_credentials (character_slot);

ALTER TABLE public.member_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_credentials FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.auth_throttle (
  subject_hash text PRIMARY KEY CHECK (subject_hash ~ '^[0-9a-f]{64}$'),
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.auth_throttle ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_throttle FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_club_member(
  p_user_id uuid,
  p_nickname text,
  p_slot smallint
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gid uuid;
  active_count integer;
  nick text := btrim(p_nickname);
BEGIN
  IF p_user_id IS NULL OR p_slot IS NULL OR p_slot NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'invalid member registration';
  END IF;
  IF nick IS NULL OR char_length(nick) < 1 OR char_length(nick) > 20 THEN
    RAISE EXCEPTION 'invalid nickname';
  END IF;

  PERFORM pg_advisory_xact_lock(481516234);

  IF EXISTS (SELECT 1 FROM public.member_credentials WHERE character_slot = p_slot) THEN
    RAISE EXCEPTION 'character taken';
  END IF;
  IF EXISTS (SELECT 1 FROM public.member_credentials WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'member already registered';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    JOIN public.member_credentials AS credential ON credential.user_id = profile.id
    WHERE lower(profile.nickname) = lower(nick)
  ) THEN
    RAISE EXCEPTION 'nickname taken';
  END IF;

  SELECT count(*) INTO active_count FROM public.member_credentials;
  IF active_count >= 3 THEN
    RAISE EXCEPTION 'group is full';
  END IF;

  SELECT id INTO gid FROM public.groups LIMIT 1;
  IF gid IS NULL THEN
    INSERT INTO public.groups (name, owner_id)
    VALUES ('PIXEL CLAW CLUB', p_user_id)
    RETURNING id INTO gid;
    INSERT INTO public.group_members (group_id, user_id, status, role, joined_at)
    VALUES (gid, p_user_id, 'ACTIVE', 'OWNER', now());
  ELSE
    PERFORM 1 FROM public.groups WHERE id = gid FOR UPDATE;
    SELECT count(*) INTO active_count
    FROM public.group_members
    WHERE group_id = gid AND status = 'ACTIVE';
    IF active_count >= 3 THEN
      RAISE EXCEPTION 'group is full';
    END IF;
    INSERT INTO public.group_members (group_id, user_id, status, role, joined_at)
    VALUES (gid, p_user_id, 'ACTIVE', 'MEMBER', now());
  END IF;

  UPDATE public.profiles
  SET nickname = nick
  WHERE id = p_user_id;
  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, nickname) VALUES (p_user_id, nick);
  END IF;

  INSERT INTO public.member_credentials (user_id, character_slot)
  VALUES (p_user_id, p_slot);

  RETURN gid;
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_subject_locked(p_subject_hash text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.auth_throttle
    WHERE subject_hash = p_subject_hash
      AND locked_until IS NOT NULL
      AND locked_until > now()
  );
$$;

CREATE OR REPLACE FUNCTION public.record_auth_failure(p_subject_hash text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.auth_throttle%ROWTYPE;
  attempts integer;
BEGIN
  IF p_subject_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid throttle subject';
  END IF;
  SELECT * INTO row
  FROM public.auth_throttle
  WHERE subject_hash = p_subject_hash
  FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.auth_throttle (subject_hash, failed_attempts, window_started_at)
    VALUES (p_subject_hash, 1, now());
    RETURN;
  END IF;
  IF row.locked_until IS NOT NULL AND row.locked_until > now() THEN
    RETURN;
  END IF;
  IF row.window_started_at <= now() - interval '15 minutes'
     OR (row.locked_until IS NOT NULL AND row.locked_until <= now()) THEN
    UPDATE public.auth_throttle
    SET failed_attempts = 1,
        window_started_at = now(),
        locked_until = NULL,
        updated_at = now()
    WHERE subject_hash = p_subject_hash;
    RETURN;
  END IF;
  attempts := row.failed_attempts + 1;
  UPDATE public.auth_throttle
  SET failed_attempts = attempts,
      locked_until = CASE
        WHEN attempts >= 20 THEN now() + interval '15 minutes'
        ELSE NULL
      END,
      updated_at = now()
  WHERE subject_hash = p_subject_hash;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_auth_failure(p_subject_hash text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_subject_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid throttle subject';
  END IF;
  DELETE FROM public.auth_throttle WHERE subject_hash = p_subject_hash;
END;
$$;

DROP FUNCTION IF EXISTS public.register_pin_member(uuid, text, smallint, text);
DROP FUNCTION IF EXISTS public.register_pin_member(uuid, text, integer, text);

REVOKE ALL ON FUNCTION public.register_club_member(uuid, text, smallint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auth_subject_locked(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_auth_failure(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clear_auth_failure(text) FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.member_credentials, public.auth_throttle TO service_role;
GRANT EXECUTE ON FUNCTION public.register_club_member(uuid, text, smallint) TO service_role;
GRANT EXECUTE ON FUNCTION public.auth_subject_locked(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_auth_failure(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_auth_failure(text) TO service_role;
