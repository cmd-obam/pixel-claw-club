-- Supabase Storage policies for private prize images.
-- Requires the storage schema. Do not apply this file to a plain PostgreSQL database.

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

INSERT INTO storage.buckets (id, name, public)
VALUES ('prize-assets', 'prize-assets', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY prize_assets_select ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'prize-assets' AND public.can_read_prize_object(name));

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

CREATE POLICY prize_assets_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'prize-assets' AND public.can_write_prize_object(name));
