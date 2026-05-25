import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, Trash2, Pencil, ArrowUp, Settings2, Package } from "lucide-react";
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

type Period = "week" | "month" | "all";

export default function Reports() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<Period>("month");
  const [editMov, setEditMov] = useState<any | null>(null);
  const [editMovMl, setEditMovMl] = useState("");
  const [editMovNote, setEditMovNote] = useState("");

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
    <div className="space-y-4 lg:max-w-7xl lg:mx-auto">
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

      {/* Stock entries history */}
      <div>
        <h2 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          Entradas de estoque
        </h2>
        {(!entries || entries.length === 0) && (
          <p className="text-xs text-muted-foreground">Nenhuma entrada no período.</p>
        )}
        <div className="space-y-2">
          {entries?.map((m: any) => {
            const isAdj = m.type === "adjustment";
            const Icon = isAdj ? Settings2 : ArrowUp;
            return (
              <Card key={m.id} className="glass-card">
                <CardContent className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 flex items-start gap-2">
                    <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${isAdj ? "text-muted-foreground" : "text-success"}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {m.products?.name || "?"}
                        <span className="ml-2 text-success font-bold">
                          +{Number(m.ml_change).toFixed(0)}ml
                        </span>
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {format(new Date(m.created_at), "dd/MM HH:mm", { locale: ptBR })} ·{" "}
                        {MOVEMENT_LABEL[m.type as MovementType]}
                        {m.note ? ` · ${m.note}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => {
                        setEditMov(m);
                        setEditMovMl(String(m.ml_change));
                        setEditMovNote(m.note || "");
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir entrada?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {Number(m.ml_change).toFixed(0)}ml de {m.products?.name || "?"} serão
                            removidos do estoque atual. Esta ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMovement.mutate(m)}
                            disabled={deleteMovement.isPending}
                          >
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Edit movement dialog */}
      <Dialog open={!!editMov} onOpenChange={(o) => !o && setEditMov(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Editar entrada</DialogTitle>
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
                  className="bg-secondary border-border"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  A diferença será aplicada ao estoque atual automaticamente.
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Observação</label>
                <Input
                  value={editMovNote}
                  onChange={(e) => setEditMovNote(e.target.value)}
                  className="bg-secondary border-border"
                />
              </div>
              <Button
                className="w-full"
                disabled={updateMovement.isPending}
                onClick={() => updateMovement.mutate()}
              >
                {updateMovement.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
