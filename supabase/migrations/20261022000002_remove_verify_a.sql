-- Remove only the 검증A test account after the live check on 2026-10-22.
-- Target auth user: 987fe9c1-77d9-4a0b-869f-2ae2d875916b
-- Target group: c45417e6-fc4c-4be6-a08a-0b87f03a3c9f
-- Aborts without deleting anything when another user, a store, a record, a prize,
-- a financial row, or an invitation exists.
-- Does not drop tables or erase every row in the database.
-- Run this once in the Supabase SQL Editor. Paste this file only.
-- After it succeeds, run 20261022000001_random_character.sql.

BEGIN;

DO $$
DECLARE
  target uuid := '987fe9c1-77d9-4a0b-869f-2ae2d875916b';
  gid uuid := 'c45417e6-fc4c-4be6-a08a-0b87f03a3c9f';
  nick text;
BEGIN
  SELECT nickname INTO nick FROM public.profiles WHERE id = target;
  IF nick IS DISTINCT FROM '검증A' THEN
    RAISE EXCEPTION 'target profile is not 검증A';
  END IF;
  IF (SELECT count(*) FROM auth.users) <> 1
     OR (SELECT count(*) FROM auth.users WHERE id = target) <> 1 THEN
    RAISE EXCEPTION 'expected exactly one auth user';
  END IF;
  IF (SELECT count(*) FROM public.profiles) <> 1
     OR (SELECT count(*) FROM public.group_members) <> 1
     OR (SELECT count(*) FROM public.groups) <> 1 THEN
    RAISE EXCEPTION 'expected one profile, one member, and one group';
  END IF;
  IF EXISTS (SELECT 1 FROM public.group_members WHERE user_id <> target OR group_id <> gid) THEN
    RAISE EXCEPTION 'another member exists';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.groups
    WHERE id = gid AND owner_id = target AND name = 'PIXEL CLAW CLUB'
  ) THEN
    RAISE EXCEPTION 'group owner does not match';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE user_id = target AND group_id = gid AND role = 'OWNER' AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'target is not the active owner';
  END IF;

  IF (SELECT count(*) FROM public.stores) <> 0 THEN
    RAISE EXCEPTION 'stores exist';
  END IF;
  IF (SELECT count(*) FROM public.visits) <> 0 THEN
    RAISE EXCEPTION 'visits exist';
  END IF;
  IF (SELECT count(*) FROM public.play_records) <> 0 THEN
    RAISE EXCEPTION 'play records exist';
  END IF;
  IF (SELECT count(*) FROM public.financial_records) <> 0 THEN
    RAISE EXCEPTION 'financial records exist';
  END IF;
  IF (SELECT count(*) FROM public.prizes) <> 0
     OR (SELECT count(*) FROM public.prize_assets) <> 0
     OR (SELECT count(*) FROM public.prize_designs) <> 0
     OR (SELECT count(*) FROM public.image_processing_jobs) <> 0 THEN
    RAISE EXCEPTION 'prize rows exist';
  END IF;
  IF (SELECT count(*) FROM public.revenge_targets) <> 0 THEN
    RAISE EXCEPTION 'revenge targets exist';
  END IF;
  IF (SELECT count(*) FROM public.village_characters) <> 0 THEN
    RAISE EXCEPTION 'village characters exist';
  END IF;
  IF (SELECT count(*) FROM public.group_invitations) <> 0 THEN
    RAISE EXCEPTION 'invitations exist';
  END IF;
  IF (SELECT count(*) FROM public.privacy_settings WHERE member_id <> target) <> 0
     OR (SELECT count(*) FROM public.budget_settings WHERE member_id <> target) <> 0 THEN
    RAISE EXCEPTION 'another member setting exists';
  END IF;

  DELETE FROM public.privacy_settings WHERE member_id = target;
  DELETE FROM public.budget_settings WHERE member_id = target;
  DELETE FROM public.notification_events WHERE recipient_id = target OR group_id = gid;
  DELETE FROM public.audit_events WHERE actor_id = target OR group_id = gid;
  DELETE FROM public.village_states WHERE group_id = gid;
  DELETE FROM public.member_credentials WHERE user_id = target;
  DELETE FROM public.group_members WHERE user_id = target AND group_id = gid;
  DELETE FROM public.groups WHERE id = gid AND owner_id = target;
  DELETE FROM auth.users WHERE id = target;

  IF (SELECT count(*) FROM auth.users) <> 0
     OR (SELECT count(*) FROM public.profiles) <> 0
     OR (SELECT count(*) FROM public.group_members) <> 0
     OR (SELECT count(*) FROM public.groups) <> 0
     OR (SELECT count(*) FROM public.member_credentials) <> 0 THEN
    RAISE EXCEPTION 'test account cleanup did not finish';
  END IF;
END $$;

COMMIT;
