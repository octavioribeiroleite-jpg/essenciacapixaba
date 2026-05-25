import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";
import { Search, MessageCircle, Share2, Sparkles, X, Droplet, User, Clock, Wind } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ML_PER_FRASCO, perFrasco, formatFrascos } from "@/lib/frascos";

// Cliente anônimo dedicado (não usa a sessão do dono logado)
const publicSupabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const WHATSAPP_NUMBER = "5527988767528";

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
};

type GenderFilter = "Todos" | "Masculino" | "Feminino" | "Unissex";

export default function Catalog() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState<GenderFilter>("Todos");
  const [selected, setSelected] = useState<Product | null>(null);
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
        .from("products")
        .select(
          "id,name,brand,image_url,sale_price_per_ml,current_ml,total_ml,concentration,gender,longevity,sillage,description,fragrance_notes"
        )
        .gt("current_ml", 0)
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

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter((p) => {
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.brand ?? "").toLowerCase().includes(q);
      const matchGender = genderFilter === "Todos" || p.gender === genderFilter;
      return matchSearch && matchGender;
    });
  }, [products, search, genderFilter]);

  const priceFrasco = (p: Product) => perFrasco(p.sale_price_per_ml).toFixed(2);
  const frascosCount = (p: Product) => Math.floor(Number(p.current_ml) / ML_PER_FRASCO);

  const waLink = (msg: string) =>
    `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;

  const shareCatalog = async () => {
    const url = `${window.location.origin}/catalogo`;
    try {
      if (navigator.share) await navigator.share({ title: "Essência Capixaba", url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copiado!");
      }
    } catch {
      /* ignored */
    }
  };

  const sharePerfume = async (p: Product) => {
    const url = `${window.location.origin}/catalogo/${p.id}`;
    try {
      if (navigator.share) await navigator.share({ title: p.name, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link do perfume copiado!");
      }
    } catch {
      /* ignored */
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40 backdrop-blur-sm bg-card/90">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-foreground flex items-center gap-1.5 truncate">
              <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
              Essência Capixaba
            </h1>
            <p className="text-[10px] sm:text-xs text-muted-foreground">
              {products.length} {products.length === 1 ? "perfume" : "perfumes"} disponíveis
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button size="sm" variant="ghost" onClick={shareCatalog} className="h-8 w-8 p-0">
              <Share2 className="w-4 h-4" />
            </Button>
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

      <main className="max-w-5xl mx-auto px-4 py-5 space-y-4">
        {/* Busca + filtros */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar perfume ou marca..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-card border-border rounded-xl text-sm h-10"
            />
          </div>
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
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] bg-card rounded-2xl border border-border animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {filtered.map((p) => {
              const fr = frascosCount(p);
              const isLow = fr <= 2;
              const topNote = p.fragrance_notes?.top?.[0];
              return (
                <button
                  key={p.id}
                  onClick={() => setSelected(p)}
                  className="text-left flex flex-col bg-card rounded-2xl border border-border/60 overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all active:scale-95"
                >
                  <div className="w-full aspect-square bg-secondary relative overflow-hidden">
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.name}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
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
                    {isLow && (
                      <span className="absolute top-1.5 right-1.5 text-[9px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                        Últimas
                      </span>
                    )}
                  </div>
                  <div className="p-2.5 flex flex-col gap-1 flex-1">
                    <p className="text-xs font-semibold text-foreground leading-tight line-clamp-2">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {p.brand || "Sem marca"}
                      {p.concentration ? ` · ${p.concentration}` : ""}
                    </p>
                    {topNote && (
                      <p className="text-[10px] text-primary/80 truncate">🌿 {topNote}</p>
                    )}
                    <p className="text-sm font-bold text-primary mt-auto pt-1">
                      R$ {priceFrasco(p)}
                      <span className="text-[10px] font-normal text-muted-foreground">/frasco</span>
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 space-y-2">
            <p className="text-3xl">🔍</p>
            <p className="text-sm text-muted-foreground">Nenhum perfume encontrado.</p>
          </div>
        )}

        <p className="text-center text-[10px] text-muted-foreground pt-4 pb-2">
          Frascos de 100ml · Estoque atualizado em tempo real
        </p>
      </main>

      {/* Modal de detalhes */}
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
                      { label: "Gênero", value: selected.gender, Icon: User },
                      { label: "Fixação", value: selected.longevity, Icon: Clock },
                      { label: "Projeção", value: selected.sillage, Icon: Wind },
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
    </div>
  );
}
