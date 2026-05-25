import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Sparkles, Loader2, Wind } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { ML_PER_FRASCO, formatFrascos, perFrasco } from "@/lib/frascos";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

type RunMode = "photos" | "notes" | null;

export default function Products() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const [runMode, setRunMode] = useState<RunMode>(null);
  const [progress, setProgress] = useState({
    done: 0,
    total: 0,
    ok: 0,
    failed: [] as string[],
  });

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const filtered = products?.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.brand && p.brand.toLowerCase().includes(search.toLowerCase()))
  );

  const runPhotos = async () => {
    if (!products?.length || !user) return;
    setRunMode("photos");
    setProgress({ done: 0, total: products.length, ok: 0, failed: [] });
    for (const p of products) {
      try {
        const { data, error } = await supabase.functions.invoke("fetch-perfume-image", {
          body: { productId: p.id, name: p.name, brand: p.brand, userId: user.id },
        });
        if (error || !data?.ok) {
          setProgress((s) => ({ ...s, done: s.done + 1, failed: [...s.failed, p.name] }));
        } else {
          setProgress((s) => ({ ...s, done: s.done + 1, ok: s.ok + 1 }));
        }
      } catch {
        setProgress((s) => ({ ...s, done: s.done + 1, failed: [...s.failed, p.name] }));
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    await queryClient.invalidateQueries({ queryKey: ["products"] });
    toast.success("Fotos atualizadas!");
  };

  const runNotes = async () => {
    if (!products?.length || !user) return;
    setRunMode("notes");
    setProgress({ done: 0, total: products.length, ok: 0, failed: [] });
    for (const p of products) {
      try {
        const { data, error } = await supabase.functions.invoke("fetch-perfume-details", {
          body: { productId: p.id, name: p.name, userId: user.id },
        });
        if (error || !data?.ok) {
          setProgress((s) => ({ ...s, done: s.done + 1, failed: [...s.failed, p.name] }));
        } else {
          setProgress((s) => ({ ...s, done: s.done + 1, ok: s.ok + 1 }));
        }
      } catch {
        setProgress((s) => ({ ...s, done: s.done + 1, failed: [...s.failed, p.name] }));
      }
      await new Promise((r) => setTimeout(r, 600));
    }
    await queryClient.invalidateQueries({ queryKey: ["products"] });
    toast.success("Notas e marcas atualizadas!");
  };

  const isRunning = runMode !== null;
  const isDone = progress.done >= progress.total && progress.total > 0;

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-24">
      <div className="fade-in pt-2 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Produtos</h1>
          <p className="text-xs text-muted-foreground">{products?.length ?? 0} itens no catálogo</p>
        </div>
        <Button size="sm" onClick={() => navigate("/products/new")} className="gap-1.5 text-xs h-8">
          <Plus className="w-3.5 h-3.5" /> Novo
        </Button>
      </div>

      <div className="fade-in flex gap-2">
        <Button variant="outline" size="sm" onClick={runPhotos} disabled={isRunning} className="flex-1 gap-1.5 text-xs h-9">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Fotos IA
        </Button>
        <Button variant="outline" size="sm" onClick={runNotes} disabled={isRunning} className="flex-1 gap-1.5 text-xs h-9">
          <Wind className="w-3.5 h-3.5 text-blue-500" /> Notas + Marca IA
        </Button>
      </div>

      <div className="fade-in relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou marca..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-secondary border-border rounded-xl text-sm h-9"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {filtered?.map((product) => {
          const current = Number(product.current_ml);
          const total = Number(product.total_ml) || ML_PER_FRASCO * 5;
          const frascos = current / ML_PER_FRASCO;
          const isLow = frascos < 2;
          const isEmpty = current <= 0;
          const pct = Math.max(0, Math.min(100, (current / total) * 100));

          const statusLabel = isEmpty ? "Esgotado" : isLow ? "Baixo" : null;
          const statusColor = isEmpty
            ? "bg-red-100 text-red-600"
            : "bg-amber-100 text-amber-600";
          const barColor = isEmpty ? "bg-red-400" : isLow ? "bg-amber-400" : "bg-emerald-500";

          return (
            <button
              key={product.id}
              onClick={() => navigate(`/products/${product.id}`)}
              className={`text-left flex flex-col bg-card rounded-2xl border overflow-hidden transition-all hover:shadow-md active:scale-95 ${
                isEmpty ? "border-red-200" : isLow ? "border-amber-200" : "border-border/60"
              }`}
            >
              <div className="w-full aspect-square bg-secondary flex items-center justify-center overflow-hidden relative">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-4xl font-bold text-muted-foreground/20">
                    {product.name.charAt(0).toUpperCase()}
                  </span>
                )}
                {product.gender && (
                  <span className="absolute top-1.5 left-1.5 text-[9px] font-bold bg-black/40 text-white px-1.5 py-0.5 rounded-full backdrop-blur-sm">
                    {product.gender}
                  </span>
                )}
              </div>

              <div className="p-2.5 flex flex-col gap-1.5">
                <div className="flex items-start justify-between gap-1">
                  <p className="text-xs font-semibold text-foreground leading-tight line-clamp-2 flex-1">
                    {product.name}
                  </p>
                  {statusLabel && (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${statusColor}`}>
                      {statusLabel}
                    </span>
                  )}
                </div>

                <p className="text-[10px] text-muted-foreground truncate">
                  {product.brand || "Sem marca"}
                  {product.concentration ? ` · ${product.concentration}` : ""}
                </p>

                {(() => {
                  const notes = product.fragrance_notes as { top?: string[] } | null;
                  const topNote = notes?.top?.[0];
                  return topNote ? (
                    <p className="text-[10px] text-blue-500 truncate">🌿 {topNote}</p>
                  ) : null;
                })()}

                <div className="space-y-0.5">
                  <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {formatFrascos(current)} {frascos === 1 ? "frasco" : "frascos"}
                  </p>
                </div>

                <p className="text-xs font-bold text-primary">
                  R$ {perFrasco(product.sale_price_per_ml).toFixed(2)}/fr
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {filtered?.length === 0 && (
        <div className="text-center py-12 space-y-2">
          <p className="text-3xl">🔍</p>
          <p className="text-sm text-muted-foreground">Nenhum produto encontrado.</p>
        </div>
      )}

      <Dialog
        open={isRunning}
        onOpenChange={(o) => {
          if (!o && isDone) setRunMode(null);
        }}
      >
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {!isDone ? (
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              ) : runMode === "photos" ? (
                <Sparkles className="w-4 h-4 text-amber-500" />
              ) : (
                <Wind className="w-4 h-4 text-blue-500" />
              )}
              {runMode === "photos" ? "Atualizando fotos" : "Buscando notas e marcas"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <Progress
              value={
                progress.total > 0
                  ? (progress.done / progress.total) * 100
                  : 0
              }
              className="h-2"
            />
            <p className="text-sm text-muted-foreground text-center">
              {progress.done} de {progress.total} •{" "}
              <span className="text-emerald-600 font-medium">
                {progress.ok} {runMode === "photos" ? "atualizadas" : "encontradas"}
              </span>
            </p>
            {isDone && (
              <>
                {progress.failed.length > 0 && (
                  <div className="text-xs text-muted-foreground bg-secondary rounded-xl p-3">
                    <p className="font-semibold mb-1">
                      Não encontrados ({progress.failed.length}):
                    </p>
                    <ul className="space-y-0.5">
                      {progress.failed.map((n, i) => (
                        <li key={i}>• {n}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <Button
                  className="w-full"
                  onClick={() => setRunMode(null)}
                >
                  Fechar
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
