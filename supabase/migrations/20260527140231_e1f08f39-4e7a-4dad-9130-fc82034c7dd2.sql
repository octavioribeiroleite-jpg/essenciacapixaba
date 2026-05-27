
-- 1. Função atômica de venda (evita race condition)
CREATE OR REPLACE FUNCTION public.deduct_stock(
  p_product_id uuid,
  p_user_id    uuid,
  p_ml         numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current numeric;
  v_new     numeric;
BEGIN
  SELECT current_ml INTO v_current
  FROM public.products
  WHERE id = p_product_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Produto não encontrado');
  END IF;

  IF v_current < p_ml THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Estoque insuficiente');
  END IF;

  v_new := v_current - p_ml;

  UPDATE public.products
  SET current_ml = v_new
  WHERE id = p_product_id;

  RETURN jsonb_build_object('ok', true, 'new_ml', v_new);
END;
$$;

GRANT EXECUTE ON FUNCTION public.deduct_stock(uuid, uuid, numeric) TO authenticated;

-- 2. View pública do catálogo (sem dados financeiros internos)
DROP VIEW IF EXISTS public.catalog_products;
CREATE VIEW public.catalog_products
WITH (security_invoker = true)
AS
SELECT
  id, name, brand, image_url,
  sale_price_per_ml, current_ml, total_ml,
  concentration, gender, longevity, sillage,
  description, fragrance_notes, occasions, olfactory_family
FROM public.products;

GRANT SELECT ON public.catalog_products TO anon, authenticated;

-- 3. Bloqueia acesso anônimo direto à tabela (mantém leitura para usuários logados via RLS)
DROP POLICY IF EXISTS "Public can view all products" ON public.products;
REVOKE SELECT ON public.products FROM anon;
