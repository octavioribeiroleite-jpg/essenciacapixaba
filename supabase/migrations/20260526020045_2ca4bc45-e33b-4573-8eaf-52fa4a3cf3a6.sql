ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS first_paid boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS first_due_date date;