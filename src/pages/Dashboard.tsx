import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Package, Droplets, TrendingUp, AlertTriangle, ArrowRight, DollarSign } from "lucide-react";
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
    {
      label: "Produtos",
      value: String(totalProducts),
      sub: "cadastrados",
      icon: Package,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
    },
    {
      label: "Estoque",
      value: frascoLabel,
      sub: `${totalMl.toFixed(0)}ml total`,
      icon: Droplets,
      iconBg: "bg-sky-500/10",
      iconColor: "text-sky-400",
    },
    {
      label: "Receita",
      value: `R$ ${monthRevenue.toFixed(2)}`,
      sub: "este mês",
      icon: DollarSign,
      iconBg: "bg-emerald-500/10",
      iconColor: "text-emerald-400",
    },
    {
      label: "Lucro",
      value: `R$ ${monthProfit.toFixed(2)}`,
      sub: "este mês",
      icon: TrendingUp,
      iconBg: "bg-success/10",
      iconColor: "text-success",
    },
  ];

  return (
    <div className="space-y-6 fade-in">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
        <p className="text-xs text-muted-foreground capitalize">
          {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat) => (
          <Card key={stat.label} className="glass-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground truncate">{stat.label}</span>
                <span className={`flex h-7 w-7 items-center justify-center rounded-lg shrink-0 ${stat.iconBg}`}>
                  <stat.icon className={`h-3.5 w-3.5 ${stat.iconColor}`} />
                </span>
              </div>
              <p className="text-lg font-bold text-foreground leading-tight">{stat.value}</p>
              {stat.sub && (
                <p className="text-[10px] text-muted-foreground mt-0.5">{stat.sub}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Low Stock Alerts */}
      {lowStock.length > 0 && (
        <div className="rounded-2xl border border-warning/30 bg-warning/5 p-3 space-y-2">
          <h2 className="text-sm font-medium text-warning flex items-center gap-2 px-1">
            <AlertTriangle className="h-4 w-4" />
            Estoque Baixo ({lowStock.length})
          </h2>
          <div className="space-y-1.5">
            {lowStock.map((p) => (
              <button
                key={p.id}
                onClick={() => navigate(`/products/${p.id}`)}
                className="w-full flex items-center justify-between rounded-xl px-3 py-2 hover:bg-warning/10 transition-colors text-left"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{p.brand || "Sem marca"}</p>
                </div>
                <span className="text-sm font-bold text-warning shrink-0">{Number(p.current_ml).toFixed(0)}ml</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recent Sales */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-foreground">Vendas Recentes</h2>
          <button
            onClick={() => navigate("/reports")}
            className="text-xs text-primary flex items-center gap-1 hover:underline"
          >
            Ver tudo <ArrowRight className="h-3 w-3" />
          </button>
        </div>
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
                      {format(new Date(sale.created_at), "dd/MM HH:mm", { locale: ptBR })} · -{Number(sale.ml_sold)}ml
                    </p>
                  </div>
                  <p className="text-sm font-bold text-primary">R$ {Number(sale.sale_price).toFixed(2)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Atalho para o catálogo */}
      <button
        onClick={() => navigate("/products")}
        className="w-full flex items-center justify-between bg-card border border-border/60 rounded-2xl px-4 py-4 hover:border-primary/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">🧴</span>
          <div className="text-left">
            <p className="text-sm font-medium text-foreground">Ver Catálogo</p>
            <p className="text-xs text-muted-foreground">{totalProducts} produtos cadastrados</p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
  );
}
