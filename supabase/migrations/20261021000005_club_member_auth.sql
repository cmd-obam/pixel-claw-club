-- Additive login function for the current production database.
-- Does not drop tables, columns, functions, or existing rows.
-- Do not run 20261021000004_pin_auth.sql against production. That file drops columns.
-- Run this file once in the Supabase SQL Editor after 20261020000001 and 20261020000002.
-- 20261020000003 remains separate and is only for the prize-assets bucket.

ALTER TABLE public.member_credentials ALTER COLUMN pin_hash DROP NOT NULL;
ALTER TABLE public.member_credentials ALTER COLUMN failed_attempts SET DEFAULT 0;
ALTER TABLE public.member_credentials ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.member_credentials ALTER COLUMN updated_at SET DEFAULT now();

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

REVOKE ALL ON FUNCTION public.register_club_member(uuid, text, smallint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_club_member(uuid, text, smallint) TO service_role;

DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc AS p
    JOIN pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'register_pin_member'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END $$;
