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

    const fmtDate = (d?: string | null) => {
      if (!d) return null;
      const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return `${m[3]}/${m[2]}/${m[1]}`;
      const dt = new Date(d);
      if (!isNaN(dt.getTime())) {
        const dd = String(dt.getDate()).padStart(2, "0");
        const mm = String(dt.getMonth() + 1).padStart(2, "0");
        return `${dd}/${mm}/${dt.getFullYear()}`;
      }
      return String(d);
    };

    const ctx = {
      cliente: customerName || "Cliente",
      produto: productName,
      marca: brand || "",
      quantidade_frascos: quantity,
      valor_total: `R$ ${Number(total || 0).toFixed(2)}`,
      valor_pago: `R$ ${Number(amountPaid || 0).toFixed(2)}`,
      valor_pendente: `R$ ${Number(amountDue || 0).toFixed(2)}`,
      forma_pagamento: paymentMethod === "split" ? "50% / 50%" : paymentMethod === "card" ? "Cartão" : "Dinheiro",
      vencimento: fmtDate(dueDate),
      vencimento_1a_parcela: fmtDate(firstDueDate),
      primeira_parcela_paga: firstPaid,
      em_atraso: !!isOverdue,
      vendedora: sellerName || "Essência Capixaba",
      whatsapp_loja: whatsapp || "+55 27 98876-7528",
    };

    const buildMessage = () => {
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

    return new Response(JSON.stringify({ message: buildMessage() }), {
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