## Catálogo público sincronizado com o estoque

Em vez de criar um projeto Next.js separado (Lovable é Vite + React e não suporta Next.js no mesmo repo), vou adicionar o catálogo público **dentro do próprio app**, em uma rota aberta `/catalogo`. Assim ele já sobe junto no mesmo domínio (`essenciacapixaba.lovable.app/catalogo`) e sincroniza em tempo real com o estoque — sem deploy extra, sem Vercel, sem manter dois projetos.

---

### 1. Banco — liberar leitura pública só do necessário

Migration no Supabase:

- Nova policy em `products` permitindo `SELECT` para o papel `anon`, **apenas** quando `current_ml > 0`.
- `GRANT SELECT ON products TO anon`.
- Bucket `product-images` já é público, então as fotos continuam funcionando sem login.

Dados sensíveis ficam protegidos: `cost_per_ml` não será exibido no front (só `sale_price_per_ml`, nome, marca, notas, etc.). Tabelas `sales` e `stock_movements` continuam privadas.

---

### 2. Rota pública no app

- Adicionar `/catalogo` em `src/App.tsx` **fora** do `ProtectedRoute` (sem login, sem `AppLayout`).
- Criar `src/pages/Catalog.tsx` com o mesmo visual luxuoso bege/dourado do app (usando tokens do design system — `bg-background`, `text-primary`, etc., não cores hardcoded).

Funcionalidades:
- Busca por nome/marca.
- Filtro por gênero (Todos / Masculino / Feminino / Unissex).
- Grid 2 colunas no mobile, 3–4 no desktop.
- Card com imagem, marca, nome, gênero, 1ª nota de topo, preço por frasco, badge "Últimas unidades" se < 2.
- Modal de detalhe com descrição, especificações (concentração, gênero, fixação, sillage), pirâmide olfativa colorida (topo/coração/base) e botão **"Pedir via WhatsApp"** com mensagem pré-preenchida.
- Header com contagem de perfumes disponíveis + botão WhatsApp fixo.

---

### 3. Botão de compartilhamento no app interno

Na página `Products.tsx` (área logada), adicionar um pequeno botão "Compartilhar catálogo" que copia o link `https://essenciacapixaba.lovable.app/catalogo` para a área de transferência — útil para mandar no Instagram/WhatsApp.

---

### Perguntas antes de codar

1. **Número de WhatsApp**: qual número usar nos botões "Pedir agora"? (formato com DDD, ex: `5527999999999`)
2. **Página individual por perfume** (`/catalogo/:id`) com link único para compartilhar no Instagram — incluo agora junto ou deixo para depois?

Posso já implementar com um placeholder no WhatsApp se preferir mandar o número depois.