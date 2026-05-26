import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const {
      customerName,
      productName,
      brand,
      quantity,
      total,
      amountPaid,
      amountDue,
      paymentMethod,
      dueDate,
      firstDueDate,
      firstPaid,
      isOverdue,
      sellerName,
      whatsapp,
    } = body ?? {};

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const ctx = {
      cliente: customerName || "Cliente",
      produto: productName,
      marca: brand || "",
      quantidade_frascos: quantity,
      valor_total: `R$ ${Number(total || 0).toFixed(2)}`,
      valor_pago: `R$ ${Number(amountPaid || 0).toFixed(2)}`,
      valor_pendente: `R$ ${Number(amountDue || 0).toFixed(2)}`,
      forma_pagamento: paymentMethod === "split" ? "50% / 50%" : paymentMethod === "card" ? "Cartão" : "Dinheiro",
      vencimento: dueDate || null,
      vencimento_1a_parcela: firstDueDate || null,
      primeira_parcela_paga: firstPaid,
      em_atraso: !!isOverdue,
      vendedora: sellerName || "Essência Capixaba",
      whatsapp_loja: whatsapp || "+55 27 98876-7528",
    };

    const systemPrompt =
      "Você é uma vendedora de perfumes cordial e profissional da Essência Capixaba. " +
      "Gere uma mensagem curta de cobrança/lembrete de pagamento para enviar via WhatsApp, em português do Brasil. " +
      "Use tom gentil, próximo e respeitoso (sem ser invasivo). Use emojis com moderação (✨💛🧴📅💳). " +
      "Inclua: cumprimento personalizado com o nome do cliente, lembrete do produto comprado, detalhamento dos valores (total, pago, pendente), " +
      "data de vencimento quando houver, e formas de pagamento (PIX / Dinheiro). Finalize agradecendo. " +
      "Se estiver em atraso, mantenha o tom gentil mas mencione a data discretamente. " +
      "NÃO invente informações. Use apenas os dados fornecidos. Retorne apenas o texto da mensagem, sem aspas, sem markdown.";

    const buildFallback = () => {
      const linhas: string[] = [];
      linhas.push(`Olá ${ctx.cliente}! ✨`);
      linhas.push("");
      linhas.push(
        `Passando para lembrar sobre o seu perfume ${ctx.produto}${ctx.marca ? ` (${ctx.marca})` : ""}` +
          `${ctx.quantidade_frascos ? ` — ${ctx.quantidade_frascos} frasco(s)` : ""}.`,
      );
      linhas.push("");
      linhas.push(`💰 Valor total: ${ctx.valor_total}`);
      if (Number(amountPaid) > 0) linhas.push(`✅ Já pago: ${ctx.valor_pago}`);
      linhas.push(`📌 Pendente: ${ctx.valor_pendente}`);
      if (ctx.vencimento) linhas.push(`📅 Vencimento: ${ctx.vencimento}`);
      else if (ctx.vencimento_1a_parcela) linhas.push(`📅 Vencimento da 1ª parcela: ${ctx.vencimento_1a_parcela}`);
      linhas.push("");
      linhas.push("💳 Pode pagar via PIX ou dinheiro.");
      linhas.push("");
      linhas.push(`Qualquer dúvida estou por aqui 💛 — ${ctx.vendedora}`);
      return linhas.join("\n");
    };

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Dados da venda:\n${JSON.stringify(ctx, null, 2)}` },
        ],
      }),
    });

    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      console.error("AI error:", resp.status, t);
      const notice =
        resp.status === 402
          ? "Créditos de IA esgotados — usando modelo padrão."
          : resp.status === 429
            ? "Limite de requisições — usando modelo padrão."
            : "IA indisponível — usando modelo padrão.";
      return new Response(
        JSON.stringify({ message: buildFallback(), fallback: true, notice }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await resp.json();
    const message: string = data?.choices?.[0]?.message?.content?.trim() ?? "";
    return new Response(JSON.stringify({ message: message || buildFallback(), fallback: !message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});