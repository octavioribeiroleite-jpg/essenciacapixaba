import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Package, Droplets, TrendingUp, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: salesThisMonth } = useQuery({
    queryKey: ["sales-month"],
    queryFn: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("sales")
        .select("*, products(name, brand)")
        .gte("created_at", startOfMonth.toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const totalProducts = products?.length ?? 0;
  const totalMl = products?.reduce((sum, p) => sum + Number(p.current_ml), 0) ?? 0;
  const totalFrascos =
    products?.reduce((sum, p) => {
      const total = Number(p.total_ml) || 0;
      const current = Number(p.current_ml) || 0;
      if (total <= 0) return sum;
      return sum + current / total;
    }, 0) ?? 0;
  const lowStock = products?.filter((p) => Number(p.current_ml) < 10) ?? [];
  const monthRevenue = salesThisMonth?.reduce((sum, s) => sum + Number(s.sale_price), 0) ?? 0;
  const monthProfit = salesThisMonth?.reduce((sum, s) => sum + (Number(s.sale_price) - Number(s.cost_price)), 0) ?? 0;
  const recentSales = salesThisMonth?.slice(0, 5) ?? [];

  const frascoLabel =
    Number.isInteger(totalFrascos) ? `${totalFrascos}` : totalFrascos.toFixed(1);
  const stats = [
    { label: "Produtos", value: String(totalProducts), icon: Package, color: "text-primary" },
    {
      label: "Frascos em Estoque",
      value: frascoLabel,
      sub: `${totalMl.toFixed(0)}ml`,
      icon: Droplets,
      color: "text-primary",
    },
    { label: "Vendas do Mês", value: `R$ ${monthRevenue.toFixed(2)}`, icon: TrendingUp, color: "text-success" },
    { label: "Lucro do Mês", value: `R$ ${monthProfit.toFixed(2)}`, icon: TrendingUp, color: "text-success" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat) => (
          <Card key={stat.label} className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary shrink-0">
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </span>
                <span className="text-xs text-muted-foreground truncate">{stat.label}</span>
              </div>
              <p className="text-lg font-bold text-foreground leading-tight">{stat.value}</p>
              {"sub" in stat && stat.sub && (
                <p className="text-[10px] text-muted-foreground mt-0.5">{stat.sub}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Low Stock Alerts */}
      {lowStock.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Estoque Baixo
          </h2>
          <div className="space-y-2">
            {lowStock.map((p) => (
              <Card
                key={p.id}
                className="glass-card cursor-pointer hover:border-warning/50 transition-colors"
                onClick={() => navigate(`/products/${p.id}`)}
              >
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.brand}</p>
                  </div>
                  <span className="text-sm font-bold text-warning">{Number(p.current_ml).toFixed(0)}ml</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Recent Sales */}
      <div>
        <h2 className="text-sm font-medium text-foreground mb-3">Vendas Recentes</h2>
        {recentSales.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma venda este mês.</p>
        ) : (
          <div className="space-y-2">
            {recentSales.map((sale: any) => (
              <Card key={sale.id} className="glass-card">
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{sale.products?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(sale.created_at), "dd/MM HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-primary">-{Number(sale.ml_sold)}ml</p>
                    <p className="text-xs text-success">R$ {Number(sale.sale_price).toFixed(2)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Catalog */}
      <div>
        <h2 className="text-sm font-medium text-foreground mb-3">Catálogo</h2>
        {!products || products.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum perfume cadastrado.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {products.map((p) => {
              const pricePerMl = Number(p.sale_price_per_ml) || 0;
              const totalMl = Number(p.total_ml) || 0;
              const currentMl = Number(p.current_ml) || 0;
              const frascoPrice = pricePerMl * totalMl;
              return (
                <Card
                  key={p.id}
                  className="glass-card cursor-pointer hover:border-primary/30 transition-colors overflow-hidden"
                  onClick={() => navigate(`/products/${p.id}`)}
                >
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt={p.name}
                      className="h-28 w-full object-cover"
                    />
                  ) : (
                    <div className="h-28 w-full bg-secondary flex items-center justify-center text-3xl">
                      🧴
                    </div>
                  )}
                  <CardContent className="p-3 space-y-1">
                    <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.brand || "Sem marca"}</p>
                    <div className="pt-1 border-t border-border/50 mt-1">
                      <p className="text-xs text-muted-foreground">
                        Decant: <span className="text-foreground font-medium">R$ {pricePerMl.toFixed(2)}/ml</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Frasco {totalMl.toFixed(0)}ml: <span className="text-primary font-semibold">R$ {frascoPrice.toFixed(2)}</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Estoque: {currentMl.toFixed(0)}ml
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
