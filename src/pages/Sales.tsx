import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Search, ShoppingCart, Banknote, CreditCard, SplitSquareHorizontal } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { logMovement } from "@/lib/stockMovements";
import { ML_PER_FRASCO, formatFrascos, perFrasco } from "@/lib/frascos";
import { ChargeMessageDialog, type ChargePayload } from "@/components/ChargeMessageDialog";

type Product = {
  id: string;
  name: string;
  brand: string | null;
  total_ml: number;
  current_ml: number;
  cost_per_ml: number;
  sale_price_per_ml: number;
  image_url: string | null;
};

export default function Sales() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "split">("cash");
  const [dueDate, setDueDate] = useState("");
  const [isPaid, setIsPaid] = useState(true);
  const [chargePayload, setChargePayload] = useState<ChargePayload | null>(null);
  const [chargeOpen, setChargeOpen] = useState(false);

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,brand,total_ml,current_ml,cost_per_ml,sale_price_per_ml,image_url")
        .gte("current_ml", ML_PER_FRASCO)
        .order("name");
      if (error) throw error;
      return data as Product[];
    },
    enabled: !!user,
  });

  const filtered = useMemo(() => {
    if (!products) return [];
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.brand ?? "").toLowerCase().includes(q),
    );
  }, [products, search]);

  const openSale = (p: Product) => {
    setSelected(p);
    setQty("1");
    setPrice(perFrasco(p.sale_price_per_ml).toFixed(2));
    setCustomerName("");
    setPaymentMethod("cash");
    setIsPaid(true);
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    setDueDate(d.toISOString().slice(0, 10));
    setPickerOpen(false);
  };

  const updateQty = (q: string) => {
    setQty(q);
    const n = parseInt(q, 10);
    if (selected && !isNaN(n) && n > 0) {
      setPrice((n * perFrasco(selected.sale_price_per_ml)).toFixed(2));
    }
  };

  const sellMutation = useMutation({
    mutationFn: async () => {
      if (!selected || !user) throw new Error("Selecione um produto");
      const qtyNum = Math.max(1, Math.floor(parseInt(qty, 10) || 1));
      const mlSold = qtyNum * ML_PER_FRASCO;
      const priceNum = parseFloat(price);
      if (mlSold > Number(selected.current_ml)) throw new Error("Estoque insuficiente!");
      if (isNaN(priceNum) || priceNum < 0) throw new Error("Informe o valor da venda");
      if (paymentMethod === "split" && !dueDate) throw new Error("Informe a data do 2º pagamento");
      if (paymentMethod !== "split" && !isPaid && !dueDate) throw new Error("Informe a data prevista de pagamento");

      const costPrice = mlSold * Number(selected.cost_per_ml);
      const isSplit = paymentMethod === "split";
      const amountPaid = isSplit
        ? Math.round((priceNum / 2) * 100) / 100
        : isPaid
          ? priceNum
          : 0;
      const amountDue = Math.round((priceNum - amountPaid) * 100) / 100;
      const paymentStatus = isSplit || !isPaid ? "pending" : "paid";

      const { data: saleRow, error: saleError } = await supabase
        .from("sales")
        .insert({
          user_id: user.id,
          product_id: selected.id,
          ml_sold: mlSold,
          sale_price: priceNum,
          cost_price: costPrice,
          customer_name: customerName.trim() || null,
          payment_method: paymentMethod,
          payment_status: paymentStatus,
          amount_paid: amountPaid,
          amount_due: amountDue,
          due_date: isSplit ? dueDate : !isPaid ? dueDate : null,
        })
        .select("id")
        .single();
      if (saleError) throw saleError;

      const newMl = Number(selected.current_ml) - mlSold;
      const { error: updateError } = await supabase
        .from("products")
        .update({ current_ml: newMl })
        .eq("id", selected.id);
      if (updateError) throw updateError;

      await logMovement({
        userId: user.id,
        productId: selected.id,
        type: "sale",
        mlChange: -mlSold,
        mlAfter: newMl,
        note: `Venda: ${qtyNum} frasco(s)`,
        saleId: saleRow?.id,
      });

      return {
        qtyNum,
        priceNum,
        amountPaid,
        amountDue,
        paymentMethod,
        dueDate: isSplit ? dueDate : !isPaid ? dueDate : null,
        isPending: isSplit || !isPaid,
        productName: selected.name,
        brand: selected.brand,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["sales-month"] });
      queryClient.invalidateQueries({ queryKey: ["product-sales"] });
      toast.success("Venda registrada!");
      if (result?.isPending) {
        setChargePayload({
          customerName: customerName.trim() || null,
          productName: result.productName,
          brand: result.brand,
          quantity: result.qtyNum,
          total: result.priceNum,
          amountPaid: result.amountPaid,
          amountDue: result.amountDue,
          paymentMethod: result.paymentMethod,
          dueDate: result.dueDate,
          firstPaid: result.paymentMethod === "split" ? true : !result.isPending ? true : false,
        });
        setChargeOpen(true);
      }
      setSelected(null);
      setQty("1");
      setPrice("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const qtyNum = Math.max(1, Math.floor(parseInt(qty, 10) || 1));
  const priceNum = parseFloat(price) || 0;
  const profit = selected ? priceNum - qtyNum * perFrasco(selected.cost_per_ml) : 0;
  const maxFrascos = selected ? Math.floor(Number(selected.current_ml) / ML_PER_FRASCO) : 0;

  return (
    <div className="space-y-4 lg:max-w-2xl lg:mx-auto">
      <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <ShoppingCart className="h-5 w-5 text-primary" />
        Registrar Venda
      </h1>

      <Card className="glass-card">
        <CardContent className="p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Selecione um perfume e escolha quantos frascos vai vender. O valor é preenchido automaticamente, mas você pode editar se der desconto.
          </p>
          <Button className="w-full" onClick={() => setPickerOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nova Venda
          </Button>
        </CardContent>
      </Card>

      {/* Product picker */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Escolher perfume</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-secondary border-border pl-9"
            />
          </div>
          <div className="max-h-[60vh] overflow-y-auto space-y-2">
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">Nenhum produto disponível.</p>
            )}
            {filtered.map((p) => {
              const fr = Math.floor(Number(p.current_ml) / ML_PER_FRASCO);
              return (
                <button
                  key={p.id}
                  onClick={() => openSale(p)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-secondary text-left transition-colors"
                >
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="h-12 w-12 rounded-lg object-cover" />
                  ) : (
                    <div className="h-12 w-12 rounded-lg bg-secondary flex items-center justify-center text-xl">🧴</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.brand || "Sem marca"}</p>
                  </div>
                  <div className="text-right">
                    <p className={cn("text-sm font-bold", fr < 2 ? "text-warning" : "text-primary")}>
                      {fr} {fr === 1 ? "frasco" : "frascos"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">R$ {perFrasco(p.sale_price_per_ml).toFixed(2)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Sale dialog */}
      <Dialog
        open={!!selected}
        onOpenChange={(o) => {
          if (!o) setSelected(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">{selected?.name}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Estoque: <span className="text-foreground font-medium">{maxFrascos} frasco(s)</span> ·
                Preço unitário: R$ {perFrasco(selected.sale_price_per_ml).toFixed(2)}
              </p>

              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 3, 4].map((q) => (
                  <Button
                    key={q}
                    variant={qtyNum === q ? "default" : "secondary"}
                    className="text-sm font-bold"
                    disabled={q > maxFrascos}
                    onClick={() => updateQty(String(q))}
                  >
                    {q}
                  </Button>
                ))}
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Quantidade de frascos</label>
                <Input
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min="1"
                  max={maxFrascos}
                  value={qty}
                  onChange={(e) => updateQty(e.target.value)}
                  className="bg-secondary border-border"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Valor total da venda (R$)</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="bg-secondary border-border"
                  placeholder="Edite para aplicar desconto"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Cliente (opcional)</label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Nome do cliente"
                  maxLength={100}
                  className="bg-secondary border-border"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Forma de pagamento</label>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant={paymentMethod === "cash" ? "default" : "secondary"}
                    className="text-xs flex-col h-auto py-2"
                    onClick={() => setPaymentMethod("cash")}
                  >
                    <Banknote className="h-4 w-4 mb-1" />
                    Dinheiro
                  </Button>
                  <Button
                    type="button"
                    variant={paymentMethod === "card" ? "default" : "secondary"}
                    className="text-xs flex-col h-auto py-2"
                    onClick={() => setPaymentMethod("card")}
                  >
                    <CreditCard className="h-4 w-4 mb-1" />
                    Cartão
                  </Button>
                  <Button
                    type="button"
                    variant={paymentMethod === "split" ? "default" : "secondary"}
                    className="text-xs flex-col h-auto py-2"
                    onClick={() => setPaymentMethod("split")}
                  >
                    <SplitSquareHorizontal className="h-4 w-4 mb-1" />
                    50% / 50%
                  </Button>
                </div>
              </div>

              {paymentMethod === "split" && (
                <div className="rounded-lg bg-warning/10 border border-warning/30 p-3 space-y-2">
                  <p className="text-xs text-foreground">
                    Entrada hoje: <span className="font-bold text-primary">R$ {(priceNum / 2).toFixed(2)}</span>
                    {" · "}
                    Restante: <span className="font-bold text-warning">R$ {(priceNum / 2).toFixed(2)}</span>
                  </p>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Data do 2º pagamento</label>
                    <Input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="bg-secondary border-border"
                    />
                  </div>
                </div>
              )}

              {paymentMethod !== "split" && (
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground block">Status do pagamento</label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={isPaid ? "default" : "secondary"}
                      className="text-xs"
                      onClick={() => setIsPaid(true)}
                    >
                      Pago
                    </Button>
                    <Button
                      type="button"
                      variant={!isPaid ? "default" : "secondary"}
                      className="text-xs"
                      onClick={() => setIsPaid(false)}
                    >
                      Pendente
                    </Button>
                  </div>
                  {!isPaid && (
                    <div className="rounded-lg bg-warning/10 border border-warning/30 p-3">
                      <label className="text-xs text-muted-foreground mb-1 block">Data prevista de pagamento</label>
                      <Input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="bg-secondary border-border"
                      />
                    </div>
                  )}
                </div>
              )}

              {qtyNum > 0 && priceNum >= 0 && (
                <div className="rounded-lg bg-secondary/60 border border-border p-3 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Custo total</span>
                    <span className="text-foreground">R$ {(qtyNum * perFrasco(selected.cost_per_ml)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Venda</span>
                    <span className="text-primary font-medium">R$ {priceNum.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-border">
                    <span className="text-muted-foreground">Lucro</span>
                    <span className={cn("font-bold", profit >= 0 ? "text-success" : "text-destructive")}>
                      R$ {profit.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              <Button
                className="w-full"
                disabled={sellMutation.isPending || qtyNum < 1 || qtyNum > maxFrascos || !price}
                onClick={() => sellMutation.mutate()}
              >
                {sellMutation.isPending ? "Registrando..." : `Vender ${qtyNum} frasco(s)`}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}