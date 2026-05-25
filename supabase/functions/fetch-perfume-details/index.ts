import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { productId, name, userId } = await req.json();
    if (!productId || !name || !userId) {
      return new Response(JSON.stringify({ ok: false, error: "params" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY ausente");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const systemPrompt =
      "Você é um especialista em perfumaria árabe e mainstream. Retorne dados precisos sobre o perfume informado. Se não tiver certeza de algum campo, devolva null/array vazio.";
    const userPrompt = `Perfume: "${name}". Devolva marca oficial, descrição curta (PT-BR, 2 frases), concentração, gênero, fixação, sillage e notas olfativas (topo, coração, base).`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "set_perfume_details",
              description: "Salvar detalhes do perfume",
              parameters: {
                type: "object",
                properties: {
                  brand: { type: "string", description: "Marca oficial" },
                  description: { type: "string" },
                  concentration: {
                    type: "string",
                    description: "EDP, EDT, Parfum, EDC, Extrait, etc.",
                  },
                  gender: {
                    type: "string",
                    enum: ["Masculino", "Feminino", "Unissex"],
                  },
                  longevity: {
                    type: "string",
                    enum: ["Baixa", "Média", "Alta", "Muito Alta"],
                  },
                  sillage: {
                    type: "string",
                    enum: ["Suave", "Moderado", "Forte", "Enorme"],
                  },
                  fragrance_notes: {
                    type: "object",
                    properties: {
                      top: { type: "array", items: { type: "string" } },
                      heart: { type: "array", items: { type: "string" } },
                      base: { type: "array", items: { type: "string" } },
                    },
                    required: ["top", "heart", "base"],
                    additionalProperties: false,
                  },
                },
                required: ["fragrance_notes"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: {
          type: "function",
          function: { name: "set_perfume_details" },
        },
      }),
    });

    if (res.status === 429) {
      return new Response(JSON.stringify({ ok: false, error: "rate_limit" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (res.status === 402) {
      return new Response(JSON.stringify({ ok: false, error: "credits" }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!res.ok) {
      const t = await res.text();
      console.error("ai gateway:", res.status, t);
      return new Response(JSON.stringify({ ok: false, error: "ai_error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await res.json();
    const call = json.choices?.[0]?.message?.tool_calls?.[0];
    const args = call?.function?.arguments;
    if (!args) {
      return new Response(JSON.stringify({ ok: false, error: "no_tool_call" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let data: any = {};
    try {
      data = typeof args === "string" ? JSON.parse(args) : args;
    } catch {
      return new Response(JSON.stringify({ ok: false, error: "parse" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Não sobrescreve marca se vier vazia
    const update: Record<string, unknown> = {
      description: data.description ?? null,
      concentration: data.concentration ?? null,
      gender: data.gender ?? null,
      longevity: data.longevity ?? null,
      sillage: data.sillage ?? null,
      fragrance_notes: data.fragrance_notes ?? {},
    };
    if (data.brand && typeof data.brand === "string" && data.brand.trim()) {
      update.brand = data.brand.trim();
    }

    const { error } = await supabase
      .from("products")
      .update(update)
      .eq("id", productId)
      .eq("user_id", userId);
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});