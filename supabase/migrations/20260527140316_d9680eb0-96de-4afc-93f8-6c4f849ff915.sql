
CREATE OR REPLACE FUNCTION public.deduct_stock(
  p_product_id uuid,
  p_ml         numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_current numeric;
  v_new     numeric;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Não autenticado');
  END IF;

  SELECT current_ml INTO v_current
  FROM public.products
  WHERE id = p_product_id AND user_id = v_uid
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

-- Remove versão antiga (3 args) e bloqueia execução pública
DROP FUNCTION IF EXISTS public.deduct_stock(uuid, uuid, numeric);
REVOKE ALL ON FUNCTION public.deduct_stock(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deduct_stock(uuid, numeric) TO authenticated;
