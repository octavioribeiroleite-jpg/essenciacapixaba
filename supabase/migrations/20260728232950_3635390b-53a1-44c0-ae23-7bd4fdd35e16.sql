-- CRM expansion: novas colunas em customers e sellers_v2
-- Incremental e idempotente. Não altera dados existentes nem RLS.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS zip text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS number text,
  ADD COLUMN IF NOT EXISTS complement text,
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text;

ALTER TABLE public.sellers_v2
  ADD COLUMN IF NOT EXISTS establishment_name text,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS zip text,
  ADD COLUMN IF NOT EXISTS address text;

-- Índice leve para busca por CPF (parcial, ignora nulos)
CREATE INDEX IF NOT EXISTS customers_cpf_idx
  ON public.customers (cpf)
  WHERE cpf IS NOT NULL;

CREATE INDEX IF NOT EXISTS customers_birth_month_idx
  ON public.customers ((extract(month from birth_date)))
  WHERE birth_date IS NOT NULL;

-- GRANTs herdados da tabela; nenhum privilégio novo necessário.