## Implementação

### 1. Nova edge function `supabase/functions/generate-description/index.ts`
- Recebe `{ product_id }`.
- Lê do banco: `name, brand, concentration, gender, fragrance_notes, sale_price_per_ml`.
- Monta prompt PT-BR (tom elegante, persuasivo, máx 4 linhas, sem títulos/listas/emojis).
- Chama Lovable AI Gateway com `google/gemini-3-flash-preview` (substitui o `gemini-flash-1.5` do seu prompt — esse não existe no catálogo do gateway).
- Trata 429/402 com mensagens amigáveis; CORS em todas as respostas.
- Atualiza `products.description` e retorna `{ description }`.

### 2. `src/pages/ProductDetail.tsx`
- Adicionar `generateDescriptionMutation`.
- Renderizar o card "Sobre o Perfume" sempre (hoje só aparece com specs/description) para o botão ficar acessível em qualquer produto.
- Bloco da descrição: se houver, mostra texto + "Regerar descrição"; se não, placeholder pontilhado + "Gerar descrição IA".

### Sem alterações
- Sem migração de banco (`description` já existe).
- Sem novos secrets (`LOVABLE_API_KEY` já configurado).
