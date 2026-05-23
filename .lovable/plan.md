## O que vai mudar

### 1. Tudo passa a ser por **frasco** (100 ml fixo)

A unidade do app deixa de ser "ml" e passa a ser "frasco". Para evitar reconstruir todo o banco, mantemos a coluna `current_ml` por baixo, mas **1 frasco = 100 ml** em todo lugar.

**Exibição em todas as telas (Dashboard, Produtos, Detalhe, Vendas, Relatórios):**
- `current_ml / 100` → "X frascos"
- `total_ml` deixa de aparecer (sempre 100)
- Estoque baixo: <2 frascos (em vez de <10ml)
- Custo/venda/lucro: por frasco (atual valor × 100)

**Cadastro:**
- Some o campo "Tamanho do frasco (ml)" — sempre 100 ml.
- Aparece "Quantidade de frascos" (default 1). No salvar: `total_ml = 100`, `current_ml = qtd × 100`.
- Custo e venda continuam por frasco; auto-cálculo `venda = custo + R$ 100` (já existe).

**Vendas:**
- Tela `Sales.tsx` simplifica: some o modo "Decant" e o input em ml. Aparece só seletor de **quantidade de frascos** (1, 2, 3…), preço auto = qtd × preço do frasco (editável).
- Ao confirmar: desconta `qtd × 100` de `current_ml`, registra `ml_sold = qtd × 100`.
- Botões de venda rápida na tela do produto (`-3ml, -5ml…`) viram **"Vender 1 frasco"**.

### 2. Agrupar duplicatas automaticamente

Hoje cada cadastro IA cria produto novo, mesmo com nome igual. Mudança:

- No `batchSaveMutation` (cadastro IA, foto e texto) e no manual, antes de inserir:
  - Busca produtos existentes do usuário com **nome normalizado** igual (lowercase, sem acento, sem espaço extra) — opcional comparar marca também.
  - Se achar: faz `UPDATE current_ml += qtd × 100` e registra `stock_movement` tipo `restock` com nota "Reposição (cadastro IA detectou duplicata)".
  - Se não achar: insere normal.
- Toast informa: "X cadastrados, Y somados ao estoque existente".

### 3. Editar foto do produto com IA ou upload

Na tela de detalhe do produto (`ProductDetail.tsx`):

- A foto do produto vira **clicável**. Abre um modal "Trocar foto" com dois botões:
  - **Buscar com IA** → chama a edge function `fetch-perfume-image` (já existe) com `{name, brand}`. Mostra preview do resultado; usuário confirma ou cancela.
  - **Enviar do celular** → input file padrão; faz upload no bucket `product-images` e atualiza `image_url`.
- Toast de erro se IA não achar imagem ("Não encontrei foto, envie manualmente").

### 4. Migração dos dados existentes

SQL único:
- Para todo produto: `total_ml = 100`; `current_ml = FLOOR(current_ml / 100) × 100` (1 frasco = 100 ml, sobra é descartada).
- Recalcula `cost_per_ml` e `sale_price_per_ml` dividindo o custo/venda **total do frasco** original por 100 (mantém o preço por frasco igual ao que era o preço total). Fórmula: novos valores = antigos × (total_ml_antigo / 100).
- Produtos com estoque < 100 ml viram `current_ml = 0` (precisará registrar entrada manual).

Aviso: você verá só o número de frascos depois. Se algum produto tinha 250ml, vai mostrar 2 frascos.

## Arquivos alterados

- **Migration SQL** — converte produtos existentes para padrão 100 ml/frasco.
- `src/pages/Dashboard.tsx`, `src/pages/Products.tsx`, `src/pages/ProductDetail.tsx`, `src/pages/Sales.tsx`, `src/pages/Reports.tsx` — exibição em frascos, botões "Vender 1 frasco", estoque baixo <2 frascos.
- `src/pages/ProductForm.tsx` — remove campo ml, adiciona "qtd de frascos", lógica de dedup (busca produto com mesmo nome antes de inserir, faz restock se achar).
- `src/pages/ProductDetail.tsx` — modal "Trocar foto" (IA + upload).
- `src/lib/stockMovements.ts` — sem mudança de schema, só notas novas.

## Limitações honestas

- Dedup por nome normalizado pode juntar erroneamente perfumes com nomes muito parecidos (ex: "Sauvage" vs "Sauvage Elixir"). Comparação inclui marca pra reduzir falsos positivos, mas não é 100%. Se acontecer, dá pra desfazer editando a entrada de estoque.
- Migração assume que tudo no banco hoje é coerente com "1 frasco = 100 ml". Se você tinha registros pensados como frascos de 50 ml, eles vão virar "0 frascos" (precisa reinserir).
- IA buscando imagem (`fetch-perfume-image`) continua best-effort — pode trazer foto errada ou nada.
