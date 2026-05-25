-- 1) Mesclar duplicatas preservando vendas e movimentos
WITH ranked AS (
  SELECT id, user_id, current_ml,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, lower(trim(name))
           ORDER BY created_at ASC
         ) AS rn,
         FIRST_VALUE(id) OVER (
           PARTITION BY user_id, lower(trim(name))
           ORDER BY created_at ASC
         ) AS keeper_id
  FROM public.products
),
losers AS (
  SELECT id, user_id, keeper_id, current_ml
  FROM ranked
  WHERE rn > 1
),
move_sales AS (
  UPDATE public.sales s
  SET product_id = l.keeper_id
  FROM losers l
  WHERE s.product_id = l.id
  RETURNING 1
),
move_mov AS (
  UPDATE public.stock_movements m
  SET product_id = l.keeper_id
  FROM losers l
  WHERE m.product_id = l.id
  RETURNING 1
),
sum_stock AS (
  SELECT keeper_id, SUM(current_ml)::numeric AS extra_ml
  FROM losers
  GROUP BY keeper_id
),
bump AS (
  UPDATE public.products p
  SET current_ml = p.current_ml + s.extra_ml,
      total_ml   = GREATEST(p.total_ml, p.current_ml + s.extra_ml)
  FROM sum_stock s
  WHERE p.id = s.keeper_id
  RETURNING 1
)
DELETE FROM public.products WHERE id IN (SELECT id FROM losers);

-- 2) Impedir novas duplicatas exatas
ALTER TABLE public.products
  ADD CONSTRAINT unique_product_name_per_user UNIQUE (user_id, name);