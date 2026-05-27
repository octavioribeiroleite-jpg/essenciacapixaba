import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type SeedItem = {
  name: string;
  brand: string | null;
  gender: string | null;
  price: number | null;
  description: string | null;
  top: string | null;
  heart: string | null;
  base: string | null;
  period: string | null;
  climate: string | null;
  occasion: string | null;
  profile: string | null;
};

function norm(s: string | null | undefined): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tagsFrom(it: SeedItem): string[] {
  const out = new Set<string>();
  const push = (txt: string | null) => {
    if (!txt) return;
    txt.split(/[,;/]| e /).map((s) => s.trim()).filter(Boolean).forEach((t) => out.add(t));
  };
  push(it.period);
  push(it.climate);
  push(it.occasion);
  push(it.profile);
  return Array.from(out).slice(0, 12);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const { items } = (await req.json()) as { items: SeedItem[] };
    if (!Array.isArray(items)) {
      return new Response(JSON.stringify({ error: "items array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Carrega existentes para dedup
    const { data: existing } = await admin
      .from("products")
      .select("id,name")
      .eq("user_id", userId);
    const existingSet = new Set((existing || []).map((p) => norm(p.name)));

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];
    const createdIds: { id: string; name: string; brand: string | null }[] = [];

    for (const it of items) {
      const key = norm(it.name);
      if (!key) {
        skipped++;
        continue;
      }
      if (existingSet.has(key)) {
        skipped++;
        continue;
      }
      const price = Number(it.price) || 0;
      const cost_per_ml = price > 0 ? price / 100 : 0;
      const sale_price_per_ml = price > 0 ? (price + 100) / 100 : 0;
      const fragrance_notes: Record<string, string> = {};
      if (it.top) fragrance_notes.top = it.top;
      if (it.heart) fragrance_notes.heart = it.heart;
      if (it.base) fragrance_notes.base = it.base;

      const { data: ins, error: insErr } = await admin
        .from("products")
        .insert({
          user_id: userId,
          name: it.name,
          brand: it.brand,
          gender: it.gender,
          total_ml: 0,
          current_ml: 0,
          cost_per_ml,
          sale_price_per_ml,
          description: it.description,
          fragrance_notes,
          occasions: tagsFrom(it),
        })
        .select("id,name,brand")
        .single();

      if (insErr) {
        errors.push(`${it.name}: ${insErr.message}`);
        continue;
      }
      created++;
      existingSet.add(key);
      createdIds.push({ id: ins.id, name: ins.name, brand: ins.brand });
    }

    return new Response(
      JSON.stringify({ ok: true, created, skipped, errors, createdIds }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});