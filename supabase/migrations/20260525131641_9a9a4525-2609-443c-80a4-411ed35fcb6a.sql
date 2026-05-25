ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS fragrance_notes jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS concentration text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS longevity text,
  ADD COLUMN IF NOT EXISTS sillage text;