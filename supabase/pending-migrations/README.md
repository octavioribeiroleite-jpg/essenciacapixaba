# Migrations pendentes (não aplicadas)

Arquivos aqui NÃO são executados automaticamente. Ficam versionados para
revisão. Quando quiser aplicar, mova para `supabase/migrations/` com um
timestamp posterior ao último aplicado e submeta pela ferramenta oficial
de migration para revisão + execução.

- `20260728120000_seller_core.sql` — núcleo de vendedores, variantes,
  locais, movimentos imutáveis, transferências, clientes, vendas com
  snapshots, comissão fixa/percentual, repasses parciais e auditoria.
  Substitui o rascunho `20260720120000_add_seller_consignment.sql`
  (que nunca foi aplicado). Preserva `products`, `sales`, `stock_movements`
  e demais colunas atuais; cria variant padrão por produto usando
  `total_ml` como volumetria e saldo inicial em unidades apenas quando
  `current_ml` for divisível pela volumetria.