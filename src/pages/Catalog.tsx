import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import {
  Search, MessageCircle, Share2, Sparkles, Droplet, User, Clock, Wind,
  SlidersHorizontal, GitCompare, Check, CalendarClock, Copy, FileDown, ArrowLeft,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ML_PER_FRASCO, perFrasco, formatFrascos, priceFrascoRounded } from "@/lib/frascos";

const publicSupabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const WHATSAPP_NUMBER = "5527988767528";

const OCCASION_GROUPS: { label: string; items: string[] }[] = [
  { label: "Período do dia", items: ["Manhã", "Tarde", "Noite", "Qualquer hora"] },
  { label: "Clima", items: ["Quente", "Frio", "Neutro"] },
  {
    label: "Ocasião",
    items: ["Trabalho", "Casual", "Pós-banho", "Encontro", "Festa", "Formal", "Especial", "Presente", "Praia/Piscina"],
  },
  { label: "Perfil", items: ["Jovem", "Clássico", "Moderno", "Maduro", "Romântico", "Marcante"] },
];

const OCCASION_QUICK = ["Trabalho", "Casual", "Encontro", "Festa", "Formal", "Especial", "Presente", "Praia/Piscina"];

type Notes = { top?: string[]; heart?: string[]; base?: string[] };
type Product = {
  id: string;
  name: string;
  brand: string | null;
  image_url: string | null;
  sale_price_per_ml: number;
  current_ml: number;
  total_ml: number;
  concentration: string | null;
  gender: string | null;
  longevity: string | null;
  sillage: string | null;
  description: string | null;
  fragrance_notes: Notes | null;
  occasions: string[] | null;
  olfactory_family: string | null;
};

type GenderFilter = "Todos" | "Masculino" | "Feminino" | "Unissex";
type SortOption = "az" | "za" | "preco_asc" | "preco_desc";

