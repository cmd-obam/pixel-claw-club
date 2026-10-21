-- Additive login directory and private prize-image policies.
-- Does not drop tables, columns, functions, or existing rows.
-- Does not grant financial_records and does not disable row level security.
-- Run once in the Supabase SQL Editor after 20261021000005_club_member_auth.sql.
-- Do not run 20261021000004_pin_auth.sql.

CREATE OR REPLACE FUNCTION public.club_login_directory()
RETURNS TABLE(character_slot smallint, user_id uuid, nickname text, active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT credential.character_slot,
         credential.user_id,
         profile.nickname,
         EXISTS (
           SELECT 1
           FROM public.group_members AS member
           WHERE member.user_id = credential.user_id
             AND member.status = 'ACTIVE'
         ) AS active
  FROM public.member_credentials AS credential
  JOIN public.profiles AS profile ON profile.id = credential.user_id;
$$;

REVOKE ALL ON FUNCTION public.club_login_directory() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.club_login_directory() TO service_role;

CREATE OR REPLACE FUNCTION public.can_read_prize_object(object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parts text[];
  prize uuid;
  owner uuid;
  gid uuid;
  vis text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  parts := string_to_array(object_name, '/');
  IF coalesce(array_length(parts, 1), 0) < 2 THEN
    RETURN false;
  END IF;
  prize := parts[2]::uuid;
  SELECT owner_member_id, group_id, visibility
  INTO owner, gid, vis
  FROM public.prizes
  WHERE id = prize AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF owner = auth.uid() THEN
    RETURN true;
  END IF;
  RETURN vis = 'GROUP' AND public.is_active_member(gid);
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.can_read_prize_object(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_prize_object(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_write_prize_object(object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parts text[];
  prize uuid;
  owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  parts := string_to_array(object_name, '/');
  IF coalesce(array_length(parts, 1), 0) < 2 THEN
    RETURN false;
  END IF;
  prize := parts[2]::uuid;
  SELECT owner_member_id INTO owner
  FROM public.prizes
  WHERE id = prize AND deleted_at IS NULL;
  RETURN owner = auth.uid();
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.can_write_prize_object(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_write_prize_object(text) TO authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('prize-assets', 'prize-assets', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'prize_assets_select'
  ) THEN
    CREATE POLICY prize_assets_select ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'prize-assets' AND public.can_read_prize_object(name));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'prize_assets_insert'
  ) THEN
    CREATE POLICY prize_assets_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'prize-assets' AND public.can_write_prize_object(name));
  END IF;
END $$;
