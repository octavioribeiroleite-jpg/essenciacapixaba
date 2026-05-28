## Objetivo
Substituir as notificações atuais (toasts padrão do shadcn — como o "Limpando cache e atualizando...") por pop-ups premium, animados e alinhados à identidade da marca (bege/creme + dourado champagne #C8A45D, fundo escuro #111111).

## O que muda

### 1. Novo design do Toast (`src/components/ui/toast.tsx`)
- Reformular `toastVariants` com:
  - Fundo branco premium com borda dourada sutil (`#EAE7DF` + glow `#C8A45D`)
  - Bordas arredondadas `rounded-2xl`, sombra elegante (`shadow-[0_10px_40px_rgba(200,164,93,0.18)]`)
  - Backdrop blur leve para sensação "glass"
  - Variantes adicionais: `success` (verde sage), `loading` (dourado com spinner), `destructive` (já existe, refinar)
- Ícone à esquerda em círculo colorido (mesmo padrão dos cards do dashboard)
- Animação de entrada: slide + fade + leve scale (de 0.95 → 1) com easing suave
- Animação de saída: fade + slide para a direita
- Barra de progresso dourada na base indicando tempo restante (animada via CSS keyframes)

### 2. Viewport reposicionado
- Mover `ToastViewport` para o **topo centralizado em mobile** (atualmente fica preso ao topo cheio) e canto inferior direito no desktop
- Adicionar safe-area padding (respeitar notch)
- Stack com gap entre múltiplos toasts

### 3. Variante "loading" para ações em progresso
- Hoje o "Limpando cache..." aparece como toast comum. Criar variante `loading` com:
  - Spinner dourado animado (Loader2 com rotação suave)
  - Texto "Limpando cache e atualizando..." em destaque
- Atualizar `AppLayout.tsx` (botão Atualizar) para usar a nova variante

### 4. Animações refinadas (`src/index.css`)
- Adicionar keyframes:
  - `toast-slide-in`: translateY(-20px) + scale(0.95) + opacity 0 → final
  - `toast-progress`: width 100% → 0% (barra de tempo)
  - `toast-glow`: pulso suave do brilho dourado (loading)
- Usar `cubic-bezier(0.16, 1, 0.3, 1)` para sensação premium

### 5. Helpers convenientes
- Adicionar funções `toast.success()`, `toast.loading()`, `toast.error()` em `src/hooks/use-toast.ts` que pré-configuram variante e ícone, para uso simples nas páginas.

## Detalhes técnicos
- Manter API compatível: chamadas existentes `toast({ title, description })` continuam funcionando.
- Sem alteração em lógica de negócio — somente camada de apresentação.
- Sem novas dependências (usar Lucide + Tailwind já presentes).
- Tokens HSL respeitados (champagne já está nos tokens; reaproveitar `--primary`).

## Arquivos afetados
- `src/components/ui/toast.tsx` (redesign principal)
- `src/components/ui/toaster.tsx` (renderizar ícones + barra de progresso)
- `src/hooks/use-toast.ts` (helpers de variante)
- `src/index.css` (keyframes premium)
- `src/components/AppLayout.tsx` (usar `toast.loading` no botão Atualizar)
