## Gestão de Pedidos de Reposição

Sistema de semáforo automático baseado em vendas + tela dedicada para gerar encomenda e enviar por WhatsApp.

### 1. Classificação automática (semáforo)

Cálculo feito em tempo real no app, sem coluna nova no banco, usando vendas dos últimos **60 dias**:

- 🟢 **Verde (Alta demanda)**: 3+ frascos vendidos nos últimos 60 dias → estocar mais
- 🟡 **Amarelo (Demanda média)**: 1-2 frascos vendidos → manter em estoque
- 🔴 **Vermelho (Baixa/sem giro)**: 0 vendas nos 60 dias → não repor
- ⚪ **Cinza (Novo)**: cadastrado há menos de 30 dias e sem histórico

A bolinha aparece em:
- Cards do `Products.tsx` (mobile) no canto superior da imagem
- Coluna nova "Giro" na tabela desktop com tooltip mostrando "X vendas em 60 dias"

### 2. Nova página `/pedidos` (Encomenda)

Acessível por botão **"Gerar encomenda"** no topo de `Products.tsx`.

Mostra automaticamente todos os perfumes com **estoque ≤ 1 frasco E classificação ≠ vermelho**, ordenados por:
1. Verdes primeiro (mais vendidos)
2. Amarelos
3. Estoque zerado antes de estoque 1

Para cada item da lista:
- Foto, nome, marca
- Badge do semáforo + "X vendas/60d"
- Estoque atual
- Campo numérico de **quantidade a pedir** (você digita na hora; sugestão inicial: verde=3, amarelo=2)
- Botão ✕ para remover do pedido
- Custo unitário e subtotal

Ações no rodapé:
- Botão **"+ Adicionar perfume"** abre seletor para incluir manualmente qualquer item do catálogo (mesmo vermelhos ou com estoque alto)
- **Total geral** (soma dos custos)
- Botão **"Copiar mensagem WhatsApp"** e **"Enviar no WhatsApp"** (abre wa.me com texto pronto)

### 3. Formato da mensagem WhatsApp

```
*Pedido de Reposição - Essência Capixaba*
Data: 27/05/2026

1. Khamrah (Lattafa) — 3 frascos
2. Asad (Lattafa) — 2 frascos
3. Queen of Arabia (Lattafa) — 2 frascos

Total: 7 frascos
Valor estimado: R$ 1.260,00

Obrigada!
```

### Arquivos a alterar/criar

- `src/lib/productClassification.ts` (novo) — função que recebe lista de vendas + produtos e devolve `Map<productId, {tier: 'green'|'yellow'|'red'|'gray', salesCount}>`
- `src/components/ClassificationDot.tsx` (novo) — bolinha colorida com tooltip
- `src/pages/Products.tsx` — botão "Gerar encomenda", bolinhas nos cards e na tabela
- `src/pages/PurchaseOrder.tsx` (novo) — tela `/pedidos`
- `src/App.tsx` — registrar rota `/pedidos` (lazy)

Sem alterações no banco — tudo derivado de `sales` + `products` já existentes.
