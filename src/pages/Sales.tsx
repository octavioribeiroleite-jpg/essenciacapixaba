import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Plus, Search, ShoppingCart, Banknote, CreditCard, SplitSquareHorizontal,
  Trash2, Minus,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { logMovement } from "@/lib/stockMovements";
import { ML_PER_FRASCO, perFrasco } from "@/lib/frascos";
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

type CartItem = {
  product: Product;
  qty: number;
  unitPrice: number; // R$ por frasco
};

export default function Sales() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);

  const [customerName, setCustomerName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "split">("cash");
  const [dueDate, setDueDate] = useState("");
  const [firstDueDate, setFirstDueDate] = useState("");
  const [isPaid, setIsPaid] = useState(true);
  const [firstPaid, setFirstPaid] = useState(true);

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

  const resetAll = () => {
    setCart([]);
    setCustomerName("");
    setPaymentMethod("cash");
    setIsPaid(true);
    setFirstPaid(true);
    setDueDate("");
    setFirstDueDate("");
  };

  const openNewSale = () => {
    resetAll();
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    setDueDate(d.toISOString().slice(0, 10));
    setFirstDueDate(new Date().toISOString().slice(0, 10));
    setPickerOpen(true);
  };

  const addToCart = (p: Product) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === p.id);
      const maxFr = Math.floor(Number(p.current_ml) / ML_PER_FRASCO);
      if (existing) {
        if (existing.qty + 1 > maxFr) {
          toast.error(`Apenas ${maxFr} frasco(s) em estoque`);
          return prev;
        }
        return prev.map((c) =>
          c.product.id === p.id
            ? { ...c, qty: c.qty + 1, unitPrice: c.unitPrice }
            : c,
        );
      }
      return [
        ...prev,
        { product: p, qty: 1, unitPrice: perFrasco(p.sale_price_per_ml) },
      ];
    });
    setPickerOpen(false);
    setCartOpen(true);
    setSearch("");
  };

  const removeItem = (id: string) =>
    setCart((prev) => prev.filter((c) => c.product.id !== id));

  const updateQty = (id: string, qty: number) => {
    setCart((prev) =>
      prev.map((c) => {
        if (c.product.id !== id) return c;
        const maxFr = Math.floor(Number(c.product.current_ml) / ML_PER_FRASCO);
        const q = Math.max(1, Math.min(maxFr, Math.floor(qty) || 1));
        return { ...c, qty: q, unitPrice: c.unitPrice };
      }),
    );
  };

  const updateUnitPrice = (id: string, price: number) => {
    setCart((prev) =>
      prev.map((c) =>
        c.product.id === id ? { ...c, unitPrice: Math.max(0, price) } : c,
      ),
    );
  };

  const total = cart.reduce((s, c) => s + c.qty * c.unitPrice, 0);
  const totalCost = cart.reduce(
    (s, c) => s + c.qty * perFrasco(c.product.cost_per_ml),
    0,
  );
  const profit = total - totalCost;

  const finalizeSale = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Não autenticado");
      if (cart.length === 0) throw new Error("Carrinho vazio");
      if (total <= 0) throw new Error("Valor inválido");
      const isSplit = paymentMethod === "split";
      if (isSplit && !dueDate) throw new Error("Informe a data do 2º pagamento");
      if (isSplit && !firstPaid && !firstDueDate)
        throw new Error("Informe a data da 1ª parcela");
      if (!isSplit && !isPaid && !dueDate)
        throw new Error("Informe a data prevista de pagamento");

      const orderId =
        (globalThis.crypto?.randomUUID?.() as string) ||
        `${Date.now()}-${Math.random()}`;

      // Define divisão de valores pagos por item (pro-rata)
      const computePayment = (itemTotal: number) => {
        if (isSplit) {
          const half = Math.round((itemTotal / 2) * 100) / 100;
          const paid =
            (firstPaid ? half : 0) + (true ? 0 : 0); // 2ª parcela sempre pendente no fluxo de venda
          // Para simplificar UX: na criação, a 2ª parcela é sempre pendente
          return {
            amountPaid: paid,
            amountDue: Math.round((itemTotal - paid) * 100) / 100,
            status: "pending" as const,
            firstPaidVal: firstPaid,
            firstDue: firstPaid ? null : firstDueDate,
            secondDue: dueDate,
          };
        }
        if (isPaid) {
          return {
            amountPaid: itemTotal,
            amountDue: 0,
            status: "paid" as const,
            firstPaidVal: true,
            firstDue: null as string | null,
            secondDue: null as string | null,
          };
        }
        return {
          amountPaid: 0,
          amountDue: itemTotal,
          status: "pending" as const,
          firstPaidVal: true,
          firstDue: null as string | null,
          secondDue: dueDate,
        };
      };

      // Deduz estoque + cria venda para cada item
      const insertedSales: any[] = [];
      for (const item of cart) {
        const mlSold = item.qty * ML_PER_FRASCO;
        const itemTotal = Math.round(item.qty * item.unitPrice * 100) / 100;
        const costPrice = mlSold * Number(item.product.cost_per_ml);

        const { data: ded, error: rpcErr } = await supabase.rpc(
          "deduct_stock" as any,
          { p_product_id: item.product.id, p_ml: mlSold } as any,
        );
        if (rpcErr) throw rpcErr;
        const dr = ded as { ok: boolean; new_ml?: number; error?: string } | null;
        if (!dr?.ok) throw new Error(dr?.error || "Estoque insuficiente");
        const newMl = Number(dr.new_ml);

        const pay = computePayment(itemTotal);
        const { data: saleRow, error: saleErr } = await supabase
          .from("sales")
          .insert({
            user_id: user.id,
            product_id: item.product.id,
            ml_sold: mlSold,
            sale_price: itemTotal,
            cost_price: costPrice,
            customer_name: customerName.trim() || null,
            payment_method: paymentMethod,
            payment_status: pay.status,
            amount_paid: pay.amountPaid,
            amount_due: pay.amountDue,
            due_date: pay.secondDue,
            first_paid: pay.firstPaidVal,
            first_due_date: pay.firstDue,
            order_id: orderId,
          } as any)
          .select("id")
          .single();
        if (saleErr) throw saleErr;

        await logMovement({
          userId: user.id,
          productId: item.product.id,
          type: "sale",
          mlChange: -mlSold,
          mlAfter: newMl,
          note: `Venda: ${item.qty} frasco(s)${cart.length > 1 ? " (pedido múltiplo)" : ""}`,
          saleId: saleRow?.id,
        });
        insertedSales.push(saleRow);
      }

      const isPending =
        paymentMethod === "split" || (paymentMethod !== "split" && !isPaid);
      return { isPending };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["sales-month"] });
      queryClient.invalidateQueries({ queryKey: ["product-sales"] });
      queryClient.invalidateQueries({ queryKey: ["report-sales"] });
      queryClient.invalidateQueries({ queryKey: ["pending-sales"] });
      toast.success(
        cart.length > 1
          ? `Pedido com ${cart.length} perfumes registrado!`
          : "Venda registrada!",
      );

      if (res?.isPending) {
        const productName = cart.map((c) => `${c.qty}x ${c.product.name}`).join(" + ");
        const totalQty = cart.reduce((s, c) => s + c.qty, 0);
        const totalVal = total;
        const isSplit = paymentMethod === "split";
        const half = isSplit ? Math.round((totalVal / 2) * 100) / 100 : 0;
        const paid = isSplit
          ? firstPaid
            ? half
            : 0
          : isPaid
            ? totalVal
            : 0;
        setChargePayload({
          customerName: customerName.trim() || null,
          productName,
          brand: cart[0]?.product.brand ?? null,
          quantity: totalQty,
          total: totalVal,
          amountPaid: paid,
          amountDue: Math.round((totalVal - paid) * 100) / 100,
          paymentMethod,
          dueDate,
          firstDueDate: isSplit ? (firstPaid ? null : firstDueDate) : null,
          firstPaid: isSplit ? firstPaid : true,
        });
        setChargeOpen(true);
      }

      setCartOpen(false);
      resetAll();
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-4 lg:max-w-2xl lg:mx-auto">
      <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <ShoppingCart className="h-5 w-5 text-primary" />
        Registrar Venda
      </h1>

      <Card className="glass-card">
        <CardContent className="p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Adicione um ou mais perfumes ao pedido. O total e a forma de pagamento são definidos no final.
          </p>
          <Button className="w-full" onClick={openNewSale}>
            <Plus className="h-4 w-4 mr-1" /> Nova Venda
          </Button>
        </CardContent>
      </Card>

      {/* Product picker */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {cart.length > 0 ? "Adicionar outro perfume" : "Escolher perfume"}
            </DialogTitle>
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
              <p className="text-xs text-muted-foreground text-center py-6">
                Nenhum produto disponível.
              </p>
            )}
            {filtered.map((p) => {
              const fr = Math.floor(Number(p.current_ml) / ML_PER_FRASCO);
              const inCart = cart.find((c) => c.product.id === p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
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
                    <p className="text-[10px] text-muted-foreground">
                      R$ {perFrasco(p.sale_price_per_ml).toFixed(2)}
                    </p>
                    {inCart && (
                      <p className="text-[10px] text-primary font-semibold mt-0.5">
                        ✓ {inCart.qty} no carrinho
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          {cart.length > 0 && (
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                setPickerOpen(false);
                setCartOpen(true);
              }}
            >
              Voltar ao pedido ({cart.length})
            </Button>
          )}
        </DialogContent>
      </Dialog>

      {/* Cart / checkout */}
      <Dialog
        open={cartOpen}
        onOpenChange={(o) => {
          if (!o && !finalizeSale.isPending) setCartOpen(false);
        }}
      >
        <DialogContent className="max-w-sm max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-primary" />
              Pedido ({cart.length} {cart.length === 1 ? "item" : "itens"})
            </DialogTitle>
          </DialogHeader>

          {/* Items */}
          <div className="space-y-2">
            {cart.map((c) => {
              const maxFr = Math.floor(Number(c.product.current_ml) / ML_PER_FRASCO);
              return (
                <div
                  key={c.product.id}
                  className="rounded-xl border border-border bg-secondary/40 p-2.5 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    {c.product.image_url ? (
                      <img src={c.product.image_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">🧴</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.product.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        Estoque: {maxFr} fr · R$ {perFrasco(c.product.sale_price_per_ml).toFixed(2)}/un
                      </p>
                    </div>
                    <button
                      onClick={() => removeItem(c.product.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-red-50 hover:text-red-500"
                      aria-label="Remover"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">Qtd (frascos)</label>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => updateQty(c.product.id, c.qty - 1)}
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={maxFr}
                          value={c.qty}
                          onChange={(e) => updateQty(c.product.id, parseInt(e.target.value, 10) || 1)}
                          className="h-8 text-center bg-card border-border"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => updateQty(c.product.id, c.qty + 1)}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">Preço unitário (R$)</label>
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min={0}
                        value={c.unitPrice}
                        onChange={(e) =>
                          updateUnitPrice(c.product.id, parseFloat(e.target.value) || 0)
                        }
                        className="h-8 bg-card border-border"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-right text-muted-foreground">
                    Subtotal:{" "}
                    <span className="text-foreground font-semibold">
                      R$ {(c.qty * c.unitPrice).toFixed(2)}
                    </span>
                  </p>
                </div>
              );
            })}

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setPickerOpen(true)}
            >
              <Plus className="w-4 h-4 mr-1" /> Adicionar outro perfume
            </Button>
          </div>

          {cart.length > 0 && (
            <>
              <div className="rounded-xl bg-primary/10 border border-primary/30 p-3 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Custo total</span>
                  <span>R$ {totalCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total da venda</span>
                  <span className="text-primary font-bold text-base">R$ {total.toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-primary/20">
                  <span className="text-muted-foreground">Lucro</span>
                  <span className={cn("font-bold", profit >= 0 ? "text-success" : "text-destructive")}>
                    R$ {profit.toFixed(2)}
                  </span>
                </div>
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
                    <Banknote className="h-4 w-4 mb-1" /> Dinheiro
                  </Button>
                  <Button
                    type="button"
                    variant={paymentMethod === "card" ? "default" : "secondary"}
                    className="text-xs flex-col h-auto py-2"
                    onClick={() => setPaymentMethod("card")}
                  >
                    <CreditCard className="h-4 w-4 mb-1" /> Cartão
                  </Button>
                  <Button
                    type="button"
                    variant={paymentMethod === "split" ? "default" : "secondary"}
                    className="text-xs flex-col h-auto py-2"
                    onClick={() => setPaymentMethod("split")}
                  >
                    <SplitSquareHorizontal className="h-4 w-4 mb-1" /> 50% / 50%
                  </Button>
                </div>
              </div>

              {paymentMethod === "split" && (
                <div className="rounded-lg bg-warning/10 border border-warning/30 p-3 space-y-3">
                  <p className="text-xs text-foreground">
                    1ª parcela: <span className="font-bold text-primary">R$ {(total / 2).toFixed(2)}</span>
                    {" · "}
                    2ª parcela: <span className="font-bold text-warning">R$ {(total / 2).toFixed(2)}</span>
                  </p>

                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">1ª parcela</label>
                    <div className="inline-flex bg-card rounded-lg p-0.5 gap-0.5 border border-border">
                      <button
                        type="button"
                        onClick={() => setFirstPaid(true)}
                        className={`text-[11px] px-2.5 py-1 rounded-md font-medium ${firstPaid ? "bg-emerald-500 text-white" : "text-muted-foreground"}`}
                      >
                        Já paga
                      </button>
                      <button
                        type="button"
                        onClick={() => setFirstPaid(false)}
                        className={`text-[11px] px-2.5 py-1 rounded-md font-medium ${!firstPaid ? "bg-amber-500 text-white" : "text-muted-foreground"}`}
                      >
                        Pendente
                      </button>
                    </div>
                    {!firstPaid && (
                      <Input
                        type="date"
                        value={firstDueDate}
                        onChange={(e) => setFirstDueDate(e.target.value)}
                        className="bg-card border-border mt-1"
                      />
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">Data do 2º pagamento</label>
                    <Input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="bg-card border-border"
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
                      <label className="text-xs text-muted-foreground mb-1 block">
                        Data prevista de pagamento
                      </label>
                      <Input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="bg-card border-border"
                      />
                    </div>
                  )}
                </div>
              )}

              <Button
                className="w-full"
                disabled={finalizeSale.isPending || total <= 0}
                onClick={() => finalizeSale.mutate()}
              >
                {finalizeSale.isPending
                  ? "Registrando..."
                  : `Finalizar venda — R$ ${total.toFixed(2)}`}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ChargeMessageDialog open={chargeOpen} onOpenChange={setChargeOpen} payload={chargePayload} />
    </div>
  );
}