import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { ML_PER_FRASCO, formatFrascos, perFrasco } from "@/lib/frascos";

export default function Products() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Produtos</h1>
        <Button size="sm" onClick={() => navigate("/products/new")}>
          <Plus className="h-4 w-4 mr-1" /> Novo
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar perfume..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 bg-secondary border-border"
        />
      </div>

      <div className="space-y-2 fade-in">
        {filtered?.map((product) => {
          const current = Number(product.current_ml);
          const frascos = current / ML_PER_FRASCO;
          const isLow = frascos < 2;
          // barra: cheia se >= 5 frascos
          const pct = Math.max(0, Math.min(100, (frascos / 5) * 100));
          return (
            <button
              key={product.id}
              onClick={() => navigate(`/products/${product.id}`)}
              className="w-full flex items-center gap-3 bg-card border border-border/60 hover:border-primary/50 rounded-2xl p-3 transition-colors text-left"
            >
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="h-14 w-14 rounded-xl object-cover shrink-0"
                />
              ) : (
                <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center shrink-0">
                  <span className="text-lg font-bold text-primary">
                    {product.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{product.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">{product.brand || "Sem marca"}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={cn(
                        "h-full transition-all",
                        isLow ? "bg-warning" : "bg-primary",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className={cn(
                    "text-[11px] font-medium shrink-0",
                    isLow ? "text-warning" : "text-muted-foreground",
                  )}>
                    {formatFrascos(current)} {frascos === 1 ? "frasco" : "frascos"}
                  </span>
                </div>
              </div>

              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-primary">
                  R$ {perFrasco(product.sale_price_per_ml).toFixed(2)}
                </p>
                <p className="text-[10px] text-muted-foreground">/frasco</p>
              </div>
            </button>
          );
        })}
        {filtered?.length === 0 && (
          <div className="text-center py-10">
            <div className="text-3xl mb-2">🔍</div>
            <p className="text-sm text-muted-foreground">Nenhum produto encontrado.</p>
          </div>
        )}
      </div>
    </div>
  );
}
