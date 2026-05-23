-- Padronizar tudo para 1 frasco = 100 ml
-- 1) Recalcula cost/sale por ml para que (custo_total_frasco_antigo) == (cost_per_ml_novo * 100)
-- 2) current_ml = floor(current/100)*100 (descarta sobras menores que 1 frasco)
-- 3) total_ml = 100

UPDATE public.products
SET
  cost_per_ml = CASE WHEN total_ml > 0 THEN cost_per_ml * total_ml / 100 ELSE cost_per_ml END,
  sale_price_per_ml = CASE WHEN total_ml > 0 THEN sale_price_per_ml * total_ml / 100 ELSE sale_price_per_ml END,
  current_ml = FLOOR(current_ml / 100) * 100,
  total_ml = 100;
