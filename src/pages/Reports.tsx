import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, Trash2 } from "lucide-react";
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
import { useState } from "react";
import { format, subDays, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

type Period = "week" | "month" | "all";

export default function Reports() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<Period>("month");

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
        .select("*, products(name, brand)")
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
  const topProducts = sales?.reduce((acc: Record<string, { name: string; ml: number; revenue: number }>, sale: any) => {
    const pid = sale.product_id;
    if (!acc[pid]) {
      acc[pid] = { name: sale.products?.name || "?", ml: 0, revenue: 0 };
    }
    acc[pid].ml += Number(sale.ml_sold);
    acc[pid].revenue += Number(sale.sale_price);
    return acc;
  }, {} as Record<string, { name: string; ml: number; revenue: number }>);

  const topList = topProducts
    ? Object.values(topProducts).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
    : [];

  const totalRevenue = sales?.reduce((s, sale) => s + Number(sale.sale_price), 0) ?? 0;
  const totalProfit = sales?.reduce((s, sale) => s + Number(sale.sale_price) - Number(sale.cost_price), 0) ?? 0;
  const totalMl = sales?.reduce((s, sale) => s + Number(sale.ml_sold), 0) ?? 0;

  const recentSales = sales ? [...sales].reverse().slice(0, 20) : [];

  const deleteSale = useMutation({
    mutationFn: async (sale: any) => {
      const { data: product, error: pErr } = await supabase
        .from("products")
        .select("current_ml, total_ml")
        .eq("id", sale.product_id)
        .single();
      if (pErr) throw pErr;

      const restored = Number(product.current_ml) + Number(sale.ml_sold);
      const capped = Math.min(restored, Number(product.total_ml));

      const { error: uErr } = await supabase
        .from("products")
        .update({ current_ml: capped })
        .eq("id", sale.product_id);
      if (uErr) throw uErr;

      const { error: dErr } = await supabase.from("sales").delete().eq("id", sale.id);
      if (dErr) throw dErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["report-sales"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["sales-month"] });
      queryClient.invalidateQueries({ queryKey: ["product-sales"] });
      toast.success("Venda excluída e estoque restaurado.");
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-primary" />
        Relatórios
      </h1>

      {/* Period filter */}
      <div className="flex gap-2">
        {([["week", "Semana"], ["month", "Mês"], ["all", "Tudo"]] as const).map(([key, label]) => (
          <Button
            key={key}
            variant={period === key ? "default" : "secondary"}
            size="sm"
            onClick={() => setPeriod(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="glass-card">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Receita</p>
            <p className="text-sm font-bold text-foreground">R$ {totalRevenue.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Lucro</p>
            <p className="text-sm font-bold text-success">R$ {totalProfit.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">ML Vendidos</p>
            <p className="text-sm font-bold text-primary">{totalMl.toFixed(0)}ml</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card className="glass-card">
          <CardContent className="p-4">
            <h2 className="text-sm font-medium text-foreground mb-3">Vendas por Dia</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(20 10% 18%)" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "hsl(30 10% 55%)" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(30 10% 55%)" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(20 10% 8%)",
                    border: "1px solid hsl(20 10% 18%)",
                    borderRadius: "8px",
                    color: "hsl(40 20% 92%)",
                  }}
                  formatter={(value: number) => `R$ ${value.toFixed(2)}`}
                />
                <Bar dataKey="receita" fill="hsl(38 80% 55%)" radius={[4, 4, 0, 0]} name="Receita" />
                <Bar dataKey="lucro" fill="hsl(142 76% 36%)" radius={[4, 4, 0, 0]} name="Lucro" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Top Products */}
      <div>
        <h2 className="text-sm font-medium text-foreground mb-3">Mais Vendidos</h2>
        {topList.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma venda no período.</p>}
        <div className="space-y-2">
          {topList.map((item, i) => (
            <Card key={i} className="glass-card">
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-primary">#{i + 1}</span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.ml.toFixed(0)}ml vendidos</p>
                  </div>
                </div>
                <p className="text-sm font-bold text-foreground">R$ {item.revenue.toFixed(2)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent sales with delete */}
      <div>
        <h2 className="text-sm font-medium text-foreground mb-3">Vendas recentes</h2>
        {recentSales.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhuma venda no período.</p>
        )}
        <div className="space-y-2">
          {recentSales.map((sale: any) => (
            <Card key={sale.id} className="glass-card">
              <CardContent className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {sale.products?.name || "?"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {format(new Date(sale.created_at), "dd/MM HH:mm", { locale: ptBR })} ·{" "}
                    {Number(sale.ml_sold).toFixed(0)}ml · R$ {Number(sale.sale_price).toFixed(2)}
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir venda?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {Number(sale.ml_sold).toFixed(0)}ml de {sale.products?.name || "?"} voltarão
                        ao estoque. Esta ação não pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteSale.mutate(sale)}
                        disabled={deleteSale.isPending}
                      >
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
