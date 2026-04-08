import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useState } from "react";
import { cn } from "@/lib/utils";

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

      <div className="space-y-2">
        {filtered?.map((product) => (
          <Card
            key={product.id}
            className="glass-card cursor-pointer hover:border-primary/30 transition-colors"
            onClick={() => navigate(`/products/${product.id}`)}
          >
            <CardContent className="p-3 flex items-center gap-3">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="h-12 w-12 rounded-lg object-cover"
                />
              ) : (
                <div className="h-12 w-12 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground text-lg">
                  🧴
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{product.name}</p>
                <p className="text-xs text-muted-foreground">{product.brand || "Sem marca"}</p>
              </div>
              <div className="text-right">
                <p className={cn(
                  "text-sm font-bold",
                  Number(product.current_ml) < 10 ? "text-warning" : "text-foreground"
                )}>
                  {Number(product.current_ml).toFixed(0)}ml
                </p>
                <p className="text-xs text-muted-foreground">
                  R$ {Number(product.sale_price_per_ml).toFixed(2)}/ml
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered?.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhum produto encontrado.</p>
        )}
      </div>
    </div>
  );
}
