import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search, Filter, X, Trash2, Pencil, ExternalLink, Eye, EyeOff,
  ShoppingCart, PackagePlus, Download, Sparkles, LayoutGrid, List,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { ML_PER_FRASCO, formatFrascos, perFrasco, priceFrascoRounded } from "@/lib/frascos";
import { classifyProducts, TIER_ORDER, type Tier } from "@/lib/productClassification";
import { ClassificationDot } from "@/components/ClassificationDot";
import { cn } from "@/lib/utils";

type StockFilter = "all" | "in_stock" | "low" | "out";
type SortKey = "name_asc" | "name_desc" | "price_asc" | "price_desc" | "stock_desc" | "stock_asc" | "tier";

export default function CatalogAdmin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState<string>("all");
  const [family, setFamily] = useState<string>("all");
  const [gender, setGender] = useState<string>("all");
  const [stock, setStock] = useState<StockFilter>("all");
  const [tier, setTier] = useState<Tier | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("name_asc");
  const [view, setView] = useState<"table" | "grid">("table");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { data: products } = useQuery({
    queryKey: ["admin-catalog-products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: salesForClass } = useQuery({
    queryKey: ["sales-classification"],
    queryFn: async () => {
      const since = new Date(Date.now() - 60 * 86400000).toISOString();
      const { data, error } = await supabase
        .from("sales")
        .select("product_id, ml_sold, created_at")
        .gte("created_at", since);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const classifications = useMemo(
    () => classifyProducts(products ?? [], salesForClass ?? []),
    [products, salesForClass]
  );

  const brands = useMemo(() => {
    const s = new Set<string>();
    products?.forEach((p) => p.brand && s.add(p.brand));
    return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [products]);

  const families = useMemo(() => {
    const s = new Set<string>();
    products?.forEach((p) => p.olfactory_family && s.add(p.olfactory_family));
    return Array.from(s).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = (products ?? []).filter((p) => {
      if (q) {
        const hay = `${p.name} ${p.brand ?? ""} ${p.olfactory_family ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (brand !== "all" && p.brand !== brand) return false;
      if (family !== "all" && p.olfactory_family !== family) return false;
      if (gender !== "all" && (p.gender ?? "") !== gender) return false;
      const cur = Number(p.current_ml);
      if (stock === "in_stock" && cur <= 0) return false;
      if (stock === "out" && cur > 0) return false;
      if (stock === "low" && (cur <= 0 || cur >= ML_PER_FRASCO * 2)) return false;
      if (tier !== "all" && classifications.get(p.id)?.tier !== tier) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      switch (sortKey) {
        case "name_desc": return b.name.localeCompare(a.name, "pt-BR");
        case "price_asc": return perFrasco(a.sale_price_per_ml) - perFrasco(b.sale_price_per_ml);
        case "price_desc": return perFrasco(b.sale_price_per_ml) - perFrasco(a.sale_price_per_ml);
        case "stock_desc": return Number(b.current_ml) - Number(a.current_ml);
        case "stock_asc": return Number(a.current_ml) - Number(b.current_ml);
        case "tier": {
          const ta = TIER_ORDER[classifications.get(a.id)?.tier ?? "gray"];
          const tb = TIER_ORDER[classifications.get(b.id)?.tier ?? "gray"];
          return ta - tb;
        }
        default: return a.name.localeCompare(b.name, "pt-BR");
      }
    });
    return list;
  }, [products, search, brand, family, gender, stock, tier, sortKey, classifications]);

  const stats = useMemo(() => {
    const total = filtered.length;
    let inStock = 0, outStock = 0, low = 0, frascos = 0, investido = 0, potencial = 0;
    for (const p of filtered) {
      const cur = Number(p.current_ml);
      const fr = cur / ML_PER_FRASCO;
      frascos += fr;
      investido += perFrasco(p.cost_per_ml) * fr;
      potencial += priceFrascoRounded(p.sale_price_per_ml) * fr;
      if (cur <= 0) outStock++;
      else {
        inStock++;
        if (cur < ML_PER_FRASCO * 2) low++;
      }
    }
    return { total, inStock, outStock, low, frascos, investido, potencial };
  }, [filtered]);

  const activeFilters =
    (brand !== "all" ? 1 : 0) + (family !== "all" ? 1 : 0) +
    (gender !== "all" ? 1 : 0) + (stock !== "all" ? 1 : 0) + (tier !== "all" ? 1 : 0);

  const clearFilters = () => {
    setBrand("all"); setFamily("all"); setGender("all"); setStock("all"); setTier("all");
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((p) => p.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const exportCsv = () => {
    const header = ["Nome", "Marca", "Família", "Gênero", "Frascos", "Custo R$", "Venda R$", "Lucro R$", "Giro"];
    const rows = filtered.map((p) => {
      const cost = perFrasco(p.cost_per_ml);
      const sale = priceFrascoRounded(p.sale_price_per_ml);
      const c = classifications.get(p.id);
      return [
        p.name, p.brand ?? "", p.olfactory_family ?? "", p.gender ?? "",
        formatFrascos(Number(p.current_ml)),
        cost.toFixed(2), sale.toFixed(2), (sale - cost).toFixed(2),
        c?.label ?? "—",
      ];
    });
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `catalogo-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${rows.length} itens exportados`);
  };

  const runAiOnSelected = async (kind: "photo" | "notes") => {
    if (!selected.size || !user) return;
    const items = filtered.filter((p) => selected.has(p.id));
    const fn = kind === "photo" ? "fetch-perfume-image" : "fetch-perfume-details";
    toast.loading(`Atualizando ${items.length} item(ns)...`, { id: "ai-batch" });
    let ok = 0;
    for (const p of items) {
      try {
        const body = kind === "photo"
          ? { productId: p.id, name: p.name, brand: p.brand, userId: user.id }
          : { productId: p.id, name: p.name, userId: user.id };
        const { data, error } = await supabase.functions.invoke(fn, { body });
        if (!error && data?.ok) ok++;
      } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 400));
    }
    toast.success(`${ok}/${items.length} atualizado(s)`, { id: "ai-batch" });
    await qc.invalidateQueries({ queryKey: ["admin-catalog-products"] });
  };

  const deleteSelected = async () => {
    if (!selected.size) return;
    const ids = Array.from(selected);
    const { error } = await supabase.from("products").delete().in("id", ids);
    if (error) { toast.error(error.message); return; }
    toast.success(`${ids.length} produto(s) excluído(s)`);
    setSelected(new Set());
    setConfirmDelete(false);
    await qc.invalidateQueries({ queryKey: ["admin-catalog-products"] });
  };

  return (
    <div className="p-4 lg:p-0 space-y-4 max-w-7xl mx-auto pb-24 lg:pb-8">
      {/* Header */}
      <div className="fade-in flex items-start justify-between gap-3 pt-2">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-foreground">Catálogo (admin)</h1>
          <p className="text-xs text-muted-foreground">
            Gestão completa do estoque — filtros, edição e ações em massa
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs h-9"
          onClick={() => window.open("/catalogo", "_blank")}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Versão pública
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <StatCard label="Itens listados" value={stats.total.toString()} />
        <StatCard label="Em estoque" value={stats.inStock.toString()} accent="emerald" />
        <StatCard label="Sob encomenda" value={stats.outStock.toString()} accent="slate" />
        <StatCard label="Estoque baixo" value={stats.low.toString()} accent="amber" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5">
        <StatCard label="Total de frascos" value={formatFrascos(stats.frascos * ML_PER_FRASCO)} />
        <StatCard label="Investido" value={`R$ ${stats.investido.toFixed(0)}`} accent="slate" />
        <StatCard label="Potencial venda" value={`R$ ${stats.potencial.toFixed(0)}`} accent="emerald" />
      </div>

      {/* Search + filter toggle */}
      <div className="fade-in flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, marca ou família..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 text-sm bg-secondary border-border rounded-xl"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-10 gap-1.5 text-xs relative"
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <Filter className="w-3.5 h-3.5" />
          Filtros
          {activeFilters > 0 && (
            <Badge className="ml-1 h-4 px-1.5 text-[10px] bg-primary text-primary-foreground">
              {activeFilters}
            </Badge>
          )}
        </Button>
        <div className="hidden lg:flex border border-border rounded-xl overflow-hidden h-10">
          <button
            onClick={() => setView("table")}
            className={cn("px-3 flex items-center gap-1 text-xs", view === "table" ? "bg-secondary" : "")}
          ><List className="w-3.5 h-3.5" /></button>
          <button
            onClick={() => setView("grid")}
            className={cn("px-3 flex items-center gap-1 text-xs border-l border-border", view === "grid" ? "bg-secondary" : "")}
          ><LayoutGrid className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {/* Filter sheet — sobe de baixo, fundo preto premium */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent
          side="bottom"
          className="border-t border-[#2a2a2a] bg-[#111111] text-[#EAE7DF] rounded-t-3xl p-0 max-h-[85vh] overflow-y-auto shadow-[0_-20px_60px_-15px_rgba(0,0,0,0.6)]"
        >
          <div className="mx-auto w-12 h-1.5 rounded-full bg-white/15 mt-2.5 mb-1" />
          <SheetHeader className="px-5 pt-2 pb-3 text-left">
            <SheetTitle className="text-base font-semibold text-[#EAE7DF] flex items-center gap-2">
              <Filter className="w-4 h-4 text-primary" />
              Filtros e ordenação
            </SheetTitle>
          </SheetHeader>

          <div className="px-5 pb-6 space-y-4 [&_label]:text-white/60 [&_button[role=combobox]]:bg-white/5 [&_button[role=combobox]]:border-white/10 [&_button[role=combobox]]:text-[#EAE7DF] [&_button[role=combobox]]:hover:bg-white/10">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
              <FilterSelect label="Marca" value={brand} onChange={setBrand}
                options={[{ value: "all", label: "Todas marcas" }, ...brands.map((b) => ({ value: b, label: b }))]} />
              <FilterSelect label="Família" value={family} onChange={setFamily}
                options={[{ value: "all", label: "Todas famílias" }, ...families.map((f) => ({ value: f, label: f }))]} />
              <FilterSelect label="Gênero" value={gender} onChange={setGender} options={[
                { value: "all", label: "Todos" },
                { value: "Masculino", label: "Masculino" },
                { value: "Feminino", label: "Feminino" },
                { value: "Unissex", label: "Unissex" },
              ]} />
              <FilterSelect label="Estoque" value={stock} onChange={(v) => setStock(v as StockFilter)} options={[
                { value: "all", label: "Todos" },
                { value: "in_stock", label: "Com estoque" },
                { value: "low", label: "Estoque baixo" },
                { value: "out", label: "Esgotado" },
              ]} />
              <FilterSelect label="Giro" value={tier} onChange={(v) => setTier(v as Tier | "all")} options={[
                { value: "all", label: "Todos" },
                { value: "green", label: "🟢 Alta demanda" },
                { value: "yellow", label: "🟡 Média" },
                { value: "red", label: "🔴 Sem giro" },
                { value: "gray", label: "⚪ Novo" },
              ]} />
            </div>

            <div className="pt-2 border-t border-white/10">
              <FilterSelect label="Ordenar por" value={sortKey} onChange={(v) => setSortKey(v as SortKey)} options={[
                { value: "name_asc", label: "Nome A-Z" },
                { value: "name_desc", label: "Nome Z-A" },
                { value: "price_asc", label: "Menor preço" },
                { value: "price_desc", label: "Maior preço" },
                { value: "stock_desc", label: "Mais estoque" },
                { value: "stock_asc", label: "Menos estoque" },
                { value: "tier", label: "Por giro" },
              ]} />
            </div>

            <div className="flex gap-2 pt-2">
              {activeFilters > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1 text-xs h-10 bg-transparent border-white/15 text-[#EAE7DF] hover:bg-white/10 hover:text-white"
                  onClick={clearFilters}
                >
                  <X className="w-3.5 h-3.5" /> Limpar filtros
                </Button>
              )}
              <Button
                size="sm"
                className="flex-1 text-xs h-10 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => setFiltersOpen(false)}
              >
                Ver {stats.total} resultado{stats.total === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Quick actions row */}
      <div className="fade-in flex flex-wrap gap-2">
        <Button size="sm" className="gap-1.5 text-xs h-9" onClick={() => navigate("/products/new")}>
          <PackagePlus className="w-3.5 h-3.5" /> Novo produto
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-9" onClick={() => navigate("/compras/nova")}>
          <PackagePlus className="w-3.5 h-3.5 text-emerald-600" /> Registrar compra
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-9" onClick={() => navigate("/pedidos")}>
          <ShoppingCart className="w-3.5 h-3.5 text-primary" /> Encomenda
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs h-9" onClick={exportCsv}>
          <Download className="w-3.5 h-3.5" /> CSV
        </Button>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="sticky top-14 lg:top-2 z-30 fade-in flex flex-wrap items-center gap-2 bg-primary/10 border border-primary/40 rounded-2xl px-3 py-2">
          <span className="text-xs font-semibold text-primary">
            {selected.size} selecionado(s)
          </span>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => runAiOnSelected("photo")}>
            <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Fotos IA
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => runAiOnSelected("notes")}>
            <Sparkles className="w-3.5 h-3.5 text-blue-500" /> Notas IA
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs text-red-600" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="w-3.5 h-3.5" /> Excluir
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => setSelected(new Set())}>
            <X className="w-3.5 h-3.5" /> Limpar
          </Button>
        </div>
      )}

      {/* List */}
      {view === "grid" ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((p) => {
            const cur = Number(p.current_ml);
            const isOut = cur <= 0;
            const isLow = !isOut && cur < ML_PER_FRASCO * 2;
            return (
              <div key={p.id} className={cn(
                "group relative bg-card rounded-2xl border overflow-hidden",
                selected.has(p.id) ? "border-primary ring-2 ring-primary/30" : "border-border/60",
              )}>
                <button onClick={() => toggleOne(p.id)}
                  className="absolute top-2 left-2 z-10 bg-background/80 backdrop-blur rounded-md p-1">
                  <Checkbox checked={selected.has(p.id)} />
                </button>
                <button onClick={() => navigate(`/products/${p.id}`)} className="block w-full text-left">
                  <div className="aspect-square bg-secondary flex items-center justify-center overflow-hidden">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-4xl font-bold text-muted-foreground/20">
                        {p.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="p-2.5 space-y-1">
                    <p className="text-xs font-semibold text-foreground line-clamp-2">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{p.brand || "Sem marca"}</p>
                    <div className="flex items-center justify-between">
                      <span className={cn("text-[10px] font-semibold",
                        isOut ? "text-red-600" : isLow ? "text-amber-600" : "text-emerald-600")}>
                        {formatFrascos(cur)} fr
                      </span>
                      <ClassificationDot c={classifications.get(p.id)} />
                    </div>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
          {/* Desktop table */}
          <table className="hidden lg:table w-full text-sm">
            <thead className="bg-secondary/60 text-muted-foreground text-xs">
              <tr className="text-left">
                <th className="py-2.5 px-3 w-10">
                  <Checkbox
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    onCheckedChange={toggleAll}
                  />
                </th>
                <th className="py-2.5 px-3 w-14">Foto</th>
                <th className="py-2.5 px-3 w-12">Giro</th>
                <th className="py-2.5 px-3 font-medium">Nome</th>
                <th className="py-2.5 px-3 font-medium">Marca</th>
                <th className="py-2.5 px-3 font-medium">Família</th>
                <th className="py-2.5 px-3 font-medium">Gênero</th>
                <th className="py-2.5 px-3 text-right font-medium">Frascos</th>
                <th className="py-2.5 px-3 text-right font-medium">Custo</th>
                <th className="py-2.5 px-3 text-right font-medium">Venda</th>
                <th className="py-2.5 px-3 text-right font-medium">Lucro</th>
                <th className="py-2.5 px-3 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const cur = Number(p.current_ml);
                const isOut = cur <= 0;
                const isLow = !isOut && cur < ML_PER_FRASCO * 2;
                const cost = perFrasco(p.cost_per_ml);
                const sale = priceFrascoRounded(p.sale_price_per_ml);
                return (
                  <tr key={p.id} className={cn(
                    "border-t border-border/50 transition-colors",
                    selected.has(p.id) ? "bg-primary/5" : "hover:bg-secondary/40"
                  )}>
                    <td className="py-2 px-3">
                      <Checkbox
                        checked={selected.has(p.id)}
                        onCheckedChange={() => toggleOne(p.id)}
                      />
                    </td>
                    <td className="py-2 px-3">
                      <div className="w-10 h-10 rounded-lg bg-secondary overflow-hidden flex items-center justify-center">
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs font-bold text-muted-foreground/40">
                            {p.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <ClassificationDot c={classifications.get(p.id)} />
                    </td>
                    <td className="py-2 px-3 font-medium text-foreground">{p.name}</td>
                    <td className="py-2 px-3 text-muted-foreground">{p.brand || "—"}</td>
                    <td className="py-2 px-3 text-muted-foreground text-xs">{p.olfactory_family || "—"}</td>
                    <td className="py-2 px-3 text-muted-foreground text-xs">{p.gender || "—"}</td>
                    <td className="py-2 px-3 text-right">
                      <span className={cn("font-medium",
                        isOut ? "text-red-600" : isLow ? "text-amber-600" : "text-foreground")}>
                        {formatFrascos(cur)}
                      </span>
                      {isOut && <span className="ml-1 text-[10px] text-red-600">esgotado</span>}
                    </td>
                    <td className="py-2 px-3 text-right text-muted-foreground">R$ {cost.toFixed(0)}</td>
                    <td className="py-2 px-3 text-right text-foreground">R$ {sale.toFixed(0)}</td>
                    <td className="py-2 px-3 text-right text-emerald-600 font-medium">R$ {(sale - cost).toFixed(0)}</td>
                    <td className="py-2 px-3 text-right">
                      <Button size="sm" variant="ghost" className="h-7 px-2"
                        onClick={() => navigate(`/products/${p.id}`)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Mobile rows */}
          <ul className="lg:hidden divide-y divide-border/50">
            {filtered.map((p) => {
              const cur = Number(p.current_ml);
              const isOut = cur <= 0;
              const isLow = !isOut && cur < ML_PER_FRASCO * 2;
              const sale = priceFrascoRounded(p.sale_price_per_ml);
              return (
                <li key={p.id} className={cn(
                  "flex items-center gap-3 p-3",
                  selected.has(p.id) && "bg-primary/5"
                )}>
                  <Checkbox
                    checked={selected.has(p.id)}
                    onCheckedChange={() => toggleOne(p.id)}
                  />
                  <button onClick={() => navigate(`/products/${p.id}`)}
                    className="flex-1 flex items-center gap-3 text-left">
                    <div className="w-12 h-12 rounded-lg bg-secondary overflow-hidden flex-shrink-0 flex items-center justify-center">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-base font-bold text-muted-foreground/40">
                          {p.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <ClassificationDot c={classifications.get(p.id)} />
                        <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {p.brand || "Sem marca"}
                        {p.olfactory_family ? ` · ${p.olfactory_family}` : ""}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={cn("text-[11px] font-semibold",
                          isOut ? "text-red-600" : isLow ? "text-amber-600" : "text-emerald-600")}>
                          {formatFrascos(cur)} fr
                        </span>
                        <span className="text-[11px] text-primary font-semibold">R$ {sale.toFixed(0)}</span>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-12 space-y-2">
          <Eye className="w-8 h-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Nenhum produto encontrado com esses filtros.</p>
          {(activeFilters > 0 || search) && (
            <Button variant="outline" size="sm" onClick={() => { clearFilters(); setSearch(""); }}>
              Limpar busca e filtros
            </Button>
          )}
        </div>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {selected.size} produto(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. As vendas e movimentações já registradas serão mantidas,
              mas os produtos serão removidos do catálogo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteSelected} className="bg-red-600 hover:bg-red-700">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({
  label, value, accent,
}: { label: string; value: string; accent?: "emerald" | "amber" | "slate" }) {
  const color =
    accent === "emerald" ? "text-emerald-600"
      : accent === "amber" ? "text-amber-600"
      : accent === "slate" ? "text-slate-500"
      : "text-foreground";
  return (
    <div className="bg-card border border-border/60 rounded-2xl p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-bold mt-0.5", color)}>{value}</p>
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}