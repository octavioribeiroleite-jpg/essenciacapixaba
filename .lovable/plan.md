## O que vai mudar

### 1. Preço de venda automático = Custo + R$ 100

No formulário **manual** e nos **rascunhos da IA**, o campo "Preço de revenda" deixa de ser obrigatório e passa a ser **calculado automaticamente** como `custo do frasco + R$ 100`.

- O campo continua editável (caso queira ajustar pontualmente), mas vem pré-preenchido.
- Bloco "Cálculo automático" mostra: custo/ml, venda/ml, **lucro do frasco = R$ 100**, lucro/ml.
- Vale igual no fluxo manual e no fluxo de IA (imagem e texto).

### 2. Importação por TEXTO (colar lista)

Na tela de cadastro, a aba **"Por Foto (IA)"** vira **"IA (Foto ou Texto)"** com duas sub-abas:

- **Foto** — fluxo atual (manda imagem pra `parse-invoice`)
- **Texto** — textarea grande onde você cola lista, pedido, mensagem do WhatsApp, etc. Botão "Analisar texto" chama uma nova edge function `parse-invoice-text` que usa o mesmo modelo Gemini com tool-calling pra extrair os perfumes (nome, marca, ml, custo).

Resultado cai na mesma lista de rascunhos editáveis que já existe hoje — você confere, marca/desmarca e salva tudo de uma vez. O estoque é atualizado igual ao fluxo atual (já registra movimentação `initial`).

### 3. Imagem real do perfume buscada pela IA (automático)

Quando um rascunho é confirmado para salvar **e não tem imagem enviada manualmente**, uma nova edge function `fetch-perfume-image` é chamada com `{nome, marca}`:

- Usa Gemini com **web grounding** pra encontrar a URL de uma imagem oficial do frasco.
- A edge baixa a imagem, redimensiona pra ~600px e faz upload no bucket `product-images` (já existe e é público).
- O `image_url` do produto é preenchido automaticamente.

Comportamento ao falhar:
- Se nenhuma imagem confiável for encontrada, o produto é salvo **sem imagem** (igual hoje) e aparece um toast discreto "Imagem não encontrada para X — você pode adicionar depois".
- Nada bloqueia o cadastro.

Importante: a busca acontece em background depois do cadastro inicial, então a confirmação é rápida. As imagens aparecem no catálogo assim que cada uma termina (atualização da query `products`).

## Detalhes técnicos

**Arquivos alterados:**
- `src/pages/ProductForm.tsx` — preço de venda auto-calculado (custo + 100), nova sub-aba Texto, dispara busca de imagem após salvar produto sem foto.
- `supabase/functions/parse-invoice-text/index.ts` — nova edge function, espelha `parse-invoice` mas recebe `{ text: string }` em vez de imagem; mesmo tool-call `register_perfumes`.
- `supabase/functions/fetch-perfume-image/index.ts` — nova edge function: chama Gemini com web search grounding pra obter URL, baixa imagem, sobe no bucket `product-images`, retorna URL pública.

**Regra do preço (Custo + R$ 100):**
- `total_sale = total_cost + 100`
- `sale_price_per_ml = (total_cost + 100) / total_ml`
- Em ambos os fluxos (manual e draft IA), recalcula em tempo real conforme o usuário digita o custo. Campo editável caso queira sobrescrever.

**Sem mudanças no banco** — `image_url`, `sale_price_per_ml` e `cost_per_ml` já existem.

**Custo de IA:** cada cadastro com IA pode disparar até 2 chamadas extras (parse + busca de imagem). Tudo via Lovable AI Gateway, sem chave nova.

## Limitações honestas sobre a imagem da internet

Busca de imagem por IA não é 100% confiável — às vezes o modelo retorna uma URL quebrada, uma imagem de outro perfume, ou nenhuma. O plano trata isso como **best-effort**: se vier, ótimo; se não vier, o produto fica sem foto e você pode anexar manualmente depois (a tela de edição do produto já permite). Não vou prometer foto pra 100% dos casos.
