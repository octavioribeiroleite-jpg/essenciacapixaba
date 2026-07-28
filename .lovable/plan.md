
# Plano de entrega — Essência Capixaba (operação consignada)

Trabalho grande em várias frentes. Preservo dados, identidade visual e stack (React + Vite + TS + Supabase). Sem deploy, sem execução automática de SQL: a migration fica pronta e você aprova antes de aplicar.

## 1. Remover Scanner / QR de identificação
- Remover `src/pages/Scanner.tsx`, rota `/scan` em `App.tsx`, links em `AppLayout` e Dashboard, item no menu.
- Remover dependência `html5-qrcode`.
- Preservar `qrcode` / `qrcode.react` (usados em Pix e catálogo público).

## 2. Migration incremental (nova, idempotente)
Arquivo novo `supabase/migrations/<timestamp>_crm_expansion.sql`. Não altera migrations históricas.

- `ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS` para: `cpf text`, `whatsapp text`, `birth_date date`, `zip text`, `address text`, `number text`, `complement text`, `district text`, `city text`, `state text` (char(2)).
- `ALTER TABLE public.sellers_v2 ADD COLUMN IF NOT EXISTS` para: `establishment_name text`, `whatsapp text`, `zip text`, `address text`.
- GRANTs mantidos (colunas herdam grant da tabela). RLS já existente cobre.
- Nada é destrutivo; ninguém perde dado.
- Sem novas tabelas — CRM é derivado das vendas existentes (`sales_v2` + `sale_items`).

## 3. CRM de Clientes (nova página `/clientes`)
- Rota nova `Customers.tsx` protegida, adicionada ao `AppLayout` (desktop + mobile).
- Lista de clientes com busca por nome/telefone/CPF/e-mail, ordenação, paginação leve.
- Métricas por cliente calculadas via join com `sales_v2` (status=confirmed) e `sale_items` + `product_variants` + `products`: primeira compra, última compra, nº de compras, total comprado, ticket médio, perfumes comprados.
- Filtros rápidos: todos, sem compra há 30d, sem compra há 60d, apenas 1 compra, recorrentes (≥2), aniversariantes do mês, sem compras.
- Formulário de cadastro/edição com todos os novos campos + máscaras leves (CPF, CEP, telefone). Auto-preenchimento de endereço via ViaCEP (fetch público sem chave).
- Drawer/modal de detalhes do cliente com histórico de compras (itens, valores, datas, vendedor).
- Botões de contato: `tel:` e `https://wa.me/...` quando houver número. **Sem envio automático de WhatsApp.**
- RLS: admin vê tudo, vendedor vê `seller_id = private.actor_seller()` (já coberto).

## 4. Vendedores
- Ampliar formulário em `Sellers.tsx` com estabelecimento, telefone, whatsapp, e-mail, CEP, endereço.
- Badge "Ativo" e "Conta vinculada" (baseado em `user_id`).
- Manter comissão editável (fixed_per_unit / profit_percentage) — já existente.

## 5. Estoque, Transferências e Vendas
- Aba/página de **Estoque** para admin: saldos por local (central + cada vendedor) via `inventory_movements` agregado por variante/local. Para vendedor: apenas seu local.
- Aba **Transferências**: criar (admin), listar em trânsito, receber (destino), cancelar (admin, com justificativa). Todas via RPCs existentes `rpc_create_transfer`, `rpc_receive_transfer`, `rpc_cancel_transfer`.
- Histórico de movimentações imutável — só leitura, com filtros.
- **Vendas**: novo fluxo em `Sales.tsx` (ou aba dentro de `/vendedores`) que usa `rpc_register_sale`:
  - selecionar local, cliente (buscar ou criar via `rpc_save_customer`), vendedor (admin escolhe; vendedor é fixo), itens (variante + qty + preço opcional).
  - Mostra total, custo, lucro, comissão computados server-side após a chamada.
  - Estorno com justificativa via `rpc_reverse_sale`.
- Mantenho `Sales.tsx` legado funcionando durante a transição (não removo o fluxo antigo nesta entrega).

## 6. Comissões / Repasses
- Página/aba **Repasses**: por vendedor mostra ganho total, pago (settlements confirmadas), pendente (diferença via join com `settlement_allocations`).
- Admin cria repasse via `rpc_settle`; estorna via `rpc_reverse_settlement`.
- Vendedor vê apenas seus valores/histórico.
- Filtros: vendedor, período, status.

## 7. Dashboard
- Adicionar cards do novo núcleo quando `sellers_v2` tem dados:
  - Vendas do dia / mês (`sales_v2`), lucro do mês, comissão pendente, clientes cadastrados, mais vendidos (top 5 via `sale_items`), últimas movimentações (`inventory_movements`).
  - Vendedor vê apenas seus dados (filtro por `seller_id`).
- Preserva os cards atuais (produtos, estoque em ml, receita legacy) porque ainda há dados no fluxo antigo.

## 8. Segurança
- Nenhuma nova tabela pública sem RLS. As alterações são apenas colunas em tabelas já protegidas.
- Sem `service_role` no frontend.
- Nenhuma view nova nesta entrega (métricas de CRM calculadas em query client-side/RPC read-only). Se surgir necessidade de view, será criada com `security_invoker=true`.

## 9. Qualidade
- Português BR, responsivo mobile-first, estados loading/vazio/erro, confirmação para estornos, cancelamentos e exclusões.
- Ajustar PWA se `workbox-window` estiver faltando (checar `vite.config.ts`).
- Rodar `tsgo`, `vitest run`, `vite build`. Reportar resultado. **Sem publicar.**

## Fora do escopo desta entrega
- Envio automático de mensagens WhatsApp.
- Remoção do fluxo de vendas legado (`sales` / `stock_movements`) — coexistem.
- Novas views materializadas ou RPCs adicionais além das existentes.

## Detalhes técnicos

### Arquivos novos
- `src/pages/Customers.tsx`
- `src/pages/CustomerDetail.tsx` (ou drawer dentro de Customers)
- `src/lib/customerMetrics.ts` (agregação client-side)
- `src/lib/viaCep.ts` (fetch ViaCEP)
- `supabase/migrations/<ts>_crm_expansion.sql`

### Arquivos alterados
- `src/App.tsx` — remove `/scan`, adiciona `/clientes`.
- `src/components/AppLayout.tsx` — troca item do menu.
- `src/pages/Dashboard.tsx` — novos indicadores do núcleo.
- `src/pages/Sellers.tsx` — formulário ampliado + polimento das abas de estoque/transferências/vendas/repasses.
- `src/integrations/supabase/sellerDb.ts` — tipos das novas colunas.
- `package.json` — remove `html5-qrcode`.

### Ordem de execução
1. Migration pronta (aguarda sua aprovação).
2. Remover Scanner + dependência.
3. CRM (página + tipos + ViaCEP + filtros + detalhe).
4. Ampliar Sellers.tsx (form + abas operacionais completas).
5. Dashboard novos cards.
6. Rodar testes/lint/build e reportar.

Confirma que posso seguir?
