

# Essencia Capixaba Decants - Plano de Implementacao

## Resumo
App mobile-first de controle de estoque de decantes de perfume com autenticacao, QR Code, scanner de camera, e relatorios de vendas. Design dark mode elegante.

## Etapa 1: Configurar Lovable Cloud (Supabase)
Ativar Lovable Cloud e criar as tabelas:

**Tabela `products`**: id (uuid, PK), user_id (uuid, FK auth.users), name, brand, total_ml (numeric), current_ml (numeric), cost_per_ml (numeric), sale_price_per_ml (numeric), image_url (text), created_at. RLS: usuario so ve seus produtos.

**Tabela `sales`**: id (uuid, PK), user_id (uuid, FK), product_id (uuid, FK products), ml_sold (numeric), sale_price (numeric), cost_price (numeric), created_at. RLS: usuario so ve suas vendas.

## Etapa 2: Autenticacao
- Pagina de login/cadastro com email e senha
- Protecao de rotas (redireciona para login se nao autenticado)
- Hook `useAuth` para gerenciar sessao

## Etapa 3: Layout e Navegacao
- Layout dark mode com sidebar/bottom nav mobile
- Rotas: `/login`, `/dashboard`, `/products`, `/products/new`, `/products/:id`, `/scan`, `/reports`
- Barra inferior mobile com icones: Dashboard, Produtos, Escanear (destaque), Relatorios
- Nome "Essencia Capixaba Decants" no header

## Etapa 4: Dashboard
- Cards com: total de produtos, total ml em estoque, vendas do mes (ml e R$), lucro do mes
- Lista de alertas de estoque baixo (< 10ml)
- Ultimas 5 vendas recentes

## Etapa 5: Cadastro de Produtos
- Formulario com react-hook-form + zod: nome, marca, ml total, preco custo/ml, preco venda/ml
- Upload de foto do frasco (Lovable Cloud Storage)
- Ao salvar, current_ml = total_ml

## Etapa 6: Pagina do Produto + QR Code
- Detalhes completos do produto com foto
- Botao "Gerar Etiqueta para Niimbot" abre modal com:
  - QR Code P&B alta resolucao (biblioteca `qrcode.react`) contendo URL: `{origin}/products/{id}`
  - Botao "Download PNG" usando canvas.toDataURL
- Botoes de venda rapida: -3ml, -5ml, -10ml, -15ml, Personalizada
- Historico de vendas daquele produto

## Etapa 7: Scanner QR Code
- Instalar `html5-qrcode`
- Pagina `/scan` abre camera, le QR Code
- Ao detectar URL de produto, navega para pagina do produto com botoes de baixa

## Etapa 8: Relatorios
- Vendas do mes com recharts (grafico de barras por dia)
- Ranking de perfumes mais vendidos
- Lucro calculado (venda - custo) por produto
- Filtro por periodo (semana, mes, personalizado)

## Bibliotecas a Instalar
- `qrcode.react` (geracao QR Code)
- `html5-qrcode` (scanner camera)
- `@supabase/supabase-js` (via Lovable Cloud)

## Design
- Dark mode como padrao (fundo escuro #0f0f0f, acentos dourado/ambar)
- Tipografia limpa, cards com bordas sutis
- Botoes de venda com cores distintas e tamanho grande para toque facil
- Responsivo: mobile-first, funciona bem em 384px

## Ordem de Implementacao
1. Lovable Cloud + tabelas + RLS
2. Auth (login/cadastro)
3. Layout + navegacao
4. CRUD de produtos + upload foto
5. QR Code (geracao + download PNG)
6. Scanner camera
7. Sistema de vendas (baixa de estoque)
8. Dashboard + relatorios

