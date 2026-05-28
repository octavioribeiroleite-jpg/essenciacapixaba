import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  Package, Droplets, TrendingUp, AlertTriangle, ArrowRight,
  DollarSign, ShoppingBag, Sunrise, Sun, Moon, Wallet,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { ML_PER_FRASCO, formatFrascos, perFrasco, priceFrascoRounded } from "@/lib/frascos";

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
        .select("*, products(name, brand, image_url)")
        .gte("created_at", startOfMonth.toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const totalProducts = products?.length ?? 0;
  const totalFrascos =
    products?.reduce((sum, p) => sum + Number(p.current_ml) / ML_PER_FRASCO, 0) ?? 0;
  const patrimonioInvestido =
    products?.reduce(
      (sum, p) => sum + perFrasco(p.cost_per_ml) * (Number(p.current_ml) / ML_PER_FRASCO),
      0,
    ) ?? 0;
  const patrimonioPotencial =
    products?.reduce(
      (sum, p) =>
        sum + priceFrascoRounded(p.sale_price_per_ml) * (Number(p.current_ml) / ML_PER_FRASCO),
      0,
    ) ?? 0;
  const lowStock =
    products?.filter((p) => Number(p.current_ml) < ML_PER_FRASCO * 2) ?? [];
  const emptyStock = lowStock.filter((p) => Number(p.current_ml) === 0);
  const monthRevenue =
    salesThisMonth?.reduce((sum, s) => sum + Number(s.sale_price), 0) ?? 0;
  // Lucro só é contado quando o pagamento é efetivamente recebido.
  // Para vendas parciais (50/50), o lucro é proporcional ao valor já pago.
  const monthProfit =
    salesThisMonth?.reduce((sum, s: any) => {
      const price = Number(s.sale_price);
      const profit = price - Number(s.cost_price);
      if (price <= 0) return sum;
      const status = s.payment_status || "paid";
      if (status === "paid") return sum + profit;
      const paid = Number(s.amount_paid || 0);
      return sum + profit * (paid / price);
    }, 0) ?? 0;
  const recentSales = salesThisMonth?.slice(0, 5) ?? [];
  const frascoLabel = Number.isInteger(totalFrascos)
    ? `${totalFrascos}`
    : totalFrascos.toFixed(1);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const GreetingIcon = hour < 12 ? Sunrise : hour < 18 ? Sun : Moon;

  const stats = [
    {
      label: "Produtos",
      value: String(totalProducts),
      sub: "cadastrados",
      icon: Package,
      gradient: "from-amber-400 to-orange-500",
    },
    {
      label: "Estoque",
      value: frascoLabel,
      sub: totalFrascos === 1 ? "frasco" : "frascos",
      icon: Droplets,
      gradient: "from-sky-400 to-blue-500",
    },
    {
      label: "Receita",
      value: `R$\u00A0${monthRevenue.toFixed(2)}`,
      sub: "este mês",
      icon: DollarSign,
      gradient: "from-emerald-400 to-green-500",
    },
    {
      label: "Lucro",
      value: `R$\u00A0${monthProfit.toFixed(2)}`,
      sub: "este mês",
      icon: TrendingUp,
      gradient: "from-violet-400 to-purple-500",
    },
  ];

  return (
    <div className="p-4 lg:p-0 space-y-4 max-w-lg lg:max-w-7xl mx-auto pb-24 lg:pb-8">
      {/* Header com gradiente */}
      <div className="fade-in relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary/90 to-amber-400 p-5 text-white shadow-lg">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/25 flex items-center justify-center shadow-inner shrink-0">
            <GreetingIcon className="w-7 h-7 text-white" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] text-white/80 capitalize">
              {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </p>
            <h1 className="text-2xl font-bold mt-0.5 leading-tight">{greeting}</h1>
            <p className="text-xs text-white/85 mt-0.5">Aqui está o resumo do seu negócio</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 lg:gap-4">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          const isMoney = stat.value.startsWith("R$");
          return (
            <div
              key={i}
              className="fade-in bg-card rounded-2xl border border-border/60 p-3.5 flex flex-col gap-2 hover-lift transition-shadow"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {stat.label}
                </span>
                <div className={`h-8 w-8 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center shadow-sm`}>
                  <Icon className="w-4 h-4 text-white" />
                </div>
              </div>
              <p className={`font-bold text-foreground leading-tight ${isMoney ? "text-base" : "text-2xl"}`}>
                {stat.value}
              </p>
              {stat.sub && (
                <p className="text-[11px] text-muted-foreground">{stat.sub}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => navigate("/products")}
          className="fade-in hover-lift rounded-2xl border border-border/60 bg-card p-3 flex flex-col items-center justify-center gap-1.5 text-center hover:border-primary/50 transition-all"
        >
          <span className="text-xl">🧴</span>
          <p className="text-[11px] font-semibold text-foreground leading-tight">Meu estoque</p>
        </button>
        <button
          onClick={() => navigate("/patrimonio")}
          className="fade-in hover-lift rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-3 flex flex-col items-center justify-center gap-1.5 text-center hover:border-emerald-400 transition-all"
        >
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
            <Wallet className="w-4 h-4 text-white" />
          </div>
          <p className="text-[11px] font-semibold text-foreground leading-tight">Patrimônio</p>
        </button>
        <button
          onClick={() => navigate("/pedidos")}
          className={`fade-in hover-lift rounded-2xl border p-3 flex flex-col items-center justify-center gap-1.5 text-center transition-all ${
            lowStock.length > 0
              ? "border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 hover:border-amber-400"
              : "border-border/60 bg-card hover:border-primary/50"
          }`}
        >
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-white" />
          </div>
          <p className="text-[11px] font-semibold text-foreground leading-tight">
            Estoque baixo{lowStock.length > 0 && ` (${lowStock.length})`}
          </p>
        </button>
      </div>

      <div className="fade-in rounded-2xl border border-border/60 bg-card p-4 space-y-1">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-emerald-500" />
            <h2 className="text-sm font-semibold text-foreground">Vendas Recentes</h2>
          </div>
          <button
            onClick={() => navigate("/reports")}
            className="text-xs text-primary flex items-center gap-1 hover:underline font-medium"
          >
            Ver tudo <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {recentSales.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-3xl mb-1">📦</p>
            <p className="text-sm text-muted-foreground">Nenhuma venda este mês.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {recentSales.map((sale: any) => (
              <div
                key={sale.id}
                className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0"
              >
                <div className="h-10 w-10 rounded-lg overflow-hidden bg-muted shrink-0 border border-border/50">
                  {sale.products?.image_url ? (
                    <img src={sale.products.image_url} alt={sale.products?.name ?? ""} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-amber-200 text-primary text-sm font-semibold">
                      {sale.products?.name?.charAt(0)?.toUpperCase() ?? "?"}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {sale.products?.name ?? "—"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {format(new Date(sale.created_at), "dd/MM HH:mm", {
                      locale: ptBR,
                    })}{" "}
                    · -{formatFrascos(sale.ml_sold)} frasco(s)
                  </p>
                </div>
                <span className="text-sm font-semibold text-emerald-600 shrink-0">
                  +R$ {Number(sale.sale_price).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* atalhos movidos para o topo */}
    </div>
  );
}
