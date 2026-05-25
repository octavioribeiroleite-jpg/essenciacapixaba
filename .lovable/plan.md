## Plano: migrar para tema claro + visual premium

### Mudança no design system
A memória do projeto registra "dark mode com dourado/âmbar". Vou atualizá-la para refletir o novo tema claro (bege/dourado luxuoso) após aplicar.

### 1. `src/index.css` — substituir integralmente
Aplicar exatamente o CSS enviado:
- Tokens claros (`--background` bege quase branco, `--foreground` marrom escuro, `--primary` dourado 38 70% 45%).
- Variáveis extras: `--success`, `--warning`.
- Utilities novas: `.fade-in`, `.fade-in-up`, `.fade-in-delay-1..4`, `.pulse-soft`, `.stat-gold`, `.stat-sky`, `.stat-emerald`, `.stat-green`, `.hover-lift`.
- Scrollbar fina.
- Mantém `.glass-card` (já existe).

### 2. `src/pages/Dashboard.tsx` — substituir integralmente
- Saudação por horário (Bom dia / Boa tarde / Boa noite) + data formatada em PT-BR.
- 4 stat cards coloridos com gradientes (`stat-gold`, `stat-sky`, `stat-emerald`, `stat-green`) e animação escalonada.
- Bloco "Estoque Baixo" em âmbar com ícone pulsante, clicável por item.
- "Vendas Recentes" (até 5) com link "Ver tudo" → /reports.
- Atalho "Ver Catálogo" no fim.

### 3. `src/pages/Products.tsx` — substituir integralmente
- Header com contagem + botões "Fotos IA" e "Novo".
- Busca por nome/marca.
- Cards de produto com foto/inicial, badge "Baixo"/"Esgotado", barra de progresso colorida (vermelho/âmbar/verde), preço por frasco.
- Modal de progresso da atualização em lote de fotos (mantém o fluxo já existente).

### 4. Auditoria pós-migração
- `ProductDetail.tsx` linha 323: `text-white` sobre botão `primary` (dourado) — segue legível, sem mudança.
- Demais páginas (Sales, Reports, ProductForm, Login, Scanner, AppLayout) usam só tokens semânticos — vão se adaptar automaticamente. Vou abrir o preview e validar visualmente cada uma após aplicar; se algo ficar com baixo contraste, faço ajustes pontuais.

### Riscos
- Cores tipo `text-amber-500`, `bg-amber-50`, `text-emerald-600` (do Tailwind padrão) aparecem nos novos Dashboard/Products. Funcionam bem em fundo claro — sem problema.
- A tela vai mudar drasticamente de visual. É reversível voltando a versão anterior, se não gostar.