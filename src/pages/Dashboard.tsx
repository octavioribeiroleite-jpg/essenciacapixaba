import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Package, Droplets, TrendingUp, AlertTriangle, ArrowRight,
  DollarSign, RefreshCw, Sparkles, ShoppingBag, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { ML_PER_FRASCO, formatFrascos } from "@/lib/frascos";

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
  const lowStock =
    products?.filter((p) => Number(p.current_ml) < ML_PER_FRASCO * 2) ?? [];
  const emptyStock = lowStock.filter((p) => Number(p.current_ml) === 0);
  const monthRevenue =
    salesThisMonth?.reduce((sum, s) => sum + Number(s.sale_price), 0) ?? 0;
  const monthProfit =
    salesThisMonth?.reduce(
      (sum, s) => sum + (Number(s.sale_price) - Number(s.cost_price)),
      0
    ) ?? 0;
  const recentSales = salesThisMonth?.slice(0, 5) ?? [];
  const frascoLabel = Number.isInteger(totalFrascos)
    ? `${totalFrascos}`
    : totalFrascos.toFixed(1);

  const queryClient = useQueryClient();
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updateProgress, setUpdateProgress] = useState({ done: 0, total: 0, ok: 0 });

  const updateAllMutation = useMutation({
    mutationFn: async () => {
      if (!products?.length || !user) return;
      const total = products.length;
      setUpdateProgress({ done: 0, total, ok: 0 });
      setUpdateOpen(true);
      for (const p of products) {
        try {
          await supabase.functions.invoke("fetch-perfume-details", {
            body: { productId: p.id, name: p.name, userId: user.id },
          });
          await supabase.functions.invoke("fetch-perfume-image", {
            body: { productId: p.id, name: p.name, brand: p.brand, userId: user.id },
          });
          setUpdateProgress((s) => ({ ...s, done: s.done + 1, ok: s.ok + 1 }));
        } catch {
          setUpdateProgress((s) => ({ ...s, done: s.done + 1 }));
        }
        await new Promise((r) => setTimeout(r, 700));
      }
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Catálogo atualizado com IA!");
    },
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const greetingEmoji = hour < 12 ? "🌅" : hour < 18 ? "☀️" : "🌙";

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
        <div className="relative">
          <p className="text-[11px] text-white/80 capitalize">
            {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </p>
          <h1 className="text-2xl font-bold mt-0.5">
            {greeting} {greetingEmoji}
          </h1>
          <p className="text-xs text-white/85 mt-0.5">Aqui está o resumo do seu negócio</p>

          <button
            type="button"
            onClick={() => updateAllMutation.mutate()}
            disabled={updateAllMutation.isPending}
            className="mt-4 inline-flex items-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors border border-white/30 disabled:opacity-60"
          >
            {updateAllMutation.isPending ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Atualizando...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Atualizar tudo com IA
              </>
            )}
          </button>
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

      {lowStock.length > 0 && (
        <div className="fade-in rounded-2xl border border-border/60 bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 pulse-soft" />
              <h2 className="text-sm font-semibold text-foreground">Estoque Baixo</h2>
            </div>
            <div className="flex items-center gap-1.5">
              {emptyStock.length > 0 && (
                <span className="text-[10px] font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                  {emptyStock.length} esgotado{emptyStock.length > 1 ? "s" : ""}
                </span>
              )}
              <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                {lowStock.length} produto{lowStock.length > 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <div className="divide-y divide-border/40">
            {lowStock.map((p) => {
              const frascos = Math.floor(Number(p.current_ml) / ML_PER_FRASCO);
              const isEmpty = frascos === 0;
              const pct = Math.min(100, (Number(p.current_ml) / (ML_PER_FRASCO * 2)) * 100);
              return (
                <button
                  key={p.id}
                  onClick={() => navigate(`/products/${p.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
                >
                  <div className="h-11 w-11 rounded-xl overflow-hidden bg-muted shrink-0 border border-border/50">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-amber-200 text-primary font-semibold">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{p.brand || "Sem marca"}</p>
                    <div className="mt-1.5 h-1 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isEmpty ? "bg-red-400" : "bg-amber-400"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        isEmpty ? "text-red-700 bg-red-100" : "text-amber-700 bg-amber-100"
                      }`}
                    >
                      {isEmpty ? "Esgotado" : `${frascos} frasco${frascos !== 1 ? "s" : ""}`}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

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

      <button
        onClick={() => navigate("/products")}
        className="fade-in hover-lift w-full flex items-center justify-between bg-card border border-border/60 rounded-2xl px-4 py-4 hover:border-primary/50 hover:shadow-md transition-all"
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">🧴</span>
          <div className="text-left">
            <p className="text-sm font-semibold text-foreground">
              Ver Catálogo
            </p>
            <p className="text-xs text-muted-foreground">
              {totalProducts} produtos cadastrados
            </p>
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground" />
      </button>

      <Dialog open={updateOpen} onOpenChange={(o) => { if (!o && updateProgress.done >= updateProgress.total) setUpdateOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Atualizando catálogo com IA</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Progress value={updateProgress.total > 0 ? (updateProgress.done / updateProgress.total) * 100 : 0} className="h-2" />
            <p className="text-sm text-muted-foreground text-center">
              {updateProgress.done} de {updateProgress.total} produtos · {updateProgress.ok} atualizados
            </p>
            {updateProgress.done >= updateProgress.total && updateProgress.total > 0 && (
              <Button className="w-full" onClick={() => setUpdateOpen(false)}>Fechar</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
