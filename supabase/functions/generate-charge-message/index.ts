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

    if (resp.status === 429) {
      return new Response(JSON.stringify({ error: "Limite de requisições. Tente novamente em instantes." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (resp.status === 402) {
      return new Response(JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos no workspace." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI error:", resp.status, t);
      return new Response(JSON.stringify({ error: "Erro ao gerar mensagem" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const message: string = data?.choices?.[0]?.message?.content?.trim() ?? "";
    return new Response(JSON.stringify({ message }), {
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