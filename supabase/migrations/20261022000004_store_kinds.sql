-- Adds classification fields. Does not delete or rewrite member stores, visits, or records.
-- Rows a member has already confirmed (verified_by) are left unchanged by later imports.

ALTER TABLE public.public_stores
  ADD COLUMN IF NOT EXISTS store_kind text,
  ADD COLUMN IF NOT EXISTS claw_presence text,
  ADD COLUMN IF NOT EXISTS classification_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS classification_confidence text NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

DO $$
BEGIN
  ALTER TABLE public.public_stores
    ADD CONSTRAINT public_stores_store_kind_check
    CHECK (store_kind IS NULL OR store_kind IN ('CLAW', 'ARCADE', 'UNKNOWN'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.public_stores
    ADD CONSTRAINT public_stores_claw_presence_check
    CHECK (claw_presence IS NULL OR claw_presence IN ('YES', 'NO', 'UNKNOWN'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS public_stores_kind_map
  ON public.public_stores (store_kind, latitude, longitude)
  WHERE business_status = '영업/정상' AND latitude IS NOT NULL;
