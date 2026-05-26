## Redesenhar `src/pages/Dashboard.tsx`

Reformular visualmente o Dashboard mantendo todas as funcionalidades atuais (queries, mutation de atualização IA, navegação, alertas).

### Mudanças

1. **Header com gradiente dourado**
   - Card com `bg-gradient-to-br from-primary via-primary/90 to-amber-400` (tokens do tema bege/dourado), texto branco, cantos arredondados.
   - Mostra data, saudação (`Bom dia/tarde/noite` + emoji 🌅/☀️/🌙) e subtítulo.
   - Botão "✨ Atualizar tudo com IA" embutido no header (estilo `bg-white/20 backdrop-blur border-white/30`), substituindo o botão solto atual.

2. **Cards de estatísticas (4 cards)**
   - Grid `grid-cols-2 lg:grid-cols-4`.
   - Cada card: ícone em chip com gradiente colorido próprio (âmbar/sky/emerald/violet), label em uppercase, valor grande, sublabel.
   - Mantém os mesmos 4 dados: Produtos, Estoque (frascos), Receita do mês, Lucro do mês.

3. **Estoque Baixo reformulado**
   - Card branco com header destacando "Estoque Baixo" + badges contadores (esgotados em vermelho, baixos em âmbar).
   - Lista com itens contendo: **miniatura da foto** (com fallback inicial colorido), nome, marca, **mini barra de progresso** (`current_ml / (ML_PER_FRASCO*2)`), badge de quantidade e chevron.
   - Separar esgotados (`current_ml === 0`) dos baixos visualmente (cor vermelha vs âmbar).

4. **Vendas Recentes com foto**
   - Adicionar `image_url` ao select de `sales` (`products(name, brand, image_url)`).
   - Cada linha mostra miniatura da foto do produto, nome, data + frascos vendidos, e valor em verde com prefixo `+`.
   - Empty state com emoji 📦.

5. **Atalho "Ver Catálogo"** — mantém como está, apenas pequenas melhorias de hover.

6. **Modal de progresso IA** — mantém igual.

### Detalhes técnicos

- Adicionar ícones `Sparkles`, `ShoppingBag`, `ChevronRight` ao import do lucide-react.
- Atualizar query de `sales-month` para incluir `image_url` no join.
- Calcular `emptyStock = lowStock.filter(p => Number(p.current_ml) === 0)` para o badge.
- Manter uso de `ML_PER_FRASCO`, `formatFrascos`, semantic tokens (`text-foreground`, `text-muted-foreground`, `bg-card`, `border-border`). Cores acentuadas (âmbar/emerald/sky/violet) ficam apenas nos chips/badges/ícones — não substituem tokens semânticos do tema.
- Não alterar nenhum outro arquivo.

### Pergunta pendente

A pergunta anterior sobre bloquear o acesso do catálogo público ao app principal continua aberta — depois desta mudança, me responda qual fluxo prefere para eu implementar.
