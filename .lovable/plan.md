## Objetivo

Criar um histórico de movimentações por perfume (entradas, saídas e ajustes), para você conseguir responder perguntas como "já comprei o Yara antes?" ou "quanto entrou esse mês?".

## O que será feito

### 1. Nova tabela `stock_movements`

Cada linha representa uma movimentação de ml em um produto:

- `product_id` — perfume
- `user_id` — dono (RLS)
- `type` — `initial` (estoque inicial), `restock` (adição/compra), `sale` (venda), `adjustment` (ajuste manual), `sale_reversal` (quando você exclui uma venda)
- `ml_change` — positivo (entrada) ou negativo (saída)
- `ml_after` — estoque resultante após a movimentação
- `note` — texto opcional (ex: "Compra AliExpress", "Frasco novo")
- `sale_id` — referência opcional à venda, quando aplicável
- `created_at`

RLS: cada usuário só vê/edita as suas próprias movimentações.

### 2. Backfill do histórico existente

- Para cada produto já cadastrado: criar uma movimentação `initial` com `ml_change = current_ml` na data de `created_at` do produto.
- Para cada venda já existente: criar movimentação `sale` correspondente (negativa).

Assim você consegue olhar o Yara e ver "Estoque inicial: 100ml" + as vendas que aconteceram.

### 3. Registrar movimentações automaticamente daqui pra frente

Ajustar o código nos pontos onde o estoque muda:

- **Criar produto** (`ProductForm`) → registra `initial`
- **Editar produto** alterando `current_ml` → registra `adjustment` (com a diferença)
- **Reabastecer / aumentar ml** (botão de adição rápida, se existir) → registra `restock`
- **Vender** → registra `sale` (negativa) com `sale_id`
- **Excluir venda** (`Reports.tsx`) → registra `sale_reversal` (positiva) com `sale_id`

### 4. UI — Histórico do perfume

Na tela de detalhe/edição do produto, adicionar uma seção **"Histórico de movimentações"**:

- Lista cronológica reversa (mais recente primeiro)
- Cada item mostra: ícone do tipo (↑ entrada / ↓ saída / ⚙ ajuste), data, ml movimentado, ml resultante, e a nota
- Filtro rápido por tipo (Todas / Entradas / Saídas)
- Botão **"Registrar entrada"** abre um modal pequeno: quantos ml adicionar + nota opcional → cria `restock` e atualiza `current_ml`

### 5. (Opcional, incluído) Resumo no card do produto no Dashboard

Mostrar discretamente "Última entrada: há X dias" quando houver, pra dar contexto rápido sem precisar abrir o histórico.

## Detalhes técnicos

- Migration cria a tabela, índices (`product_id`, `user_id`, `created_at`) e RLS.
- Backfill roda dentro da mesma migration usando `INSERT ... SELECT` a partir de `products` e `sales`.
- Tipo enum `movement_type` em Postgres para garantir consistência.
- Mutations no frontend usam `useMutation` e invalidam as queries `product-movements`, `products`, `sales`.
- Sem mudança no fluxo de venda existente além de gravar a linha extra em `stock_movements`.

## Fora do escopo

- Relatório agregado de entradas por mês (pode vir depois)
- Exportação CSV do histórico
