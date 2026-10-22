-- Nationwide youth-game license places. Club stores, visits, and records are not modified.

CREATE TABLE IF NOT EXISTS public.public_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  source_id text NOT NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  address text NOT NULL DEFAULT '',
  latitude double precision,
  longitude double precision,
  business_status text NOT NULL,
  detail_status text NOT NULL DEFAULT '',
  classification text NOT NULL CHECK (classification IN ('related', 'uncertain')),
  region_name text NOT NULL DEFAULT '',
  source_updated_at timestamptz,
  data_as_of date,
  imported_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR (latitude BETWEEN 33 AND 39.2 AND longitude BETWEEN 124.4 AND 132.1)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS public_stores_source_id
  ON public.public_stores (source, source_id);

CREATE INDEX IF NOT EXISTS public_stores_map
  ON public.public_stores (latitude, longitude)
  WHERE classification = 'related' AND business_status = '영업/정상' AND latitude IS NOT NULL;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS public_store_id uuid;

DO $$
BEGIN
  ALTER TABLE public.stores
    ADD CONSTRAINT stores_public_store_fk
    FOREIGN KEY (public_store_id) REFERENCES public.public_stores (id)
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS stores_one_public_link
  ON public.stores (group_id, public_store_id)
  WHERE public_store_id IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE public.public_stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_stores_select ON public.public_stores;
CREATE POLICY public_stores_select ON public.public_stores
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members
      WHERE user_id = auth.uid() AND status = 'ACTIVE'
    )
  );

REVOKE ALL ON public.public_stores FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_stores TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.public_stores TO service_role;
