## Recibo PDF de venda com Pix

Adiciona geração de PDF do pedido para enviar ao cliente, com itens, valores, observações de pagamento e o Pix em destaque. O botão "Copiar Pix" fica no app (PDF não tem botão funcional de copiar), e o PDF mostra a chave grande pra cliente selecionar/copiar manualmente.

### Onde aparece

Onde já existe o botão **"Gerar Cobrança"** (mensagem WhatsApp):
- `src/pages/Sales.tsx` — depois de finalizar uma venda
- `src/pages/Reports.tsx` — em cada pedido do histórico e nos pendentes

Vira um par de botões: **"WhatsApp"** (atual) + **"PDF"** (novo).

### Conteúdo do PDF (1 página A4)

```text
┌──────────────────────────────────────────────┐
│  Essência Capixaba                Recibo     │
│  Pedido #ABC123 · 27/05/2026                 │
│  Cliente: Elaine                             │
├──────────────────────────────────────────────┤
│  [img]  Khamrah (Lattafa)        R$ 250,00  │
│         1 frasco · R$ 250,00                 │
│                                              │
│  [img]  Asad (Lattafa)           R$ 250,00  │
│         1 frasco · R$ 250,00                 │
├──────────────────────────────────────────────┤
│                          Total: R$ 500,00    │
│                                              │
│  Pagamento: 50% entrada + 50% em 30 dias    │
│   1ª parcela: R$ 250,00 — paga              │
│   2ª parcela: R$ 250,00 — vence 27/06/2026  │
├──────────────────────────────────────────────┤
│             Pague com Pix                    │
│  ┌────────────────────────────────────────┐ │
│  │ 5cc152c8-df7e-412e-9a88-3ed13a0bd4da   │ │
│  └────────────────────────────────────────┘ │
│   Chave aleatória — copie e cole no seu app │
│                                              │
│        Obrigada pela preferência!            │
└──────────────────────────────────────────────┘
```

### Dialog "Compartilhar recibo"

Substitui o `ChargeMessageDialog` atual com 3 ações:
1. **Copiar mensagem** (texto WhatsApp — já existe)
2. **Copiar chave Pix** — copia `5cc152c8-df7e-412e-9a88-3ed13a0bd4da` e dá toast "Pix copiado!"
3. **Baixar PDF** — gera e baixa `recibo-<cliente>-<data>.pdf`

A chave Pix fica salva em uma constante `PIX_KEY` em `src/lib/pix.ts` (fácil trocar depois).

### Arquivos

- `src/lib/pix.ts` (novo) — `PIX_KEY` exportada
- `src/lib/receiptPdf.ts` (novo) — função `generateReceiptPdf(order)` usando **jsPDF** (já leve, sem peso extra significativo)
- `src/components/ChargeMessageDialog.tsx` — adiciona botões "Copiar Pix" e "Baixar PDF"
- `bun add jspdf` — dependência

### Detalhes técnicos

- Imagens dos produtos: baixadas via `fetch` → `dataURL` antes de montar o PDF (jsPDF precisa de data URL). Quando uma imagem falhar, mostra um placeholder cinza com a inicial.
- Sem alteração de banco e sem edge function — tudo no cliente.
- A "observação de como foi feito" usa o `payment_method`/`payment_status` e datas (dinheiro, cartão, ou 50/50 com vencimentos), no mesmo formato da mensagem WhatsApp.
