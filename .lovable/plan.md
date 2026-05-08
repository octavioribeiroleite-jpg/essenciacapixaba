## Cadastro em lote por foto da nota fiscal (IA multi-perfume)

Adicionar uma nova aba no cadastro de produto onde você envia uma foto (nota fiscal, lista impressa, planilha, print de pedido etc.) e a IA reconhece **todos os perfumes da imagem de uma vez** — você revisa, ajusta o preço de revenda e cadastra tudo no estoque com um clique.

### Fluxo do usuário

1. Em **Produtos → Novo Produto**, aparecem duas abas no topo:
   - **Manual** (formulário atual, sem mudanças)
   - **Por Foto (IA)** (novo)
2. Na aba "Por Foto":
   - Botão grande para tirar foto / enviar imagem
   - Pode enviar imagens com **vários perfumes diferentes** ao mesmo tempo (nota fiscal inteira, várias linhas de uma planilha, etc.)
   - Loading "Analisando com IA..."
   - IA retorna uma **lista editável** com todos os perfumes detectados:
     - Nome | Marca | ML | Preço Pago | Preço Revenda (sugerido = pago × 2,3, editável)
   - Cada linha tem checkbox (marcado por padrão) e botão de remover
   - Você edita qualquer campo antes de confirmar
   - Botão **"Cadastrar X produtos"** salva todos de uma vez no estoque

### Como a IA é configurada para múltiplos perfumes

- Prompt instrui explicitamente: "Identifique TODOS os perfumes presentes na imagem, não pule nenhum item, retorne sempre como array mesmo se for só 1"
- **Structured output (Zod array schema)** força a resposta a ser uma lista — nunca um único objeto
- Para cada item extrai: `name`, `brand`, `total_ml`, `total_cost`
- Campos não detectados retornam `null` (você preenche manualmente na revisão)
- Modelo: `google/gemini-2.5-flash` (multimodal, ótimo OCR de notas em português, rápido e barato)

### Implementação técnica

**Edge function nova** `supabase/functions/parse-invoice/index.ts`:
- Recebe imagem em base64
- Chama Lovable AI Gateway (Vercel AI SDK + Gemini 2.5 Flash multimodal)
- `generateText` com `Output.array()` garantindo lista de itens
- Prompt em português orientado a notas brasileiras de perfumaria
- Retorna `{ items: [...] }` para o frontend

**Frontend** — `src/pages/ProductForm.tsx`:
- `Tabs` shadcn com "Manual" e "Por Foto (IA)"
- Aba Manual: intacta
- Aba IA: upload + tabela editável + botão de cadastro em lote (`insert` array no Supabase, calculando `cost_per_ml = preço pago ÷ ml` e `sale_price_per_ml = preço revenda ÷ ml` para cada linha)
- Tratamento de erro de crédito (402) e rate-limit (429) com mensagens claras

### O que NÃO muda

- Cadastro manual continua igual
- Schema do banco (cada item vira uma linha normal em `products`)
- Vendas, QR Code, dashboard, relatórios

### Custo

Cada análise consome alguns centavos de crédito da Lovable AI, independentemente de ter 1 ou 30 perfumes na foto.
