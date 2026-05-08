## Plano: Simplificar cadastro + exibir totais e por ml nos detalhes

### 1. Cadastro de produto (`src/pages/ProductForm.tsx`)

Substituir os campos **Custo/ml** e **Venda/ml** por valores totais do frasco:

Campos finais:
- Nome do Perfume *
- Marca
- ML Total do Frasco *
- Preço Pago no Frasco (R$) *
- Preço de Revenda do Frasco (R$) *
- Foto do Frasco

Resumo calculado ao vivo abaixo dos campos:
- Custo por ml = preço pago ÷ ml total
- Venda por ml = preço revenda ÷ ml total
- Lucro por ml = venda/ml − custo/ml

Ao salvar, calcular `cost_per_ml` e `sale_price_per_ml` a partir dos totais e gravar no banco (schema permanece igual).

### 2. Página de detalhes do produto (`src/pages/ProductDetail.tsx`)

Adicionar um bloco de informações financeiras mostrando lado a lado:
- **Totais do frasco**: preço pago total e preço de revenda total (calculados como `cost_per_ml × total_ml` e `sale_price_per_ml × total_ml`)
- **Por ml**: custo/ml e venda/ml
- **Lucro/ml** destacado

### 3. O que NÃO muda

- Schema do banco (`products` / `sales`)
- Botões de venda rápida (3/5/10/15 ml), QR Code, scanner
- Dashboard e relatórios de lucro (continuam usando custo/ml × ml vendido)
