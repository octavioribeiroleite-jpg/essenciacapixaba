import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useState } from "react";
import { format, subDays, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

type Period = "week" | "month" | "all";

export default function Reports() {
  const { user } = useAuth();
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
    </div>
  );
}
