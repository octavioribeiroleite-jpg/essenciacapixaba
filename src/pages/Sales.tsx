import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Search, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { logMovement } from "@/lib/stockMovements";

const QUICK_SIZES = [3, 5, 10, 15];

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
  const [mode, setMode] = useState<"frasco" | "decant" | null>(null);
  const [ml, setMl] = useState("");
  const [price, setPrice] = useState("");

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,brand,total_ml,current_ml,cost_per_ml,sale_price_per_ml,image_url")
        .gt("current_ml", 0)
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
    setMode(null);
    setMl("");
    setPrice("");
    setPickerOpen(false);
  };

  const pickMode = (m: "frasco" | "decant") => {
    if (!selected) return;
    setMode(m);
    if (m === "frasco") {
      const fullMl = Number(selected.total_ml);
      setMl(String(fullMl));
      setPrice((fullMl * Number(selected.sale_price_per_ml)).toFixed(2));
    } else {
      setMl("");
      setPrice("");
    }
  };

  const setQuantity = (qty: number) => {
    if (!selected) return;
    setMl(String(qty));
    setPrice((qty * Number(selected.sale_price_per_ml)).toFixed(2));
  };

  const onMlChange = (value: string) => {
    setMl(value);
    const n = parseFloat(value);
    if (selected && !isNaN(n)) {
      setPrice((n * Number(selected.sale_price_per_ml)).toFixed(2));
    }
  };

  const sellMutation = useMutation({
    mutationFn: async () => {
      if (!selected || !user) throw new Error("Selecione um produto");
      if (!mode) throw new Error("Escolha frasco fechado ou decant");
      const mlNum = parseFloat(ml);
      const priceNum = parseFloat(price);
      if (!mlNum || mlNum <= 0) throw new Error("Informe a quantidade em ml");
      if (mlNum > Number(selected.current_ml)) throw new Error("Estoque insuficiente!");
      if (isNaN(priceNum) || priceNum < 0) throw new Error("Informe o valor da venda");

      const costPrice = mlNum * Number(selected.cost_per_ml);

      const { data: saleRow, error: saleError } = await supabase
        .from("sales")
        .insert({
          user_id: user.id,
          product_id: selected.id,
          ml_sold: mlNum,
          sale_price: priceNum,
          cost_price: costPrice,
        })
        .select("id")
        .single();
      if (saleError) throw saleError;

      const newMl = Number(selected.current_ml) - mlNum;
      const { error: updateError } = await supabase
        .from("products")
        .update({ current_ml: newMl })
        .eq("id", selected.id);
      if (updateError) throw updateError;

      await logMovement({
        userId: user.id,
        productId: selected.id,
        type: "sale",
        mlChange: -mlNum,
        mlAfter: newMl,
        note: mode === "frasco" ? "Venda (frasco fechado)" : "Venda (decant)",
        saleId: saleRow?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["sales-month"] });
      queryClient.invalidateQueries({ queryKey: ["product-sales"] });
      toast.success("Venda registrada!");
      setSelected(null);
      setMode(null);
      setMl("");
      setPrice("");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const mlNum = parseFloat(ml) || 0;
  const priceNum = parseFloat(price) || 0;
  const profit = selected ? priceNum - mlNum * Number(selected.cost_per_ml) : 0;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <ShoppingCart className="h-5 w-5 text-primary" />
        Registrar Venda
      </h1>

      <Card className="glass-card">
        <CardContent className="p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Selecione um perfume do estoque e registre a venda. O valor é preenchido automaticamente, mas você pode editar se der desconto.
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
              <p className="text-xs text-muted-foreground text-center py-6">Nenhum produto encontrado.</p>
            )}
            {filtered.map((p) => (
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
                  <p className={cn("text-sm font-bold", Number(p.current_ml) < 10 ? "text-warning" : "text-primary")}>
                    {Number(p.current_ml).toFixed(0)}ml
                  </p>
                  <p className="text-[10px] text-muted-foreground">R$ {Number(p.sale_price_per_ml).toFixed(2)}/ml</p>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Sale dialog */}
      <Dialog
        open={!!selected}
        onOpenChange={(o) => {
          if (!o) {
            setSelected(null);
            setMode(null);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">{selected?.name}</DialogTitle>
          </DialogHeader>
          {selected && !mode && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Como vai vender este perfume?
              </p>
              <button
                onClick={() => pickMode("frasco")}
                disabled={Number(selected.current_ml) < Number(selected.total_ml)}
                className="w-full text-left rounded-lg border-2 border-primary/40 bg-primary/5 p-4 hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-primary">Frasco Fechado</p>
                    <p className="text-[11px] text-muted-foreground">
                      {Number(selected.total_ml).toFixed(0)}ml completos · R${" "}
                      {(Number(selected.total_ml) * Number(selected.sale_price_per_ml)).toFixed(2)}
                    </p>
                  </div>
                  <span className="text-xl">📦</span>
                </div>
                {Number(selected.current_ml) < Number(selected.total_ml) && (
                  <p className="text-[10px] text-warning mt-1">
                    Indisponível: frasco já foi aberto.
                  </p>
                )}
              </button>
              <button
                onClick={() => pickMode("decant")}
                className="w-full text-left rounded-lg border border-border bg-secondary p-4 hover:bg-secondary/80 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-foreground">Decant</p>
                    <p className="text-[11px] text-muted-foreground">
                      Vender em ml · estoque {Number(selected.current_ml).toFixed(0)}ml
                    </p>
                  </div>
                  <span className="text-xl">🧴</span>
                </div>
              </button>
            </div>
          )}

          {selected && mode && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                <button
                  onClick={() => setMode(null)}
                  className="text-primary hover:underline mr-2"
                >
                  ← Trocar
                </button>
                <span className="font-medium text-foreground">
                  {mode === "frasco" ? "Frasco Fechado" : "Decant"}
                </span>{" · "}
                Estoque: <span className="text-foreground font-medium">{Number(selected.current_ml).toFixed(0)}ml</span>{" "}
                · Sugerido: R$ {Number(selected.sale_price_per_ml).toFixed(2)}/ml
              </p>

              {mode === "decant" && (
              <div className="grid grid-cols-4 gap-2">
                {QUICK_SIZES.map((qty) => (
                  <Button
                    key={qty}
                    variant="secondary"
                    className="text-sm font-bold"
                    disabled={qty > Number(selected.current_ml)}
                    onClick={() => setQuantity(qty)}
                  >
                    {qty}ml
                  </Button>
                ))}
              </div>
              )}

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Quantidade (ml)</label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0.1"
                  max={Number(selected.current_ml)}
                  value={ml}
                  onChange={(e) => onMlChange(e.target.value)}
                  readOnly={mode === "frasco"}
                  className="bg-secondary border-border"
                  placeholder="Ex: 5"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Valor da venda (R$)</label>
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

              {mlNum > 0 && priceNum >= 0 && (
                <div className="rounded-lg bg-secondary/60 border border-border p-3 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Custo</span>
                    <span className="text-foreground">R$ {(mlNum * Number(selected.cost_per_ml)).toFixed(2)}</span>
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
                disabled={sellMutation.isPending || !ml || !price}
                onClick={() => sellMutation.mutate()}
              >
                {sellMutation.isPending ? "Registrando..." : "Confirmar Venda"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}