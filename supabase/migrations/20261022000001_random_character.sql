-- Random character assignment for new club members.
-- Does not drop tables, columns, functions, or existing rows.
-- Does not update or delete the current 검증A credential.
-- Does not grant financial_records and does not disable row level security.
-- Run once in the Supabase SQL Editor after 20261021000006_login_directory.sql.
-- Adding a fourth character later means inserting a club_characters row and widening
-- member_credentials.character_slot check. Do not do that in this file.

CREATE TABLE IF NOT EXISTS public.club_characters (
  slot smallint PRIMARY KEY CHECK (slot BETWEEN 1 AND 99),
  name text NOT NULL UNIQUE CHECK (char_length(btrim(name)) BETWEEN 1 AND 20)
);

INSERT INTO public.club_characters (slot, name)
VALUES (1, '냥집게'), (2, '곰하트'), (3, '토끼별')
ON CONFLICT (slot) DO NOTHING;

ALTER TABLE public.club_characters ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.club_characters FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_club_member_auto(
  p_user_id uuid,
  p_nickname text
)
RETURNS smallint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gid uuid;
  active_count integer;
  chosen smallint;
  nick text := btrim(p_nickname);
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid member registration';
  END IF;
  IF nick IS NULL OR char_length(nick) < 1 OR char_length(nick) > 20 THEN
    RAISE EXCEPTION 'invalid nickname';
  END IF;

  PERFORM pg_advisory_xact_lock(481516234);

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

  SELECT catalog.slot INTO chosen
  FROM public.club_characters AS catalog
  WHERE catalog.slot BETWEEN 1 AND 3
    AND NOT EXISTS (
      SELECT 1
      FROM public.member_credentials AS credential
      WHERE credential.character_slot = catalog.slot
    )
  ORDER BY random()
  LIMIT 1;
  IF chosen IS NULL THEN
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
  VALUES (p_user_id, chosen);

  RETURN chosen;
END;
$$;

REVOKE ALL ON FUNCTION public.register_club_member_auto(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_club_member_auto(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.change_my_character(p_slot smallint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR p_slot IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  PERFORM pg_advisory_xact_lock(481516234);

  IF NOT EXISTS (
    SELECT 1 FROM public.club_characters
    WHERE slot = p_slot AND slot BETWEEN 1 AND 3
  ) THEN
    RAISE EXCEPTION 'invalid character';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.member_credentials
    WHERE character_slot = p_slot AND user_id <> uid
  ) THEN
    RAISE EXCEPTION 'character taken';
  END IF;

  UPDATE public.member_credentials
  SET character_slot = p_slot
  WHERE user_id = uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'member not registered';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.change_my_character(smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_my_character(smallint) TO authenticated;