export default function Catalog() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("Todos");
  const [selected, setSelected] = useState<Product | null>(null);
  const [searchParams] = useSearchParams();
  const inApp = searchParams.get("app") === "1";
  const [showFilters, setShowFilters] = useState(false);
  const [brandFilter, setBrandFilter] = useState<string>("Todas");
  const [occasionFilter, setOccasionFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("az");
  const [compareList, setCompareList] = useState<Product[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [qrLargeOpen, setQrLargeOpen] = useState(false);
  const { id: routeId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Catálogo · Essência Capixaba";
    const meta = document.querySelector('meta[name="description"]');
    const desc = "Catálogo de perfumes árabes e importados. Frascos de 100ml. Peça pelo WhatsApp.";
    if (meta) meta.setAttribute("content", desc);
    else {
      const m = document.createElement("meta");
      m.name = "description";
      m.content = desc;
      document.head.appendChild(m);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await publicSupabase
        .from("catalog_products" as any)
        .select("id,name,brand,image_url,sale_price_per_ml,current_ml,total_ml,concentration,gender,longevity,sillage,description,fragrance_notes,occasions,olfactory_family")
        .order("name");
      if (error) toast.error("Erro ao carregar catálogo");
      setProducts((data as Product[]) || []);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (routeId && products.length) {
      const p = products.find((x) => x.id === routeId);
      if (p) setSelected(p);
    }
  }, [routeId, products]);

  const brands = useMemo(() => {
    const set = new Set(products.map((p) => p.brand || "Sem marca"));
    return ["Todas", ...Array.from(set).sort()];
  }, [products]);

  const { minPossible, maxPossible } = useMemo(() => {
    if (!products.length) return { minPossible: 0, maxPossible: 1000 };
    const prices = products.map((p) => priceFrascoRounded(p.sale_price_per_ml));
    return {
      minPossible: Math.floor(Math.min(...prices)),
      maxPossible: Math.ceil(Math.max(...prices) / 100) * 100,
    };
  }, [products]);

  const [priceRange, setPriceRange] = useState<[number, number]>([0, 1000]);
  useEffect(() => {
    if (products.length) setPriceRange([minPossible, maxPossible]);
  }, [minPossible, maxPossible, products.length]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = products.filter((p) => {
      const matchSearch = !q || p.name.toLowerCase().includes(q) || (p.brand ?? "").toLowerCase().includes(q);
      const matchGender = genderFilter === "Todos" || p.gender === genderFilter;
      const matchBrand = brandFilter === "Todas" || (p.brand || "Sem marca") === brandFilter;
      const price = priceFrascoRounded(p.sale_price_per_ml);
      const matchPrice = price >= priceRange[0] && price <= priceRange[1];
      const matchOccasion = !occasionFilter || (p.occasions ?? []).includes(occasionFilter);
      return matchSearch && matchGender && matchBrand && matchPrice && matchOccasion;
    });

    list = [...list].sort((a, b) => {
      const aOut = Number(a.current_ml) <= 0 ? 1 : 0;
      const bOut = Number(b.current_ml) <= 0 ? 1 : 0;
      if (aOut !== bOut) return aOut - bOut;
      if (sortBy === "az") return a.name.localeCompare(b.name);
      if (sortBy === "za") return b.name.localeCompare(a.name);
      if (sortBy === "preco_asc") return priceFrascoRounded(a.sale_price_per_ml) - priceFrascoRounded(b.sale_price_per_ml);
      if (sortBy === "preco_desc") return priceFrascoRounded(b.sale_price_per_ml) - priceFrascoRounded(a.sale_price_per_ml);
      return 0;
    });
    return list;
  }, [products, search, genderFilter, brandFilter, priceRange, occasionFilter, sortBy]);

  const priceFrasco = (p: Product) => priceFrascoRounded(p.sale_price_per_ml).toFixed(0);
  const frascosCount = (p: Product) => Math.floor(Number(p.current_ml) / ML_PER_FRASCO);

  const waLink = (msg: string) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;

  const catalogUrl = typeof window !== "undefined" ? `${window.location.origin}/catalogo` : "";
  const qrUrl = (size: number) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=10&data=${encodeURIComponent(catalogUrl)}`;

  const shareCatalog = () => setShareOpen(true);

  const exportPDF = () => {
    const rows = filtered.map((p) => {
      const fr = frascosCount(p);
      const badge = fr === 0 ? "Sob encomenda" : fr <= 2 ? "Últimas" : "Disponível";
      const badgeColor = fr === 0 ? "#b45309" : fr <= 2 ? "#9333ea" : "#15803d";
      return `<tr>
        <td style="padding:8px;border-bottom:1px solid #eee">${p.name}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;color:#666">${p.brand ?? "—"}</td>
        <td style="padding:8px;border-bottom:1px solid #eee">${p.gender ?? "—"}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;font-weight:600;color:#7c3aed">R$ ${priceFrasco(p)}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;color:${badgeColor};font-weight:600">${badge}</td>
      </tr>`;
    }).join("");
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
      <title>Catálogo Essência Capixaba</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#111}
        @media print{body{-webkit-print-color-adjust:exact}}
        table{width:100%;border-collapse:collapse;margin-top:8px}
        th{background:#4c1d95;color:#fff;padding:10px 8px;text-align:left;font-size:12px}
      </style></head><body>
      <div style="background:linear-gradient(135deg,#4c1d95,#7c3aed);color:#fff;padding:24px 32px">
        <h1 style="font-size:22px;font-weight:700">🌸 Essência Capixaba</h1>
        <p style="font-size:12px;opacity:.85;margin-top:4px">${filtered.length} perfume(s) · Frascos de 100ml · Pedidos via WhatsApp</p>
      </div>
      <div style="padding:16px 32px">
        <table>
          <thead><tr><th>Perfume</th><th>Marca</th><th>Gênero</th><th style="text-align:right">Preço</th><th>Estoque</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="margin-top:24px;font-size:10px;color:#888;text-align:center">Gerado em ${new Date().toLocaleString("pt-BR")}</p>
      </div>
      <script>window.onload=()=>setTimeout(()=>window.print(),300);</script>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toast.error("Permita pop-ups para gerar o PDF"); return; }
    w.document.write(html);
    w.document.close();
  };

  const copyCatalogLink = async () => {
    try {
      await navigator.clipboard.writeText(catalogUrl);
      toast.success("Link copiado!");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const nativeShareCatalog = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Essência Capixaba", url: catalogUrl });
      } else {
        await copyCatalogLink();
      }
    } catch { /* ignored */ }
  };

  const sharePerfume = async (p: Product) => {
    const url = `${window.location.origin}/catalogo/${p.id}`;
    try {
      if (navigator.share) await navigator.share({ title: p.name, url });
      else { await navigator.clipboard.writeText(url); toast.success("Link do perfume copiado!"); }
    } catch { /* ignored */ }
  };

  const toggleCompare = (p: Product) => {
    setCompareList((prev) => {
      if (prev.find((x) => x.id === p.id)) return prev.filter((x) => x.id !== p.id);
      if (prev.length >= 3) { toast.warning("Máximo 3 perfumes para comparar"); return prev; }
      return [...prev, p];
    });
  };

  const isInCompare = (p: Product) => compareList.some((x) => x.id === p.id);

  const stockBadge = (fr: number) => {
    if (fr === 0) return { label: "Sob encomenda", cls: "bg-amber-500 text-white" };
    if (fr <= 2) return { label: "Últimas", cls: "bg-primary text-primary-foreground" };
    return { label: "Disponível", cls: "bg-green-500 text-white" };
  };

  const parseLongevity = (v: string | null) => {
    if (!v) return null;
    const s = v.toLowerCase();
    if (s.startsWith("muito alt")) return "4/4";
    if (s.startsWith("alt")) return "3/4";
    if (s.startsWith("méd") || s.startsWith("med")) return "2/4";
    if (s.startsWith("baix")) return "1/4";
    return v;
  };

  const parseSillage = (v: string | null) => {
    if (!v) return null;
    const s = v.toLowerCase();
    if (s.startsWith("suave") || s.startsWith("baix") || s.startsWith("intim")) return "1/4";
    if (s.startsWith("moder") || s.startsWith("méd") || s.startsWith("med")) return "2/4";
    if (s.startsWith("forte") || s.startsWith("alt")) return "3/4";
    if (s.startsWith("enorme") || s.startsWith("muito")) return "4/4";
    return v;
  };

  const activeFiltersCount = [
    brandFilter !== "Todas",
    occasionFilter !== null,
    priceRange[0] > minPossible || priceRange[1] < maxPossible,
  ].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40 backdrop-blur-sm bg-card/90">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2">
            {inApp && (
              <button
                onClick={() => navigate("/dashboard")}
                className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-secondary transition-colors flex-shrink-0"
                aria-label="Voltar ao app"
                title="Voltar ao app"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-foreground flex items-center gap-1.5 truncate">
              <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
              Essência Capixaba
            </h1>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              {products.length} {products.length === 1 ? "perfume" : "perfumes"} disponíveis
            </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={exportPDF}
              className="h-8 px-2.5 rounded-md flex items-center gap-1 hover:bg-secondary transition-colors text-xs font-semibold text-violet-700"
              title="Gerar PDF do catálogo atual"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">PDF</span>
            </button>
            <button
              onClick={shareCatalog}
              className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-secondary transition-colors"
              aria-label="Compartilhar catálogo"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <a
              href={waLink("Olá! Vi o catálogo e quero fazer um pedido.")}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold px-3 py-2 rounded-full inline-flex items-center gap-1.5 transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">WhatsApp</span>
              <span className="sm:hidden">Pedir</span>
            </a>
          </div>
        </div>
      </header>

      <main className={`max-w-5xl mx-auto px-4 py-5 space-y-4 ${compareList.length > 0 ? "pb-24" : ""}`}>
        {/* Busca + filtros + ordenação */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar perfume ou marca..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-card border-border rounded-xl text-sm h-10"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`relative flex items-center gap-1.5 px-3 h-10 rounded-xl border text-sm font-medium transition-colors ${
              showFilters ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-foreground"
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline">Filtros</span>
            {activeFiltersCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {activeFiltersCount}
              </span>
            )}
          </button>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="bg-card border border-border rounded-xl text-sm px-2 h-10 text-foreground cursor-pointer"
          >
            <option value="az">A→Z</option>
            <option value="za">Z→A</option>
            <option value="preco_asc">Menor preço</option>
            <option value="preco_desc">Maior preço</option>
          </select>
        </div>

        {/* Painel de filtros */}
        {showFilters && (
          <div className="bg-card border border-border rounded-2xl p-4 space-y-4 animate-in fade-in slide-in-from-top-2">
            <div>
              <p className="text-xs font-bold text-foreground mb-2 uppercase tracking-wide">Marca</p>
              <div className="flex flex-wrap gap-1.5">
                {brands.map((b) => (
                  <button
                    key={b}
                    onClick={() => setBrandFilter(b)}
                    className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                      brandFilter === b ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-foreground mb-2 uppercase tracking-wide">
                Preço por frasco: R$ {priceRange[0]} — R$ {priceRange[1]}
              </p>
              <input
                type="range"
                min={minPossible}
                max={maxPossible}
                value={priceRange[1]}
                onChange={(e) => setPriceRange([priceRange[0], Number(e.target.value)])}
                className="w-full accent-primary"
              />
            </div>

            <div>
              <p className="text-xs font-bold text-foreground mb-2 uppercase tracking-wide">Ocasião</p>
              <div className="flex flex-wrap gap-1.5">
                {OCCASION_QUICK.map((o) => (
                  <button
                    key={o}
                    onClick={() => setOccasionFilter(occasionFilter === o ? null : o)}
                    className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                      occasionFilter === o ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </div>

            {activeFiltersCount > 0 && (
              <button
                onClick={() => {
                  setBrandFilter("Todas");
                  setOccasionFilter(null);
                  setPriceRange([minPossible, maxPossible]);
                }}
                className="text-xs text-primary font-medium underline"
              >
                Limpar filtros
              </button>
            )}
          </div>
        )}

        {/* Filtro de gênero */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {(["Todos", "Masculino", "Feminino", "Unissex"] as GenderFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setGenderFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium whitespace-nowrap transition-colors ${
                genderFilter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <p className="text-[11px] text-muted-foreground">
          {filtered.length} perfume{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}
        </p>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] bg-card rounded-2xl border border-border animate-pulse" />
            ))}
          </div>
        ) : (() => {
          const inStock = filtered.filter((p) => Number(p.current_ml) > 0);
          const onDemand = filtered.filter((p) => Number(p.current_ml) <= 0);
          const renderCard = (p: Product) => {
              const fr = frascosCount(p);
              const badge = stockBadge(fr);
              const topNote = p.fragrance_notes?.top?.[0];
              const inCompare = isInCompare(p);

              const longevityLabel = (() => {
                const v = p.longevity;
                if (!v) return null;
                const s = v.toLowerCase();
                if (s.startsWith("muito alt")) return "Muito Alta";
                if (s.startsWith("alt")) return "Alta";
                if (s.startsWith("méd") || s.startsWith("med")) return "Média";
                if (s.startsWith("baix")) return "Baixa";
                return v;
              })();
              const sillageLabel = (() => {
                const v = p.sillage;
                if (!v) return null;
                const s = v.toLowerCase();
                if (s.startsWith("suave") || s.startsWith("intim")) return "Suave";
                if (s.startsWith("moder") || s.startsWith("méd") || s.startsWith("med")) return "Moderada";
                if (s.startsWith("forte")) return "Forte";
                if (s.startsWith("enorme") || s.startsWith("muito")) return "Enorme";
                return v;
              })();
              const mainOccasions = (p.occasions ?? [])
                .filter((o) => ["Casual", "Encontro", "Festa", "Formal", "Trabalho", "Especial"].includes(o))
                .slice(0, 2);
              const clima = (p.occasions ?? []).find((o) => ["Quente", "Frio", "Neutro"].includes(o));

              return (
                <div
                  key={p.id}
                  className={`flex flex-col bg-card rounded-2xl border overflow-hidden transition-all ${
                    inCompare ? "border-primary ring-2 ring-primary/30" : "border-border/60 hover:shadow-md hover:-translate-y-0.5"
                  }`}
                >
                  <button onClick={() => setSelected(p)} className="text-left flex flex-col flex-1">
                    <div className="w-full aspect-square bg-secondary relative overflow-hidden">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} loading="lazy" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-muted-foreground/30">
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      {p.gender && (
                        <span className="absolute top-1.5 left-1.5 text-[9px] font-bold bg-black/50 text-white px-1.5 py-0.5 rounded-full backdrop-blur-sm">
                          {p.gender}
                        </span>
                      )}
                      <span className={`absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="p-2.5 flex flex-col gap-1.5 flex-1">
                      <p className="text-xs font-semibold text-foreground leading-tight line-clamp-2">{p.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {p.brand || "Sem marca"}{p.concentration ? ` · ${p.concentration}` : ""}
                      </p>
                      {p.olfactory_family && (
                        <p className="text-[10px] text-primary/70 italic truncate capitalize">{p.olfactory_family}</p>
                      )}
                      {topNote && (
                        <p className="text-[10px] text-primary/80 truncate">🌿 {topNote}</p>
                      )}
                      {(longevityLabel || sillageLabel) && (
                        <div className="flex flex-wrap gap-1">
                          {longevityLabel && (
                            <span className="inline-flex items-center gap-1 bg-muted/70 rounded-md px-1.5 py-0.5 text-[10px] font-medium">
                              ⏱ {longevityLabel}
                            </span>
                          )}
                          {sillageLabel && (
                            <span className="inline-flex items-center gap-1 bg-muted/70 rounded-md px-1.5 py-0.5 text-[10px] font-medium">
                              💨 {sillageLabel}
                            </span>
                          )}
                        </div>
                      )}
                      {(mainOccasions.length > 0 || clima) && (
                        <div className="flex flex-wrap gap-1">
                          {mainOccasions.map((o) => (
                            <span key={o} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                              {o}
                            </span>
                          ))}
                          {clima && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground border border-border">
                              {clima === "Quente" ? "🌞" : clima === "Frio" ? "❄️" : "🌤"} {clima}
                            </span>
                          )}
                        </div>
                      )}
                      <p className="text-sm font-bold text-primary mt-auto pt-1">
                        R$ {priceFrasco(p)}
                        <span className="text-[10px] font-normal text-muted-foreground">/frasco</span>
                      </p>
                    </div>
                  </button>

                  {/* Ações */}
                  <div className="flex items-stretch gap-1 px-2 pb-2">
                    <a
                      href={waLink(`Olá! Quero o perfume *${p.name}* (${p.brand || ""}) por R$ ${priceFrasco(p)}.`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-semibold px-2 py-2 rounded-xl inline-flex items-center justify-center gap-1 transition-colors"
                    >
                      <MessageCircle className="w-3 h-3" /> Pedir
                    </a>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleCompare(p); }}
                      className={`px-2 py-2 rounded-xl border text-xs transition-colors ${
                        inCompare ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:bg-muted"
                      }`}
                      title="Comparar"
                    >
                      {inCompare ? <Check className="w-3.5 h-3.5" /> : <GitCompare className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); sharePerfume(p); }}
                      className="px-2 py-2 rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors"
                      title="Compartilhar"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
          };
          return (
            <div className="space-y-6">
              {inStock.length > 0 && (
                <section className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_0_4px_hsl(var(--background)),0_0_0_5px_rgb(16_185_129_/_0.3)]" />
                    <h2 className="text-sm sm:text-base font-bold tracking-wide uppercase text-foreground">
                      Disponíveis em estoque
                    </h2>
                    <span className="text-[11px] text-muted-foreground">({inStock.length})</span>
                    <div className="flex-1 h-px bg-gradient-to-r from-border via-border to-transparent" />
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {inStock.map(renderCard)}
                  </div>
                </section>
              )}

              {onDemand.length > 0 && (
                <section className="space-y-3 pt-2">
                  <div className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shadow-[0_0_0_4px_hsl(var(--background)),0_0_0_5px_rgb(245_158_11_/_0.3)]" />
                    <h2 className="text-sm sm:text-base font-bold tracking-wide uppercase text-foreground">
                      Sob encomenda
                    </h2>
                    <span className="text-[11px] text-muted-foreground">({onDemand.length})</span>
                    <div className="flex-1 h-px bg-gradient-to-r from-border via-border to-transparent" />
                  </div>
                  <p className="text-[11px] text-muted-foreground -mt-1">
                    Disponíveis mediante encomenda — prazo combinado via WhatsApp.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {onDemand.map(renderCard)}
                  </div>
                </section>
              )}
            </div>
          );
        })()}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 space-y-2">
            <p className="text-3xl">🔍</p>
            <p className="text-sm text-muted-foreground">Nenhum perfume encontrado.</p>
            <button
              onClick={() => {
                setSearch("");
                setGenderFilter("Todos");
                setBrandFilter("Todas");
                setOccasionFilter(null);
                setPriceRange([minPossible, maxPossible]);
              }}
              className="text-primary text-sm underline"
            >
              Limpar todos os filtros
            </button>
          </div>
        )}

        <p className="text-center text-[10px] text-muted-foreground pt-4 pb-2">
          Frascos de 100ml · Estoque atualizado em tempo real
        </p>
      </main>

      {/* ── Barra flutuante de comparação ── */}
      {compareList.length > 0 && (
        <div
          className={`fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-3 px-4 py-3
            bg-white/95 backdrop-blur-md border-t border-border/60 shadow-[0_-4px_24px_rgba(0,0,0,0.08)]
            transition-all duration-300 ease-in-out
            ${compareList.length === 1 ? "opacity-80" : "opacity-100"}`}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {[0, 1, 2].map((i) => {
                const p = compareList[i];
                return (
                  <div
                    key={i}
                    className={`relative w-11 h-11 rounded-xl overflow-hidden border-2 transition-all duration-200
                      ${p ? "border-primary shadow-sm scale-100" : "border-dashed border-border/50 bg-muted/40 scale-95"}`}
                  >
                    {p ? (
                      <>
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-primary/10">
                            <span className="text-xs font-bold text-primary">{p.name.charAt(0)}</span>
                          </div>
                        )}
                        <button
                          onClick={() => toggleCompare(p)}
                          className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] flex items-center justify-center shadow font-bold leading-none"
                        >
                          ×
                        </button>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-[10px] text-muted-foreground/40 font-medium">+</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground leading-tight">
                {compareList.length === 1
                  ? "Selecione mais 1"
                  : compareList.length === 2
                  ? "Pronto para comparar!"
                  : "3 perfumes selecionados"}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                {compareList.map((p) => p.name.split(" ")[0]).join(", ")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setCompareList([])}
              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              Limpar
            </button>
            <button
              onClick={() => setShowCompare(true)}
              disabled={compareList.length < 2}
              className={`flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl transition-all
                ${compareList.length >= 2
                  ? "bg-primary text-primary-foreground shadow-sm hover:opacity-90 active:scale-95"
                  : "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
                }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              Comparar{compareList.length >= 2 ? ` (${compareList.length})` : ""}
            </button>
          </div>
        </div>
      )}

      {/* Modal: Detalhe */}
      <Dialog
        open={!!selected}
        onOpenChange={(o) => {
          if (!o) {
            setSelected(null);
            if (routeId) navigate("/catalogo", { replace: true });
          }
        }}
      >
        <DialogContent className="max-w-md p-0 overflow-hidden rounded-3xl max-h-[92vh] flex flex-col">
          {selected && (
            <>
              <div className="aspect-square bg-secondary relative flex items-center justify-center overflow-hidden flex-shrink-0">
                {selected.image_url ? (
                  <img src={selected.image_url} alt={selected.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-7xl font-bold text-muted-foreground/30">
                    {selected.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <button
                  onClick={() => sharePerfume(selected)}
                  className="absolute top-3 right-12 bg-black/40 hover:bg-black/60 text-white rounded-full p-2 backdrop-blur-sm transition-colors"
                  aria-label="Compartilhar"
                >
                  <Share2 className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4 overflow-y-auto">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-foreground leading-tight">{selected.name}</h2>
                    <p className="text-sm text-muted-foreground">{selected.brand || "Sem marca"}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xl font-bold text-primary">R$ {priceFrasco(selected)}</p>
                    <p className="text-[10px] text-muted-foreground">por frasco · 100ml</p>
                  </div>
                </div>

                {selected.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed">{selected.description}</p>
                )}

                {(selected.concentration || selected.gender || selected.longevity || selected.sillage) && (
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Concentração", value: selected.concentration, Icon: Droplet },
                      { label: "Família olfativa", value: selected.olfactory_family, Icon: Droplet },
                      { label: "Gênero", value: selected.gender, Icon: User },
                      { label: "Fixação", value: parseLongevity(selected.longevity), Icon: Clock },
                      { label: "Projeção", value: parseSillage(selected.sillage), Icon: Wind },
                    ]
                      .filter((s) => s.value)
                      .map(({ label, value, Icon }) => (
                        <div key={label} className="bg-secondary rounded-xl p-2.5">
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                            <Icon className="w-3 h-3" />
                            {label}
                          </p>
                          <p className="text-xs font-semibold text-foreground mt-0.5">{value}</p>
                        </div>
                      ))}
                  </div>
                )}

                {selected.fragrance_notes && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-foreground uppercase tracking-wide">Notas Olfativas</p>
                    {(
                      [
                        { key: "top", label: "Topo", cls: "bg-yellow-50 text-yellow-700 border-yellow-200" },
                        { key: "heart", label: "Coração", cls: "bg-rose-50 text-rose-700 border-rose-200" },
                        { key: "base", label: "Base", cls: "bg-amber-50 text-amber-800 border-amber-200" },
                      ] as const
                    ).map(({ key, label, cls }) => {
                      const notes = selected.fragrance_notes?.[key];
                      if (!notes?.length) return null;
                      return (
                        <div key={key}>
                          <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {notes.map((n) => (
                              <span key={n} className={`text-[11px] border px-2 py-0.5 rounded-full ${cls}`}>
                                {n}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {selected.occasions && selected.occasions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <CalendarClock className="w-3.5 h-3.5 text-primary" />
                      Quando Usar
                    </p>
                    {OCCASION_GROUPS.map((g) => {
                      const sel = (selected.occasions ?? []).filter((o) => g.items.includes(o));
                      if (sel.length === 0) return null;
                      return (
                        <div key={g.label}>
                          <p className="text-[10px] text-muted-foreground mb-1">{g.label}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {sel.map((o) => (
                              <span
                                key={o}
                                className="text-[11px] bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 rounded-full"
                              >
                                {o}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-emerald-700">✅ Disponível</p>
                    <p className="text-[10px] text-emerald-600">
                      {formatFrascos(selected.current_ml)} frasco{frascosCount(selected) !== 1 ? "s" : ""} em estoque
                    </p>
                  </div>
                  <a
                    href={waLink(
                      `Olá! Quero comprar o perfume *${selected.name}* (${selected.brand || ""}) por R$ ${priceFrasco(selected)}.`
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold px-4 py-2 rounded-xl inline-flex items-center gap-1.5 flex-shrink-0 transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Pedir
                  </a>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal: Comparador */}
      <Dialog open={showCompare} onOpenChange={setShowCompare}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
          <div className="flex items-center gap-2 mb-4">
            <GitCompare className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-foreground">Comparar Perfumes</h2>
          </div>
          <div className={`grid gap-3 ${compareList.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
            {compareList.map((p) => (
              <div key={p.id} className="bg-card border border-border rounded-2xl p-3 space-y-3">
                <div className="text-center space-y-1">
                  <div className="aspect-square bg-secondary rounded-xl overflow-hidden flex items-center justify-center">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-3xl font-bold text-muted-foreground/30">{p.name.charAt(0)}</span>
                    )}
                  </div>
                  <p className="text-xs font-bold text-foreground leading-tight line-clamp-2">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground">{p.brand || "Sem marca"}</p>
                  <p className="text-sm font-bold text-primary">R$ {priceFrasco(p)}</p>
                </div>

                {[
                  { label: "Concentração", value: p.concentration },
                  { label: "Família olfativa", value: p.olfactory_family },
                  { label: "Gênero", value: p.gender },
                  { label: "Fixação", value: parseLongevity(p.longevity) },
                  { label: "Projeção", value: parseSillage(p.sillage) },
                  { label: "Frascos", value: `${frascosCount(p)} frasco(s)` },
                  { label: "Topo", value: p.fragrance_notes?.top?.join(", ") },
                  { label: "Coração", value: p.fragrance_notes?.heart?.join(", ") },
                  { label: "Base", value: p.fragrance_notes?.base?.join(", ") },
                ].map(({ label, value }) => (
                  <div key={label} className="border-t border-border pt-2">
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</p>
                    <p className="text-[11px] text-foreground">{value || "—"}</p>
                  </div>
                ))}

                <button
                  onClick={() => toggleCompare(p)}
                  className="w-full text-xs text-destructive border border-destructive/30 rounded-xl py-1.5 hover:bg-destructive/10 transition-colors"
                >
                  Remover
                </button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: Compartilhar catálogo (QR + copiar link) */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-sm">
          <div className="flex items-center gap-2 mb-3">
            <Share2 className="w-5 h-5 text-primary" />
            <h2 className="text-base font-bold text-foreground">Compartilhar catálogo</h2>
          </div>

          <button
            type="button"
            onClick={() => setQrLargeOpen(true)}
            className="mx-auto block bg-white p-3 rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow"
            aria-label="Ampliar QR Code"
          >
            <img
              src={qrUrl(260)}
              alt="QR Code do catálogo"
              className="w-[220px] h-[220px] block"
            />
          </button>
          <p className="text-center text-[11px] text-muted-foreground mt-2">
            Toque no QR Code para ampliar
          </p>

          <div className="mt-4 flex items-center gap-2 bg-secondary/60 border border-border rounded-xl px-3 py-2">
            <span className="text-xs text-foreground truncate flex-1">{catalogUrl}</span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={copyCatalogLink}
              className="inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground text-sm font-semibold rounded-xl py-2.5 hover:bg-primary/90 transition-colors"
            >
              <Copy className="w-4 h-4" />
              Copiar link
            </button>
            <button
              type="button"
              onClick={nativeShareCatalog}
              className="inline-flex items-center justify-center gap-1.5 border border-border bg-card text-sm font-semibold rounded-xl py-2.5 hover:bg-secondary transition-colors"
            >
              <Share2 className="w-4 h-4" />
              Compartilhar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal: QR Code ampliado */}
      <Dialog open={qrLargeOpen} onOpenChange={setQrLargeOpen}>
        <DialogContent className="max-w-md p-4">
          <div className="bg-white rounded-2xl p-4 flex items-center justify-center">
            <img
              src={qrUrl(600)}
              alt="QR Code do catálogo ampliado"
              className="w-full h-auto max-w-[420px]"
            />
          </div>
          <p className="text-center text-xs text-muted-foreground mt-3 break-all">{catalogUrl}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}