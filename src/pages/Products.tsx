import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { ML_PER_FRASCO, formatFrascos, perFrasco } from "@/lib/frascos";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

export default function Products() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
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

  const refreshAllPhotos = async () => {
    if (!products || products.length === 0 || !user) return;
    setRunning(true);
    setProgress({ done: 0, total: products.length, ok: 0, failed: [] });
    for (const p of products) {
      try {
        const { data, error } = await supabase.functions.invoke(
          "fetch-perfume-image",
          { body: { productId: p.id, name: p.name, brand: p.brand, userId: user.id } }
        );
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
    toast.success("Atualização de fotos concluída");
  };

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-24">
      <div className="fade-in flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Produtos</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {products?.length ?? 0} itens no catálogo
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={refreshAllPhotos}
            className="gap-1.5 text-xs"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Fotos IA
          </Button>
          <Button
            size="sm"
            onClick={() => navigate("/products/new")}
            className="gap-1.5 text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            Novo
          </Button>
        </div>
      </div>

      <div className="fade-in relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou marca..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-secondary border-border rounded-xl"
        />
      </div>

      <div className="space-y-2">
        {filtered?.map((product, i) => {
          const current = Number(product.current_ml);
          const total = Number(product.total_ml) || ML_PER_FRASCO * 5;
          const frascos = current / ML_PER_FRASCO;
          const isLow = frascos < 2;
          const isEmpty = current <= 0;
          const pct = Math.max(0, Math.min(100, (current / total) * 100));

          const barColor = isEmpty
            ? "bg-red-400"
            : isLow
            ? "bg-amber-400"
            : "bg-emerald-500";

          const badge = isEmpty ? (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600">
              Esgotado
            </span>
          ) : isLow ? (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-600">
              Baixo
            </span>
          ) : null;

          return (
            <button
              key={product.id}
              onClick={() => navigate(`/products/${product.id}`)}
              className={`fade-in fade-in-delay-${Math.min(i + 1, 4)} hover-lift w-full flex items-center gap-3 bg-card border rounded-2xl p-3 transition-colors text-left ${
                isLow
                  ? "border-amber-300/60 hover:border-amber-400/80"
                  : "border-border/60 hover:border-primary/50"
              }`}
            >
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-14 h-14 rounded-xl object-cover flex-shrink-0 bg-secondary"
                />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0">
                  <span className="text-xl font-bold text-primary">
                    {product.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {product.name}
                  </p>
                  {badge}
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  {product.brand || "Sem marca"}
                </p>

                <div className="space-y-1">
                  <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${barColor}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      {formatFrascos(current)}{" "}
                      {frascos === 1 ? "frasco" : "frascos"}
                    </span>
                    <span className="text-[10px] font-semibold text-primary">
                      R$ {perFrasco(product.sale_price_per_ml).toFixed(2)}/fr
                    </span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}

        {filtered?.length === 0 && (
          <div className="fade-in text-center py-16 space-y-2">
            <p className="text-3xl">🔍</p>
            <p className="text-sm text-muted-foreground">
              Nenhum produto encontrado.
            </p>
          </div>
        )}
      </div>

      <Dialog
        open={running}
        onOpenChange={(o) => {
          if (!o && progress.done >= progress.total) setRunning(false);
        }}
      >
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {progress.done < progress.total ? (
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              ) : (
                <Sparkles className="w-4 h-4 text-primary" />
              )}
              Atualizando fotos
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
                {progress.ok} atualizadas
              </span>
            </p>
            {progress.done >= progress.total && (
              <>
                {progress.failed.length > 0 && (
                  <div className="text-xs text-muted-foreground bg-secondary rounded-xl p-3">
                    <p className="font-semibold mb-1">
                      Não encontradas ({progress.failed.length}):
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
                  onClick={() => setRunning(false)}
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
