import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Package, Droplets, TrendingUp, AlertTriangle, ArrowRight, DollarSign, RefreshCw } from "lucide-react";
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
        .select("*, products(name, brand)")
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
  const greetingEmoji = hour < 12 ? "👋" : hour < 18 ? "☀️" : "🌙";

  const stats = [
    {
      label: "Produtos",
      value: String(totalProducts),
      sub: "cadastrados",
      icon: Package,
      iconColor: "text-primary",
      cardClass: "stat-gold",
    },
    {
      label: "Estoque",
      value: frascoLabel,
      sub: totalFrascos === 1 ? "frasco" : "frascos",
      icon: Droplets,
      iconColor: "text-sky-500",
      cardClass: "stat-sky",
    },
    {
      label: "Receita",
      value: `R$\u00A0${monthRevenue.toFixed(2)}`,
      sub: "este mês",
      icon: DollarSign,
      iconColor: "text-emerald-500",
      cardClass: "stat-emerald",
    },
    {
      label: "Lucro",
      value: `R$\u00A0${monthProfit.toFixed(2)}`,
      sub: "este mês",
      icon: TrendingUp,
      iconColor: "text-green-600",
      cardClass: "stat-green",
    },
  ];

  return (
    <div className="p-4 lg:p-0 space-y-4 max-w-lg lg:max-w-7xl mx-auto pb-24 lg:pb-8">
      <div className="fade-in pt-2">
        <p className="text-xs text-muted-foreground capitalize">
          {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
        </p>
        <h1 className="text-xl font-bold text-foreground mt-0.5">
          {greeting} {greetingEmoji}
        </h1>
        <p className="text-xs text-muted-foreground">Aqui está o resumo do seu negócio</p>
      </div>

      <Button
        onClick={() => updateAllMutation.mutate()}
        disabled={updateAllMutation.isPending}
        className="w-full gap-2 bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20"
        variant="outline"
      >
        <RefreshCw className={`w-4 h-4 ${updateAllMutation.isPending ? "animate-spin" : ""}`} />
        {updateAllMutation.isPending ? "Atualizando catálogo..." : "✨ Atualizar tudo com IA"}
      </Button>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 lg:gap-4">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          const isMoney = stat.value.startsWith("R$");
          return (
            <div
              key={i}
              className={`fade-in ${stat.cardClass} rounded-2xl border p-3.5 flex flex-col gap-1`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {stat.label}
                </span>
                <Icon className={`w-4 h-4 ${stat.iconColor}`} />
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
        <div className="fade-in rounded-2xl border border-amber-400/40 bg-amber-50/60 p-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-amber-500 pulse-soft" />
            <h2 className="text-sm font-semibold text-amber-700">
              Estoque Baixo ({lowStock.length})
            </h2>
          </div>
          {lowStock.map((p) => (
            <button
              key={p.id}
              onClick={() => navigate(`/products/${p.id}`)}
              className="w-full flex items-center justify-between rounded-xl px-3 py-2 hover:bg-amber-100/80 transition-colors text-left"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{p.name}</p>
                <p className="text-xs text-muted-foreground">
                  {p.brand || "Sem marca"}
                </p>
              </div>
              <span className="text-xs font-semibold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                {formatFrascos(p.current_ml)}{" "}
                {Number(p.current_ml) === ML_PER_FRASCO ? "frasco" : "frascos"}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="fade-in rounded-2xl border border-border/60 bg-card p-4 space-y-1">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground">
            Vendas Recentes
          </h2>
          <button
            onClick={() => navigate("/reports")}
            className="text-xs text-primary flex items-center gap-1 hover:underline"
          >
            Ver tudo <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {recentSales.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma venda este mês.
          </p>
        ) : (
          <div className="space-y-1">
            {recentSales.map((sale: any) => (
              <div
                key={sale.id}
                className="flex items-center justify-between py-2 border-b border-border/40 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {sale.products?.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(sale.created_at), "dd/MM HH:mm", {
                      locale: ptBR,
                    })}{" "}
                    · -{formatFrascos(sale.ml_sold)} frasco(s)
                  </p>
                </div>
                <span className="text-sm font-semibold text-emerald-600">
                  R$ {Number(sale.sale_price).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => navigate("/products")}
        className="fade-in hover-lift w-full flex items-center justify-between bg-card border border-border/60 rounded-2xl px-4 py-4 hover:border-primary/50 transition-colors"
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
