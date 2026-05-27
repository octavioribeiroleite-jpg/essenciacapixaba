## Objetivo
Cadastrar os 168 perfumes da planilha `Catálogo Site` no estoque com:
- `current_ml = 0` e `total_ml = 0` (sem estoque físico ainda)
- Preço: custo = "Preço atacado", venda = custo + R$100 (regra padrão)
- Todos os metadados ricos da planilha (descrição, notas, ocasião, clima, perfil, gênero)
- Imagem original buscada automaticamente via IA (DuckDuckGo)
- **Sem duplicar** itens já existentes no estoque (match por nome normalizado)
- Visíveis no catálogo público mesmo sem estoque

## Passos

### 1. Ajustar visibilidade do catálogo público
Atualizar a política RLS `Public can view available products` para mostrar TODOS os produtos (não só `current_ml > 0`). No `Catalog.tsx`, adicionar selo discreto **"Sob encomenda"** nos cards zerados, e no botão WhatsApp adaptar a mensagem ("Tenho interesse em encomendar...").

### 2. Importação dos 168 perfumes
Como envolve muitas linhas, usar uma **Edge Function `import-catalog`** que recebe o JSON da planilha e executa em lote no servidor:
- Para cada linha do Excel:
  - Normaliza o nome (`normalizeName`) e busca duplicata para o `user_id` atual → se já existe, **pula** (não sobrescreve seus dados atuais)
  - Se novo: insere com `current_ml=0`, `total_ml=0`, `cost_per_ml = preço/100`, `sale_price_per_ml = (preço+100)/100`, mapeia gênero ("Feminino"/"Masculino" → "feminino"/"masculino"), `description`, `fragrance_notes` (saída/corpo/fundo), `occasions` (período + clima + ocasião como tags)
- Retorna contadores: criados, pulados (duplicados), erros

### 3. Disparo da importação
Tela admin nova mini (botão temporário no Dashboard ou direto no Products): **"Importar planilha (168 perfumes)"**. Eu embuto o JSON dos 168 itens diretamente no front (gerado a partir do Excel anexado) e chamo a função. Mostra progresso e relatório final.

### 4. Busca de imagens em lote
Após importar, disparar automaticamente `fetch-perfume-image` para cada produto recém-criado (em série, ~1/seg para não estourar). Mostra barra de progresso "Buscando imagens X/168".

### 5. Mapeamento dos campos

| Excel | Banco |
|---|---|
| Perfume | `name` |
| Marca | `brand` |
| Categoria | `gender` (feminino/masculino) |
| Preço atacado | `cost_per_ml = preço/100`, `sale_price_per_ml = (preço+100)/100` |
| Descrição comercial curta | `description` |
| Notas de saída / Corpo / Fundo | `fragrance_notes = {top, heart, base}` |
| Período do dia + Clima + Ocasião + Perfil | `occasions` (array combinado) |

## Detalhes técnicos
- Migration: alterar policy SELECT anon de `current_ml > 0` para `true`.
- Edge function `import-catalog` usa `SERVICE_ROLE_KEY`, recebe `{ userId, items[] }`, valida sessão via JWT do header.
- Dedup query: `select id from products where user_id=$1 and lower(unaccent(name)) = $2`.
- Sem preço (3 itens) → cadastrar com cost=0, sale=0 (revisar depois manualmente).

## Arquivos afetados
- **Novo**: `supabase/functions/import-catalog/index.ts`
- **Novo**: `src/lib/catalogSeed.ts` (JSON dos 168 itens extraído do Excel)
- **Edit**: `src/pages/Products.tsx` (botão "Importar planilha")
- **Edit**: `src/pages/Catalog.tsx` (selo "Sob encomenda")
- **Migration**: ajustar RLS do catálogo público