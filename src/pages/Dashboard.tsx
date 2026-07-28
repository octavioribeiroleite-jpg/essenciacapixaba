import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  Package, Droplets, TrendingUp, AlertTriangle, ArrowRight,
  DollarSign, ShoppingBag, Wallet, Droplet, Boxes, Users, Activity,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { ML_PER_FRASCO, formatFrascos, perFrasco, priceFrascoRounded } from "@/lib/frascos";
import { isSellerCoreReady, sellerDb } from "@/integrations/supabase/sellerDb";

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

  const { data: coreReady } = useQuery({
    queryKey: ["seller-core-ready"],
    queryFn: async () => isSellerCoreReady(),
    enabled: !!user,
    staleTime: 60_000,
  });

  const { data: coreStats } = useQuery({
    queryKey: ["dashboard-core-stats"],
    enabled: !!user && !!coreReady,
    queryFn: async () => {
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const [sales, stock, commissions, customersCount, movements] = await Promise.all([
        sellerDb.from("sales_v2").select("id,total_amount,total_cost,total_commission,created_at,status,seller_id"),
        sellerDb.from("v_available_stock").select("*"),
        sellerDb.from("v_seller_commission").select("*"),
        sellerDb.from("customers").select("id", { count: "exact", head: true }),
        sellerDb.from("inventory_movements").select("id,created_at,kind,quantity,variant_id,location_id,note").order("created_at", { ascending: false }).limit(6),
      ]);
      const salesRows = (sales.data ?? []).filter((s: any) => s.status === "confirmed");
      const monthSales = salesRows.filter((s: any) => new Date(s.created_at) >= start);
      const daySales = salesRows.filter((s: any) => new Date(s.created_at) >= dayStart);
      const stockRows = (stock.data ?? []) as Array<{ balance: number; available?: number }>;
      const commissionRows = (commissions.data ?? []) as Array<{ total_due: number }>;
      const monthRevenue = monthSales.reduce((sum: number, s: any) => sum + Number(s.total_amount || 0), 0);
      const monthProfit = monthSales.reduce(
        (sum: number, s: any) => sum + (Number(s.total_amount || 0) - Number(s.total_cost || 0)),
        0,
      );
      const dayRevenue = daySales.reduce((sum: number, s: any) => sum + Number(s.total_amount || 0), 0);
      return {
        stockUnits: stockRows.reduce((sum, r) => sum + Number(r.balance || 0), 0),
        stockAvailable: stockRows.reduce((sum, r) => sum + Number(r.available ?? r.balance ?? 0), 0),
        lowStock: stockRows.filter((r) => Number(r.available ?? r.balance ?? 0) <= 3).length,
        salesDayCount: daySales.length,
        salesDayValue: dayRevenue,
        salesMonthCount: monthSales.length,
        salesMonthValue: monthRevenue,
        monthProfit,
        pendingCommission: commissionRows.reduce((sum, r) => sum + Number(r.total_due || 0), 0),
        customersCount: customersCount.count ?? 0,
        recentMovements: movements.data ?? [],
      };
    },
    staleTime: 30_000,
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

  const brl = (n: number) =>
    n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const stats = [
    {
      label: "Produtos",
      value: String(totalProducts),
      sub: "cadastrados",
      icon: Package,
      iconClass: "bg-[#F4EFE3] text-[#8A6D2E]",
    },
    {
      label: "Estoque",
      value: frascoLabel,
      sub: totalFrascos === 1 ? "frasco" : "frascos",
      icon: Droplets,
      iconClass: "bg-[#EFF1F4] text-[#5A6B7A]",
    },
    {
      label: "Receita",
      value: `R$\u00A0${brl(monthRevenue)}`,
      sub: "este mês",
      icon: DollarSign,
      iconClass: "bg-[#ECF1EC] text-[#4F6B52]",
    },
    {
      label: "Lucro",
      value: `R$\u00A0${brl(monthProfit)}`,
      sub: "este mês",
      icon: TrendingUp,
      iconClass: "bg-[#F0EDE6] text-[#8A6D2E]",
    },
  ];

  return (
    <div className="p-4 lg:p-0 space-y-4 max-w-lg lg:max-w-7xl mx-auto pb-24 lg:pb-8">
      {/* Header premium escuro — identidade da marca */}
      <div
        className="fade-in relative overflow-hidden rounded-3xl p-5 lg:p-6 shadow-[0_8px_30px_rgba(17,17,17,0.08)]"
        style={{ background: "#111111" }}
      >
        <div
          className="absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-[0.07] blur-3xl"
          style={{ background: "#C8A45D" }}
        />
        <div className="relative flex items-center gap-4">
          <div
            className="h-14 w-14 rounded-2xl flex items-center justify-center shrink-0"
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.18)",
            }}
          >
            <Droplet className="w-6 h-6" style={{ color: "#C8A45D" }} strokeWidth={1.5} />
          </div>
          <div className="min-w-0">
            <p
              className="text-[11px] capitalize tracking-wide"
              style={{ color: "#D8C7A3" }}
            >
              {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </p>
            <h1
              className="mt-0.5 leading-tight text-xl lg:text-2xl font-semibold tracking-tight"
              style={{ color: "#FFFFFF" }}
            >
              Essência Capixaba
            </h1>
            <p className="text-xs mt-1" style={{ color: "#D8C7A3" }}>
              Gestão de perfumes, estoque e vendas.
            </p>
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
              className="fade-in rounded-2xl p-3.5 flex flex-col gap-2 hover-lift transition-shadow"
              style={{ background: "#FFFFFF", border: "1px solid #EAE7DF" }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: "#716B63" }}
                >
                  {stat.label}
                </span>
                <div className={`h-8 w-8 rounded-xl flex items-center justify-center ${stat.iconClass}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <p
                className={`font-semibold leading-tight ${isMoney ? "text-base" : "text-2xl"}`}
                style={{ color: "#2A2621" }}
              >
                {stat.value}
              </p>
              {stat.sub && (
                <p className="text-[11px]" style={{ color: "#716B63" }}>{stat.sub}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => navigate("/products")}
          className="fade-in hover-lift rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50 p-3 flex flex-col items-center justify-center gap-1.5 text-center hover:border-amber-400 transition-all"
        >
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center shadow-sm">
            <Boxes className="w-4 h-4 text-white" strokeWidth={2.2} />
          </div>
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
                  +R$ {brl(Number(sale.sale_price))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {coreReady && coreStats && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Consignação e vendedores
            </h2>
            <button
              onClick={() => navigate("/vendedores")}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Abrir <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <div className="rounded-2xl border border-border/60 bg-card p-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Vendas do dia</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {coreStats.salesDayCount} · {brl(coreStats.salesDayValue)}
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card p-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Vendas do mês</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {coreStats.salesMonthCount} · {brl(coreStats.salesMonthValue)}
              </p>
              <p className="text-[11px] text-muted-foreground">Lucro {brl(coreStats.monthProfit)}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-card p-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Comissão pendente</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{brl(coreStats.pendingCommission)}</p>
              <p className="text-[11px] text-muted-foreground">{coreStats.customersCount} clientes</p>
            </div>
            <div className={`rounded-2xl border p-3.5 ${coreStats.lowStock > 0 ? "border-amber-500/40 bg-amber-500/5" : "border-border/60 bg-card"}`}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Estoque v2</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {coreStats.stockAvailable} un
              </p>
              <p className="text-[11px] text-muted-foreground">
                {coreStats.lowStock > 0 ? `${coreStats.lowStock} em baixo` : "Sem baixo estoque"}
              </p>
            </div>
          </div>
          {coreStats.recentMovements.length > 0 && (
            <div className="rounded-2xl border border-border/60 bg-card p-4">
              <p className="text-xs font-semibold text-foreground flex items-center gap-2 mb-2">
                <Activity className="w-3.5 h-3.5 text-primary" />
                Últimas movimentações
              </p>
              <ul className="space-y-1 text-xs">
                {coreStats.recentMovements.map((m: any) => (
                  <li key={m.id} className="flex justify-between border-t border-border/40 py-1.5">
                    <span className="truncate">
                      {format(new Date(m.created_at), "dd/MM HH:mm", { locale: ptBR })} · {m.kind}
                    </span>
                    <span className={Number(m.quantity) < 0 ? "text-destructive font-medium" : "text-emerald-600 font-medium"}>
                      {Number(m.quantity) > 0 ? `+${m.quantity}` : m.quantity}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* atalhos movidos para o topo */}
    </div>
  );
}
