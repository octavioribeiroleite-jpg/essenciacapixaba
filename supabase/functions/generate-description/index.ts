import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { product_id } = await req.json();
    if (!product_id) {
      return new Response(JSON.stringify({ error: "product_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: product, error: prodErr } = await supabase
      .from("products")
      .select("name, brand, concentration, gender, fragrance_notes, sale_price_per_ml")
      .eq("id", product_id)
      .single();

    if (prodErr || !product) {
      return new Response(JSON.stringify({ error: "Produto não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const notes = (product.fragrance_notes ?? {}) as {
      top?: string[];
      heart?: string[];
      base?: string[];
    };
    const topNote = notes.top?.[0] ?? "";
    const heartNote = notes.heart?.[0] ?? "";
    const baseNote = notes.base?.[0] ?? "";

    const prompt = `Crie uma descrição comercial irresistível para o perfume "${product.name}" da marca ${product.brand ?? "árabe"}, concentração ${product.concentration ?? "EDP"}, gênero ${product.gender ?? "unissex"}${topNote ? `, nota de topo: ${topNote}` : ""}${heartNote ? `, coração: ${heartNote}` : ""}${baseNote ? `, base: ${baseNote}` : ""}. Escreva em português brasileiro, tom elegante, sofisticado e persuasivo, foco em venda. Máximo 4 linhas (~280 caracteres). Sem títulos, sem listas, sem emojis, sem mencionar preço.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (aiRes.status === 429) {
      return new Response(
        JSON.stringify({ error: "Muitas requisições. Aguarde um momento e tente novamente." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (aiRes.status === 402) {
      return new Response(
        JSON.stringify({ error: "Créditos de IA esgotados." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, txt);
      return new Response(JSON.stringify({ error: "Erro ao chamar IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const description: string | undefined = aiData.choices?.[0]?.message?.content?.trim();

    if (!description) {
      return new Response(JSON.stringify({ error: "IA não retornou descrição" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: updErr } = await supabase
      .from("products")
      .update({ description })
      .eq("id", product_id);
    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ description }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-description error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});