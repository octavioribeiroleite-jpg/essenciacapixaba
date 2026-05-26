ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_due numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS due_date date;

CREATE POLICY "Users can update their own sales"
ON public.sales
FOR UPDATE
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS sales_payment_status_idx ON public.sales(payment_status);
CREATE INDEX IF NOT EXISTS sales_due_date_idx ON public.sales(due_date);