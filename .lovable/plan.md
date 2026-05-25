## Objetivo

Trocar o modelo das edge functions de IA para **`openai/gpt-5`** (máxima precisão) e reforçar os prompts para **nunca inventar dados** — se a IA não tiver certeza sobre um perfume, deve retornar `null` em vez de "chutar".

---

## Alterações

### 1. `supabase/functions/fetch-perfume-details/index.ts`
- Trocar `model: "google/gemini-3-flash-preview"` → `model: "openai/gpt-5"`.
- Reforçar `systemPrompt` com regra anti-alucinação explícita:
  - "Se você não tem **certeza absoluta** da existência do perfume ou de qualquer campo, retorne `null` / array vazio. **Nunca invente** marca, notas olfativas ou concentração."
  - "Use apenas informação verificável de fontes reais (Fragrantica, sites oficiais das marcas árabes)."
- Adicionar campo opcional `confidence` (alta/média/baixa) no tool schema para sabermos quando a IA teve dúvida.
- Manter `tool_choice` forçado para garantir saída estruturada.

### 2. `supabase/functions/generate-description/index.ts`
- Trocar `model: "google/gemini-3-flash-preview"` → `model: "openai/gpt-5"`.
- Ajustar prompt: a descrição só pode usar notas/marca/concentração **realmente presentes** no produto. Se faltar dado, escrever de forma genérica sem inventar nota.

### 3. Tratamento de erro (ambas funções)
- Manter os handlers já existentes para 429 (rate limit) e 402 (créditos esgotados).
- GPT-5 é mais caro — adicionar log claro do modelo usado para você acompanhar consumo.

---

## Detalhes técnicos

- `openai/gpt-5` está disponível no Lovable AI Gateway, sem precisar de API key da OpenAI (usa o `LOVABLE_API_KEY` já configurado).
- É mais lento (~3-8s por chamada) e mais caro que Gemini Flash. Em batch de "Atualizar tudo com IA" no Dashboard, manter o delay de 700ms entre chamadas para evitar 429.
- Sem mudanças no banco, no frontend ou em outras funções (`fetch-perfume-image`, `parse-invoice-text` continuam como estão).

---

## Fora do escopo

- Não vou adicionar fallback automático Gemini → OpenAI (você não pediu; posso fazer depois se quiser).
- Não vou mexer no `fetch-perfume-image` (busca de fotos via DuckDuckGo, não usa LLM).
