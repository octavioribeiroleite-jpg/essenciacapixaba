## Plano: corrigir duplicatas preservando vendas + ajustes no cadastro

### 1. `src/pages/ProductForm.tsx` — normalizar "Sem marca" como vazio
Em `findExistingProduct`, tratar `normalizeName(brand) === "sem marca"` como `""` no alvo e na comparação. Isso une "Asad Bourbon" sem marca com "Asad Bourbon / Sem marca".

### 2. `src/pages/ProductForm.tsx` — `total_ml` proporcional aos frascos
Trocar `total_ml: ML_PER_FRASCO` por `total_ml: ml` em `mutation` (manual) e `batchSaveMutation` (IA). Corrige a barra de progresso para 2+ frascos.

### 3. `src/pages/ProductForm.tsx` — autocomplete de marcas
Adicionar `MARCAS_CONHECIDAS` (Lattafa, Armaf, Al Haramain, Rasasi, Swiss Arabian, Ajmal, Maison Alhambra, Fragrance World, Afnan, Zimaya) + `<datalist>` ligado ao Input de Marca.

### 4. Migration SQL — mesclar duplicatas preservando vendas e movimentos
Estratégia: para cada grupo `(user_id, lower(trim(name)))`, escolhe o produto mais antigo como "vencedor" (`keeper`); reatribui `sales.product_id` e `stock_movements.product_id` dos perdedores para o keeper, **soma `current_ml`** dos perdedores ao keeper, registra um `stock_movement` tipo `adjustment` explicando a fusão, e só então deleta os perdedores.

```sql
WITH ranked AS (
  SELECT id, user_id,
         lower(trim(name)) AS norm_name,
         current_ml,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, lower(trim(name))
           ORDER BY created_at ASC
         ) AS rn,
         FIRST_VALUE(id) OVER (
           PARTITION BY user_id, lower(trim(name))
           ORDER BY created_at ASC
         ) AS keeper_id
  FROM products
),
losers AS (
  SELECT id, user_id, keeper_id, current_ml
  FROM ranked WHERE rn > 1
),
-- 1) move vendas
move_sales AS (
  UPDATE sales s SET product_id = l.keeper_id
  FROM losers l WHERE s.product_id = l.id
  RETURNING 1
),
-- 2) move movimentos
move_mov AS (
  UPDATE stock_movements m SET product_id = l.keeper_id
  FROM losers l WHERE m.product_id = l.id
  RETURNING 1
),
-- 3) soma estoque dos perdedores no keeper
sum_stock AS (
  SELECT keeper_id, SUM(current_ml) AS extra_ml
  FROM losers GROUP BY keeper_id
),
bump AS (
  UPDATE products p
  SET current_ml = p.current_ml + s.extra_ml,
      total_ml   = GREATEST(p.total_ml, p.current_ml + s.extra_ml)
  FROM sum_stock s WHERE p.id = s.keeper_id
  RETURNING 1
)
-- 4) deleta perdedores
DELETE FROM products WHERE id IN (SELECT id FROM losers);
```

Depois adicionar a constraint para impedir novas duplicatas exatas:
```sql
ALTER TABLE products
ADD CONSTRAINT unique_product_name_per_user UNIQUE (user_id, name);
```

⚠️ **Observações:**
- Sem FK em `sales.product_id` / `stock_movements.product_id`, então o `UPDATE` antes do `DELETE` é o que garante que as vendas migrem corretamente.
- O agrupamento usa `lower(trim(name))` (ignora caixa/espaços), mas **não** considera marca — duas entradas com mesmo nome e marcas distintas serão mescladas. Confirme se isso é o desejado (ex.: "Sauvage" Dior + "Sauvage" outra marca seriam unidos).
- A constraint final é case-sensitive ("Asad" ≠ "asad"); a proteção real contra variações continua sendo o `findExistingProduct` do frontend (passo 1).