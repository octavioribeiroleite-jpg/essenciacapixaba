const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "text obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY ausente" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tools = [
      {
        type: "function",
        function: {
          name: "register_perfumes",
          description:
            "Registra TODOS os perfumes detectados no texto. Sempre retorne array, mesmo com 1 item.",
          parameters: {
            type: "object",
            properties: {
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string", description: "Nome do perfume" },
                    brand: { type: ["string", "null"], description: "Marca" },
                    total_ml: {
                      type: ["number", "null"],
                      description: "Mililitros do frasco (ex: 100)",
                    },
                    total_cost: {
                      type: ["number", "null"],
                      description: "Preço pago em reais",
                    },
                  },
                  required: ["name"],
                },
              },
            },
            required: ["items"],
          },
        },
      },
    ];

    const systemPrompt = `Você é um assistente que extrai informações de listas, pedidos e mensagens de perfumes em português.
Identifique TODOS os perfumes presentes no texto — nunca pule itens.
Para cada perfume extraia: nome, marca (quando visível), volume em ml do frasco e preço pago em reais.
Se algum campo não estiver visível, retorne null. Sempre chame a ferramenta register_perfumes com a lista completa.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Extraia todos os perfumes deste texto:\n\n${text}` },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "register_perfumes" } },
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      const status = response.status === 429 || response.status === 402 ? response.status : 500;
      return new Response(JSON.stringify({ error: t }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const args = toolCall ? JSON.parse(toolCall.function.arguments) : { items: [] };

    return new Response(JSON.stringify({ items: args.items || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});