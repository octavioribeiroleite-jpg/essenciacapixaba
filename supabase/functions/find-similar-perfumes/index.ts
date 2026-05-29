import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { perfumeName } = await req.json();
    if (!perfumeName || typeof perfumeName !== "string") {
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
      "Você é especialista em perfumaria. Retorne APENAS dados verificáveis do Fragrantica. NUNCA invente.";
    const userPrompt = `Perfume: "${perfumeName}". Retorne família olfativa, notas de topo/coração/base, gênero, fixação e sillage. Se não tiver certeza, use confidence baixa.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "get_perfume_profile",
              parameters: {
                type: "object",
                properties: {
                  confidence: { type: "string", enum: ["alta", "media", "baixa"] },
                  olfactory_family: { type: "string" },
                  gender: { type: "string", enum: ["Masculino", "Feminino", "Unissex"] },
                  longevity: { type: "string", enum: ["Baixa", "Média", "Alta", "Muito Alta"] },
                  sillage: { type: "string", enum: ["Suave", "Moderado", "Forte", "Enorme"] },
                  fragrance_notes: {
                    type: "object",
                    properties: {
                      top: { type: "array", items: { type: "string" } },
                      heart: { type: "array", items: { type: "string" } },
                      base: { type: "array", items: { type: "string" } },
                    },
                    required: ["top", "heart", "base"],
                  },
                },
                required: ["confidence", "fragrance_notes"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "get_perfume_profile" } },
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("ai_error", res.status, txt);
      if (res.status === 402) {
        return new Response(
          JSON.stringify({ ok: false, error: "no_credits", message: "Créditos da IA esgotados. Adicione créditos no Lovable Cloud." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (res.status === 429) {
        return new Response(
          JSON.stringify({ ok: false, error: "rate_limit", message: "Muitas buscas em sequência. Aguarde alguns segundos." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw new Error("ai_error");
    }

    const json = await res.json();
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("no_tool_call");

    const profile = typeof args === "string" ? JSON.parse(args) : args;

    if (profile.confidence === "baixa") {
      return new Response(
        JSON.stringify({ ok: false, error: "low_confidence", message: "Perfume não identificado com certeza" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: products, error: dbError } = await supabase
      .from("catalog_products")
      .select(
        "id,name,brand,olfactory_family,gender,longevity,sillage,fragrance_notes,occasions,sale_price_per_ml,current_ml,total_ml,image_url,concentration,description",
      )
      .gt("current_ml", 0);

    if (dbError) throw dbError;

    const allNotes = [
      ...(profile.fragrance_notes?.top || []),
      ...(profile.fragrance_notes?.heart || []),
      ...(profile.fragrance_notes?.base || []),
    ].map((n: string) => n.toLowerCase());

    const scored = (products || []).map((p: any) => {
      let score = 0;
      const pNotes = [
        ...(p.fragrance_notes?.top || []),
        ...(p.fragrance_notes?.heart || []),
        ...(p.fragrance_notes?.base || []),
      ].map((n: string) => n.toLowerCase());

      if (profile.olfactory_family && p.olfactory_family) {
        const fam1 = profile.olfactory_family.toLowerCase();
        const fam2 = p.olfactory_family.toLowerCase();
        if (fam1 === fam2) score += 40;
        else if (fam1.split(" ")[0] === fam2.split(" ")[0]) score += 20;
      }

      if (profile.gender && p.gender) {
        if (p.gender === profile.gender || p.gender === "Unissex" || profile.gender === "Unissex") score += 15;
      }

      for (const note of allNotes) {
        if (pNotes.some((pn) => pn.includes(note) || note.includes(pn))) score += 5;
      }

      if (profile.longevity && p.longevity === profile.longevity) score += 5;
      if (profile.sillage && p.sillage === profile.sillage) score += 5;

      return { ...p, similarity_score: score };
    });

    const similar = scored
      .filter((p: any) => p.similarity_score > 0)
      .sort((a: any, b: any) => b.similarity_score - a.similarity_score)
      .slice(0, 6);

    return new Response(JSON.stringify({ ok: true, profile, similar }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});