import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  BarChart3, Trash2, Pencil, ArrowUp, Settings2,
  TrendingUp, DollarSign, Droplets, ShoppingBag, Trophy, Package,
  Clock, CheckCircle2, User, Banknote, CreditCard, SplitSquareHorizontal, Sparkles,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { logMovement } from "@/lib/stockMovements";
import { ML_PER_FRASCO } from "@/lib/frascos";
import { MOVEMENT_LABEL, type MovementType } from "@/lib/stockMovements";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format, subDays, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChargeMessageDialog, type ChargePayload } from "@/components/ChargeMessageDialog";

type Period = "week" | "month" | "all";
type SaleStatusFilter = "all" | "paid" | "pending";

const PERIOD_LABELS: { key: Period; label: string }[] = [
  { key: "week", label: "7 dias" },
  { key: "month", label: "Este mês" },
  { key: "all", label: "Tudo" },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border/60 rounded-xl shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      <p className="text-emerald-600">Receita: R$ {Number(payload[0]?.value ?? 0).toFixed(2)}</p>
      <p className="text-violet-600">Lucro: R$ {Number(payload[1]?.value ?? 0).toFixed(2)}</p>
    </div>
  );
};

export default function Reports() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<Period>("month");
  const [saleStatusFilter, setSaleStatusFilter] = useState<SaleStatusFilter>("all");
  const [editMov, setEditMov] = useState<any | null>(null);
  const [editMovMl, setEditMovMl] = useState("");
  const [editMovNote, setEditMovNote] = useState("");
  const [editSale, setEditSale] = useState<any | null>(null);
  const [editSaleCustomer, setEditSaleCustomer] = useState("");
  const [editSaleMethod, setEditSaleMethod] = useState<"cash" | "card" | "split">("cash");
  const [editSaleStatus, setEditSaleStatus] = useState<"paid" | "pending">("paid");
  const [editSaleDueDate, setEditSaleDueDate] = useState("");
  const [editSaleFirstPaid, setEditSaleFirstPaid] = useState(true);
  const [editSaleSecondPaid, setEditSaleSecondPaid] = useState(true);
  const [editSaleFirstDueDate, setEditSaleFirstDueDate] = useState("");
  const [editSalePrice, setEditSalePrice] = useState("");

  const openEditSale = (sale: any) => {
    setEditSale(sale);
    setEditSaleCustomer(sale.customer_name || "");
    setEditSaleMethod((sale.payment_method as any) || "cash");
    setEditSaleStatus((sale.payment_status as any) || "paid");
    setEditSaleDueDate(sale.due_date || "");
    setEditSaleFirstPaid(sale.first_paid ?? true);
    setEditSaleSecondPaid((sale.payment_status || "paid") === "paid");
    setEditSaleFirstDueDate(sale.first_due_date || "");
    setEditSalePrice(String(sale.sale_price));
  };

  const updateSale = useMutation({
    mutationFn: async () => {
      if (!editSale) throw new Error("Erro");
      const priceNum = parseFloat(editSalePrice);
      if (isNaN(priceNum) || priceNum < 0) throw new Error("Valor inválido");
      const isSplit = editSaleMethod === "split";
      let status: "paid" | "pending";
      let amountPaid: number;
      let firstPaid = true;
      let firstDue: string | null = null;
      let secondDue: string | null = null;
      if (isSplit) {
        const half = Math.round((priceNum / 2) * 100) / 100;
        firstPaid = editSaleFirstPaid;
        const secondPaid = editSaleSecondPaid;
        amountPaid = (firstPaid ? half : 0) + (secondPaid ? priceNum - half : 0);
        status = firstPaid && secondPaid ? "paid" : "pending";
        if (!firstPaid && !editSaleFirstDueDate) throw new Error("Informe a data da 1ª parcela");
        if (!secondPaid && !editSaleDueDate) throw new Error("Informe a data da 2ª parcela");
        firstDue = firstPaid ? null : editSaleFirstDueDate;
        secondDue = secondPaid ? null : editSaleDueDate;
      } else {
        status = editSaleStatus;
        amountPaid = status === "paid" ? priceNum : 0;
        if (status === "pending" && !editSaleDueDate) throw new Error("Informe a data de pagamento");
        secondDue = status === "pending" ? editSaleDueDate : null;
      }
      const amountDue = Math.round((priceNum - amountPaid) * 100) / 100;
      const { error } = await supabase
        .from("sales")
        .update({
          customer_name: editSaleCustomer.trim() || null,
          payment_method: editSaleMethod,
          payment_status: status,
          amount_paid: amountPaid,
          amount_due: amountDue,
          sale_price: priceNum,
          due_date: secondDue,
          first_paid: firstPaid,
          first_due_date: firstDue,
        })
        .eq("id", editSale.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-sales"] });
      queryClient.invalidateQueries({ queryKey: ["pending-sales"] });
      queryClient.invalidateQueries({ queryKey: ["sales-month"] });
      toast.success("Venda atualizada!");
      setEditSale(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const startDate = period === "week"
    ? subDays(new Date(), 7)
    : period === "month"
    ? startOfMonth(new Date())
    : new Date(2020, 0, 1);

  const { data: sales } = useQuery({
    queryKey: ["report-sales", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*, products(name, brand, image_url)")
        .gte("created_at", startDate.toISOString())
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Chart data: group by day
  const chartData = sales?.reduce((acc: any[], sale) => {
    const day = format(new Date(sale.created_at), "dd/MM");
    const existing = acc.find((d) => d.day === day);
    const revenue = Number(sale.sale_price);
    const profit = revenue - Number(sale.cost_price);
    if (existing) {
      existing.receita += revenue;
      existing.lucro += profit;
    } else {
      acc.push({ day, receita: revenue, lucro: profit });
    }
    return acc;
  }, []) ?? [];

  // Top products
  const topProducts = sales?.reduce((acc: Record<string, { name: string; image_url?: string | null; ml: number; revenue: number; qty: number }>, sale: any) => {
    const pid = sale.product_id;
    if (!acc[pid]) {
      acc[pid] = { name: sale.products?.name || "?", image_url: sale.products?.image_url, ml: 0, revenue: 0, qty: 0 };
    }
    acc[pid].ml += Number(sale.ml_sold);
    acc[pid].revenue += Number(sale.sale_price);
    acc[pid].qty += 1;
    return acc;
  }, {} as Record<string, { name: string; image_url?: string | null; ml: number; revenue: number; qty: number }>);

  const topList = topProducts
    ? Object.values(topProducts).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
    : [];

  const totalRevenue = sales?.reduce((s, sale) => s + Number(sale.sale_price), 0) ?? 0;
  const totalProfit = sales?.reduce((s, sale) => s + Number(sale.sale_price) - Number(sale.cost_price), 0) ?? 0;
  const totalMl = sales?.reduce((s, sale) => s + Number(sale.ml_sold), 0) ?? 0;
  const totalSales = sales?.length ?? 0;

  const filteredSales = sales
    ? sales.filter((s: any) =>
        saleStatusFilter === "all" ? true : (s.payment_status || "paid") === saleStatusFilter,
      )
    : [];
  const recentSales = [...filteredSales].reverse().slice(0, 20);
  const paidCount = sales?.filter((s: any) => (s.payment_status || "paid") === "paid").length ?? 0;
  const pendingCount = sales?.filter((s: any) => s.payment_status === "pending").length ?? 0;

  const { data: pendingSales } = useQuery({
    queryKey: ["pending-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*, products(name, image_url)")
        .eq("payment_status", "pending")
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const markPaid = useMutation({
    mutationFn: async (sale: any) => {
      const { error } = await supabase
        .from("sales")
        .update({
          payment_status: "paid",
          amount_paid: Number(sale.sale_price),
          amount_due: 0,
        })
        .eq("id", sale.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-sales"] });
      queryClient.invalidateQueries({ queryKey: ["report-sales"] });
      toast.success("Pagamento confirmado!");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const { data: entries } = useQuery({
    queryKey: ["report-entries", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("*, products(name, brand, current_ml, total_ml)")
        .in("type", ["initial", "restock", "adjustment"])
        .gte("created_at", startDate.toISOString())
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const deleteMovement = useMutation({
    mutationFn: async (mov: any) => {
      if (!user) throw new Error("Não autenticado");
      const { data: prod, error: pErr } = await supabase
        .from("products")
        .select("current_ml")
        .eq("id", mov.product_id)
        .single();
      if (pErr) throw pErr;
      // Reverte o ml_change; impede estoque negativo
      const current = Number(prod.current_ml);
      const change = Number(mov.ml_change);
      const reverted = current - change;
      if (reverted < 0) {
        const faltamFr = Math.ceil((change - current) / ML_PER_FRASCO);
        throw new Error(
          `Não é possível excluir: estoque atual (${current.toFixed(0)}ml) é menor que a entrada (${change.toFixed(0)}ml). Faltam ${faltamFr} frasco(s).`,
        );
      }
      // Arredonda para evitar resíduos de ponto flutuante
      const revertedRounded = Math.round(reverted);
      const { error: uErr } = await supabase
        .from("products")
        .update({ current_ml: revertedRounded })
        .eq("id", mov.product_id);
      if (uErr) throw uErr;
      const { error: dErr } = await supabase
        .from("stock_movements")
        .delete()
        .eq("id", mov.id);
      if (dErr) throw dErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-entries"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product"] });
      queryClient.invalidateQueries({ queryKey: ["product-movements"] });
      toast.success("Entrada excluída e estoque ajustado.");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateMovement = useMutation({
    mutationFn: async () => {
      if (!editMov) throw new Error("Erro");
      const newMl = parseFloat(editMovMl);
      if (isNaN(newMl)) throw new Error("ml inválido");
      if (newMl < 0) throw new Error("ml não pode ser negativo");
      const oldMl = Number(editMov.ml_change);
      const diff = newMl - oldMl;

      const { data: prod, error: pErr } = await supabase
        .from("products")
        .select("current_ml")
        .eq("id", editMov.product_id)
        .single();
      if (pErr) throw pErr;

      const newCurrent = Number(prod.current_ml) + diff;
      if (newCurrent < 0) {
        throw new Error(
          `Ajuste inválido: estoque ficaria negativo (${newCurrent.toFixed(0)}ml). Reduza a alteração.`,
        );
      }
      const newCurrentRounded = Math.round(newCurrent);
      const { error: uErr } = await supabase
        .from("products")
        .update({ current_ml: newCurrentRounded })
        .eq("id", editMov.product_id);
      if (uErr) throw uErr;

      const { error: mErr } = await supabase
        .from("stock_movements")
        .update({
          ml_change: newMl,
          ml_after: Math.max(0, Number(editMov.ml_after) + diff),
          note: editMovNote.trim() || null,
        })
        .eq("id", editMov.id);
      if (mErr) throw mErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-entries"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product"] });
      queryClient.invalidateQueries({ queryKey: ["product-movements"] });
      toast.success("Entrada atualizada.");
      setEditMov(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteSale = useMutation({
    mutationFn: async (sale: any) => {
      if (!user) throw new Error("Não autenticado");
      const { data: product, error: pErr } = await supabase
        .from("products")
        .select("current_ml")
        .eq("id", sale.product_id)
        .single();
      if (pErr) throw pErr;

      const mlSold = Number(sale.ml_sold);
      if (mlSold <= 0) throw new Error("Venda inválida: ml vendidos não positivo.");
      const restored = Math.round(Number(product.current_ml) + mlSold);

      const { error: uErr } = await supabase
        .from("products")
        .update({ current_ml: restored })
        .eq("id", sale.product_id);
      if (uErr) throw uErr;

      const { error: dErr } = await supabase.from("sales").delete().eq("id", sale.id);
      if (dErr) throw dErr;

      // Remove o movimento original de venda para não duplicar histórico
      await supabase
        .from("stock_movements")
        .delete()
        .eq("sale_id", sale.id)
        .eq("type", "sale");

      await logMovement({
        userId: user.id,
        productId: sale.product_id,
        type: "sale_reversal",
        mlChange: mlSold,
        mlAfter: restored,
        note: "Venda excluída — ml retornados",
        saleId: sale.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-sales"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["sales-month"] });
      queryClient.invalidateQueries({ queryKey: ["product-sales"] });
      queryClient.invalidateQueries({ queryKey: ["product-movements"] });
      toast.success("Venda excluída e estoque restaurado.");
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="p-4 lg:p-0 space-y-4 max-w-lg lg:max-w-7xl mx-auto pb-24 lg:pb-8">
      {/* Header */}
      <div className="space-y-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" /> Relatórios
          </h1>
          <p className="text-xs text-muted-foreground">Acompanhe vendas e estoque</p>
        </div>

        {/* Segmented period filter */}
        <div className="inline-flex bg-muted/60 rounded-xl p-1 gap-1">
          {PERIOD_LABELS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all ${
                period === key
                  ? "bg-card shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 lg:gap-4">
        {[
          { label: "Receita", value: `R$ ${totalRevenue.toFixed(2)}`, icon: DollarSign, gradient: "from-emerald-400 to-green-500" },
          { label: "Lucro", value: `R$ ${totalProfit.toFixed(2)}`, icon: TrendingUp, gradient: "from-violet-400 to-purple-500" },
          { label: "ML Vendidos", value: `${totalMl.toFixed(0)}ml`, icon: Droplets, gradient: "from-sky-400 to-blue-500" },
          { label: "Vendas", value: String(totalSales), icon: ShoppingBag, gradient: "from-amber-400 to-orange-500" },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} className="bg-card rounded-2xl border border-border/60 p-3.5 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {s.label}
                </span>
                <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${s.gradient} flex items-center justify-center shadow-sm`}>
                  <Icon className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
              <p className="text-base font-bold text-foreground tabular-nums leading-tight">{s.value}</p>
            </div>
          );
        })}
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="bg-card rounded-2xl border border-border/60 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" /> Vendas por dia
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted))", radius: 8 }} />
              <Bar dataKey="receita" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} name="Receita" />
              <Bar dataKey="lucro" fill="hsl(142 70% 45%)" radius={[8, 8, 0, 0]} name="Lucro" />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-primary" /> Receita
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "hsl(142 70% 45%)" }} /> Lucro
            </span>
          </div>
        </div>
      )}

      {/* Top products */}
      {topList.length > 0 && (
        <div className="bg-card rounded-2xl border border-border/60 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" /> Mais vendidos
          </h2>
          <div className="space-y-2">
            {topList.map((item: any, i) => {
              const medals = ["bg-gradient-to-br from-amber-400 to-yellow-500", "bg-gradient-to-br from-slate-300 to-slate-400", "bg-gradient-to-br from-orange-400 to-amber-600"];
              const medal = medals[i] ?? "bg-muted";
              return (
                <div key={i} className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/40 transition-colors">
                  <div className={`w-6 h-6 rounded-full ${medal} flex items-center justify-center text-[11px] font-bold text-white shadow-sm shrink-0`}>
                    {i + 1}
                  </div>
                  <div className="w-10 h-10 rounded-xl overflow-hidden bg-muted shrink-0 border border-border/60">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-primary/10">
                        <span className="text-sm font-bold text-primary">{item.name.charAt(0)}</span>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {item.qty} venda{item.qty !== 1 ? "s" : ""} · {item.ml.toFixed(0)}ml
                    </p>
                  </div>
                  <p className="text-sm font-bold text-emerald-600 tabular-nums shrink-0">
                    R$ {item.revenue.toFixed(2)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent sales */}
      <div className="bg-card rounded-2xl border border-border/60 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ShoppingBag className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Vendas recentes</h2>
          <span className="ml-auto text-[10px] font-semibold text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
            {recentSales.length}
          </span>
        </div>

        {/* Status filter */}
        <div className="inline-flex bg-muted/60 rounded-xl p-1 gap-1">
          {([
            { key: "all", label: `Todas (${sales?.length ?? 0})` },
            { key: "paid", label: `Pagas (${paidCount})` },
            { key: "pending", label: `Pendentes (${pendingCount})` },
          ] as { key: SaleStatusFilter; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSaleStatusFilter(key)}
              className={`text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-all ${
                saleStatusFilter === key
                  ? key === "pending"
                    ? "bg-amber-100 text-amber-800 shadow-sm"
                    : "bg-card shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {recentSales.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-3xl mb-1">📦</p>
            <p className="text-xs text-muted-foreground">Nenhuma venda no período.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {recentSales.map((sale: any) => (
              <div key={sale.id} className="group flex items-center gap-3 p-2 rounded-xl hover:bg-muted/40 transition-colors">
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-muted shrink-0 border border-border/60">
                  {sale.products?.image_url ? (
                    <img src={sale.products.image_url} alt={sale.products?.name ?? ""} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-primary/10">
                      <span className="text-sm font-bold text-primary">{sale.products?.name?.charAt(0) ?? "?"}</span>
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{sale.products?.name || "?"}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {format(new Date(sale.created_at), "dd/MM · HH:mm", { locale: ptBR })}
                    {" · "}{Number(sale.ml_sold).toFixed(0)}ml
                    {sale.customer_name && <> · <User className="inline w-2.5 h-2.5" /> {sale.customer_name}</>}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    {sale.payment_method === "cash" && <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-md flex items-center gap-1"><Banknote className="w-2.5 h-2.5" />Dinheiro</span>}
                    {sale.payment_method === "card" && <span className="text-[10px] bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded-md flex items-center gap-1"><CreditCard className="w-2.5 h-2.5" />Cartão</span>}
                    {sale.payment_method === "split" && <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-md flex items-center gap-1"><SplitSquareHorizontal className="w-2.5 h-2.5" />50/50</span>}
                    {sale.payment_status === "pending" && <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-md font-medium">Pendente</span>}
                  </div>
                </div>
                <p className="text-sm font-bold text-emerald-600 tabular-nums shrink-0">
                  R$ {Number(sale.sale_price).toFixed(2)}
                </p>
                <button
                  onClick={() => openEditSale(sale)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir venda?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {Number(sale.ml_sold).toFixed(0)}ml de {sale.products?.name || "?"} voltarão ao estoque.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteSale.mutate(sale)}
                        disabled={deleteSale.isPending}
                        className="bg-red-500 hover:bg-red-600"
                      >
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stock entries */}
      {pendingSales && pendingSales.length > 0 && (() => {
        const totalPending = pendingSales.reduce((s: number, sale: any) => s + Number(sale.amount_due || 0), 0);
        const overdueCount = pendingSales.filter((sale: any) => {
          const due = sale.due_date ? new Date(sale.due_date + "T00:00:00") : null;
          return due && due < new Date(new Date().toDateString());
        }).length;
        return (
        <div className="space-y-3">
          {/* Total pendente card */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 p-4 text-white shadow-lg">
            <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-white/10" />
            <div className="absolute -right-2 -bottom-8 w-20 h-20 rounded-full bg-white/5" />
            <div className="relative flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/90">
                  <Clock className="w-3 h-3" /> Total a receber
                </div>
                <p className="text-2xl font-bold tabular-nums leading-tight mt-1">R$ {totalPending.toFixed(2)}</p>
                <p className="text-[11px] text-white/80 mt-0.5">
                  {pendingSales.length} pagamento{pendingSales.length !== 1 ? "s" : ""} pendente{pendingSales.length !== 1 ? "s" : ""}
                  {overdueCount > 0 && ` · ${overdueCount} em atraso`}
                </p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>

        <div className="bg-card rounded-2xl border border-amber-300/60 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-foreground">Pagamentos pendentes</h2>
            <span className="ml-auto text-[10px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
              {pendingSales.length}
            </span>
          </div>
          <div className="space-y-1.5">
            {pendingSales.map((sale: any) => {
              const due = sale.due_date ? new Date(sale.due_date + "T00:00:00") : null;
              const overdue = due && due < new Date(new Date().toDateString());
              return (
                <div key={sale.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-amber-50/50 transition-colors">
                  <div className="w-10 h-10 rounded-xl overflow-hidden bg-muted shrink-0 border border-border/60">
                    {sale.products?.image_url ? (
                      <img src={sale.products.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-amber-100">
                        <Clock className="w-4 h-4 text-amber-600" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {sale.customer_name || "Cliente"} · {sale.products?.name || "?"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Pago: R$ {Number(sale.amount_paid).toFixed(2)} · Resta:{" "}
                      <span className="font-bold text-amber-700">R$ {Number(sale.amount_due).toFixed(2)}</span>
                      {due && (
                        <> · <span className={overdue ? "text-red-600 font-semibold" : ""}>
                          {overdue ? "Atrasado " : "Vence "}{format(due, "dd/MM/yyyy", { locale: ptBR })}
                        </span></>
                      )}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1 shrink-0"
                    onClick={() => markPaid.mutate(sale)}
                    disabled={markPaid.isPending}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Pagou
                  </Button>
                  <button
                    onClick={() => openEditSale(sale)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors shrink-0"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        </div>
        );
      })()}

      <div className="bg-card rounded-2xl border border-border/60 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Entradas de estoque</h2>
          <span className="ml-auto text-[10px] font-semibold text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">
            {entries?.length ?? 0}
          </span>
        </div>

        {(!entries || entries.length === 0) ? (
          <div className="text-center py-6">
            <p className="text-3xl mb-1">📋</p>
            <p className="text-xs text-muted-foreground">Nenhuma entrada no período.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {entries?.map((m: any) => {
              const isAdj = m.type === "adjustment";
              const Icon = isAdj ? Settings2 : ArrowUp;
              return (
                <div key={m.id} className="group flex items-center gap-3 p-2 rounded-xl hover:bg-muted/40 transition-colors">
                  <div className={`w-9 h-9 rounded-xl shrink-0 flex items-center justify-center ${
                    isAdj ? "bg-slate-100 text-slate-600" : "bg-sky-100 text-sky-600"
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{m.products?.name || "?"}</p>
                    <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-muted-foreground">
                      <span className="font-bold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded-md tabular-nums">
                        +{Number(m.ml_change).toFixed(0)}ml
                      </span>
                      <span>{format(new Date(m.created_at), "dd/MM · HH:mm", { locale: ptBR })}</span>
                      <span>· {MOVEMENT_LABEL[m.type as MovementType]}</span>
                      {m.note && <span className="truncate">· {m.note}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        setEditMov(m);
                        setEditMovMl(String(m.ml_change));
                        setEditMovNote(m.note || "");
                      }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir entrada?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {Number(m.ml_change).toFixed(0)}ml de {m.products?.name || "?"} serão removidos do estoque.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMovement.mutate(m)}
                            disabled={deleteMovement.isPending}
                            className="bg-red-500 hover:bg-red-600"
                          >
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit movement dialog */}
      <Dialog open={!!editMov} onOpenChange={(o) => !o && setEditMov(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar entrada</DialogTitle>
          </DialogHeader>
          {editMov && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {editMov.products?.name} · {MOVEMENT_LABEL[editMov.type as MovementType]}
              </p>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Quantidade (ml)</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={editMovMl}
                  onChange={(e) => setEditMovMl(e.target.value)}
                  className="rounded-xl"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  A diferença será aplicada ao estoque automaticamente.
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Observação</label>
                <Input
                  value={editMovNote}
                  onChange={(e) => setEditMovNote(e.target.value)}
                  placeholder="Opcional"
                  className="rounded-xl"
                />
              </div>
              <Button
                onClick={() => updateMovement.mutate()}
                className="w-full rounded-xl"
                disabled={updateMovement.isPending}
              >
                {updateMovement.isPending ? "Salvando..." : "Salvar alterações"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit sale dialog */}
      <Dialog open={!!editSale} onOpenChange={(o) => !o && setEditSale(null)}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar venda</DialogTitle>
          </DialogHeader>
          {editSale && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {editSale.products?.name} · {Number(editSale.ml_sold).toFixed(0)}ml
              </p>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Cliente</label>
                <Input
                  value={editSaleCustomer}
                  onChange={(e) => setEditSaleCustomer(e.target.value)}
                  placeholder="Nome do cliente"
                  maxLength={100}
                  className="rounded-xl"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Valor total (R$)</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={editSalePrice}
                  onChange={(e) => setEditSalePrice(e.target.value)}
                  className="rounded-xl"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Forma de pagamento</label>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant={editSaleMethod === "cash" ? "default" : "secondary"}
                    className="text-xs flex-col h-auto py-2"
                    onClick={() => setEditSaleMethod("cash")}
                  >
                    <Banknote className="h-4 w-4 mb-1" />
                    Dinheiro
                  </Button>
                  <Button
                    type="button"
                    variant={editSaleMethod === "card" ? "default" : "secondary"}
                    className="text-xs flex-col h-auto py-2"
                    onClick={() => setEditSaleMethod("card")}
                  >
                    <CreditCard className="h-4 w-4 mb-1" />
                    Cartão
                  </Button>
                  <Button
                    type="button"
                    variant={editSaleMethod === "split" ? "default" : "secondary"}
                    className="text-xs flex-col h-auto py-2"
                    onClick={() => setEditSaleMethod("split")}
                  >
                    <SplitSquareHorizontal className="h-4 w-4 mb-1" />
                    50/50
                  </Button>
                </div>
              </div>

              {editSaleMethod === "split" && (
                <div className="rounded-lg bg-muted/40 border border-border p-3 space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-medium text-foreground">1ª parcela (50%)</label>
                      <div className="inline-flex bg-card rounded-lg p-0.5 gap-0.5 border border-border">
                        <button type="button" onClick={() => setEditSaleFirstPaid(true)} className={`text-[10px] px-2 py-1 rounded-md font-medium ${editSaleFirstPaid ? "bg-emerald-500 text-white" : "text-muted-foreground"}`}>Paga</button>
                        <button type="button" onClick={() => setEditSaleFirstPaid(false)} className={`text-[10px] px-2 py-1 rounded-md font-medium ${!editSaleFirstPaid ? "bg-amber-500 text-white" : "text-muted-foreground"}`}>Pendente</button>
                      </div>
                    </div>
                    {!editSaleFirstPaid && (
                      <Input type="date" value={editSaleFirstDueDate} onChange={(e) => setEditSaleFirstDueDate(e.target.value)} className="rounded-xl h-9" />
                    )}
                  </div>
                  <div className="space-y-2 pt-2 border-t border-border/60">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-medium text-foreground">2ª parcela (50%)</label>
                      <div className="inline-flex bg-card rounded-lg p-0.5 gap-0.5 border border-border">
                        <button type="button" onClick={() => setEditSaleSecondPaid(true)} className={`text-[10px] px-2 py-1 rounded-md font-medium ${editSaleSecondPaid ? "bg-emerald-500 text-white" : "text-muted-foreground"}`}>Paga</button>
                        <button type="button" onClick={() => setEditSaleSecondPaid(false)} className={`text-[10px] px-2 py-1 rounded-md font-medium ${!editSaleSecondPaid ? "bg-amber-500 text-white" : "text-muted-foreground"}`}>Pendente</button>
                      </div>
                    </div>
                    {!editSaleSecondPaid && (
                      <Input type="date" value={editSaleDueDate} onChange={(e) => setEditSaleDueDate(e.target.value)} className="rounded-xl h-9" />
                    )}
                  </div>
                </div>
              )}

              {editSaleMethod === "split" ? null : (
                <div className="rounded-lg bg-muted/40 border border-border p-3 space-y-2">
                  <label className="text-xs text-muted-foreground block">Status do pagamento</label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" size="sm" variant={editSaleStatus === "paid" ? "default" : "secondary"} className="text-xs" onClick={() => setEditSaleStatus("paid")}>Pago</Button>
                    <Button type="button" size="sm" variant={editSaleStatus === "pending" ? "default" : "secondary"} className="text-xs" onClick={() => setEditSaleStatus("pending")}>Pendente</Button>
                  </div>
                  {editSaleStatus === "pending" && (
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Data prevista</label>
                      <Input type="date" value={editSaleDueDate} onChange={(e) => setEditSaleDueDate(e.target.value)} className="rounded-xl" />
                    </div>
                  )}
                </div>
              )}

              <Button
                onClick={() => updateSale.mutate()}
                className="w-full rounded-xl"
                disabled={updateSale.isPending}
              >
                {updateSale.isPending ? "Salvando..." : "Salvar alterações"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
