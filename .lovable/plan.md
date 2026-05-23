## Revisar fotos: IA busca automaticamente para todos

### O que vai acontecer
Botão **"Atualizar fotos com IA"** na tela de Produtos. Ao clicar, roda em lote: para cada produto cadastrado, a IA busca uma imagem real do perfume na internet e atualiza o `image_url`. Você vê o progresso em tempo real (X de Y processados) e no final um resumo: quantas foram atualizadas, quantas falharam.

### Como funciona
1. Reutiliza a edge function `fetch-perfume-image` que já existe (Gemini busca imagem do perfume pelo nome + marca).
2. Frontend lista todos os produtos do usuário e processa um a um (sequencial, com pequeno delay para não estourar rate limit).
3. Para cada produto bem-sucedido, faz `UPDATE products SET image_url = ... WHERE id = ...`.
4. Modal de progresso com barra, contador e lista do que falhou (nome do perfume) para você ajustar manualmente depois pelo botão na foto que já existe.

### Escopo
- **Sobrescreve** a foto atual de **todos** os produtos (inclusive os que já têm foto), conforme pedido.
- Não mexe em estoque, preço, nome ou marca — apenas `image_url`.
- Falhas (IA não achou imagem boa) não apagam a foto existente; mantém o que tinha.

### Arquivos
- `src/pages/Products.tsx` — botão "Atualizar fotos com IA" no topo + modal de progresso.
- Sem mudanças em edge function nem banco; usa o que já existe.
