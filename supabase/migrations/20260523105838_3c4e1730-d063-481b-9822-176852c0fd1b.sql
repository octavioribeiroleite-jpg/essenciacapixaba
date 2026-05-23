-- Enum com os tipos de movimentação
CREATE TYPE public.movement_type AS ENUM (
  'initial',
  'restock',
  'sale',
  'sale_reversal',
  'adjustment'
);

-- Tabela principal
CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL,
  type public.movement_type NOT NULL,
  ml_change numeric NOT NULL,
  ml_after numeric NOT NULL,
  note text,
  sale_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_movements_product ON public.stock_movements(product_id, created_at DESC);
CREATE INDEX idx_stock_movements_user ON public.stock_movements(user_id, created_at DESC);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own stock movements"
  ON public.stock_movements FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own stock movements"
  ON public.stock_movements FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own stock movements"
  ON public.stock_movements FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own stock movements"
  ON public.stock_movements FOR DELETE
  USING (auth.uid() = user_id);

-- Backfill: estoque inicial para cada produto existente
INSERT INTO public.stock_movements (user_id, product_id, type, ml_change, ml_after, note, created_at)
SELECT
  p.user_id,
  p.id,
  'initial'::public.movement_type,
  p.total_ml,
  p.total_ml,
  'Estoque inicial (cadastro)',
  p.created_at
FROM public.products p;

-- Backfill: vendas existentes como saídas
-- ml_after aqui é aproximado (current_ml atual), serve só pra histórico
INSERT INTO public.stock_movements (user_id, product_id, type, ml_change, ml_after, note, sale_id, created_at)
SELECT
  s.user_id,
  s.product_id,
  'sale'::public.movement_type,
  -s.ml_sold,
  COALESCE(p.current_ml, 0),
  'Venda',
  s.id,
  s.created_at
FROM public.sales s
LEFT JOIN public.products p ON p.id = s.product_id;