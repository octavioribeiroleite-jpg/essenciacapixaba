import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function ddgImage(query: string): Promise<string | null> {
  try {
    const r1 = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
    });
    const html = await r1.text();
    const vqd =
      html.match(/vqd=["']([\d-]+)["']/)?.[1] ||
      html.match(/vqd=([\d-]+)&/)?.[1];
    if (!vqd) return null;
    const r2 = await fetch(
      `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&p=1&f=,,,,,`,
      {
        headers: {
          Referer: "https://duckduckgo.com/",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        },
      },
    );
    if (!r2.ok) return null;
    const data = await r2.json();
    const results = data?.results || [];
    for (const it of results) {
      const url: string | undefined = it?.image;
      if (url && /^https?:\/\//.test(url) && /\.(jpg|jpeg|png|webp)(\?|$)/i.test(url)) {
        return url;
      }
    }
    return results[0]?.image || null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { productId, name, brand, userId } = await req.json();
    if (!productId || !name || !userId) {
      return new Response(JSON.stringify({ error: "productId, name, userId obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const query = `${brand ? brand + " " : ""}${name} perfume frasco`;
    const imageUrl = await ddgImage(query);
    if (!imageUrl) {
      return new Response(JSON.stringify({ ok: false, reason: "not_found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const imgRes = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
    });
    if (!imgRes.ok) {
      return new Response(JSON.stringify({ ok: false, reason: "download_failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";
    const bytes = new Uint8Array(await imgRes.arrayBuffer());
    if (bytes.length < 1000 || bytes.length > 8_000_000) {
      return new Response(JSON.stringify({ ok: false, reason: "invalid_size" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const path = `${userId}/${productId}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("product-images")
      .upload(path, bytes, { contentType, upsert: false });
    if (upErr) throw upErr;

    const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
    const publicUrl = urlData.publicUrl;

    const { error: updErr } = await supabase
      .from("products")
      .update({ image_url: publicUrl })
      .eq("id", productId)
      .eq("user_id", userId);
    if (updErr) throw updErr;

    return new Response(JSON.stringify({ ok: true, image_url: publicUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});