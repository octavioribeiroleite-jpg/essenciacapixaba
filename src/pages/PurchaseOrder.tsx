import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { ArrowLeft, Copy, MessageCircle, Plus, Trash2, ShoppingCart, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ML_PER_FRASCO, formatFrascos, perFrasco } from "@/lib/frascos";
import {
  classifyProducts,
  suggestedQuantity,
  TIER_ORDER,
  Classification,
} from "@/lib/productClassification";
import { ClassificationDot } from "@/components/ClassificationDot";

interface Product {
  id: string;
  name: string;
  brand: string | null;
  image_url: string | null;
  current_ml: number;
  cost_per_ml: number;
  created_at: string;
}

interface OrderItem {
  productId: string;
  qty: number;
}

const WHATSAPP_NUMBER = "5527988767528";

export default function PurchaseOrder() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<OrderItem[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState("");

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data as Product[];
    },
    enabled: !!user,
  });

  const { data: sales } = useQuery({
    queryKey: ["sales-classification"],
    queryFn: async () => {
      const since = new Date(Date.now() - 60 * 86400000).toISOString();
      const { data, error } = await supabase
        .from("sales")
        .select("product_id, ml_sold, created_at")
        .gte("created_at", since);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // IDs de produtos que já foram comprados (têm entrada em estoque)
  const { data: purchasedIds } = useQuery({
    queryKey: ["purchased-product-ids"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("product_id")
        .eq("type", "in");
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.product_id as string));
    },
    enabled: !!user,
  });

  const classifications = useMemo(
    () => classifyProducts(products ?? [], sales ?? []),
    [products, sales]
  );

  // Apenas perfumes que já foram comprados antes
  const purchasedProducts = useMemo(
    () => (products ?? []).filter((p) => purchasedIds?.has(p.id)),
    [products, purchasedIds]
  );

  // Lista inicial automática: estoque <= 1 frasco E não vermelho
  const initial = useMemo<OrderItem[]>(() => {
    if (!purchasedProducts.length) return [];
    return purchasedProducts
      .filter((p) => {
        const c = classifications.get(p.id);
        const frascos = Number(p.current_ml) / ML_PER_FRASCO;
        return frascos <= 1 && c?.tier !== "red";
      })
      .sort((a, b) => {
        const ca = classifications.get(a.id);
        const cb = classifications.get(b.id);
        const tierDiff = (TIER_ORDER[ca?.tier ?? "gray"]) - (TIER_ORDER[cb?.tier ?? "gray"]);
        if (tierDiff !== 0) return tierDiff;
        const stockDiff = Number(a.current_ml) - Number(b.current_ml);
        if (stockDiff !== 0) return stockDiff;
        return a.name.localeCompare(b.name);
      })
      .map((p) => ({
        productId: p.id,
        qty: suggestedQuantity(classifications.get(p.id)?.tier ?? "gray"),
      }));
  }, [purchasedProducts, classifications]);

  const order = items ?? initial;

  const productMap = useMemo(() => {
    const m = new Map<string, Product>();
    products?.forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);

  const update = (productId: string, qty: number) => {
    const next = (items ?? initial).map((it) =>
      it.productId === productId ? { ...it, qty: Math.max(0, qty) } : it
    );
    setItems(next);
  };

  const remove = (productId: string) => {
    setItems((items ?? initial).filter((it) => it.productId !== productId));
  };

  const addProduct = (p: Product) => {
    if (order.some((it) => it.productId === p.id)) {
      toast.info("Este perfume já está no pedido");
      return;
    }
    const qty = suggestedQuantity(classifications.get(p.id)?.tier ?? "gray");
    setItems([...order, { productId: p.id, qty }]);
    setAddOpen(false);
    setAddSearch("");
  };

  const validItems = order.filter((it) => it.qty > 0 && productMap.has(it.productId));
  const totalFrascos = validItems.reduce((s, it) => s + it.qty, 0);
  const totalCost = validItems.reduce((s, it) => {
    const p = productMap.get(it.productId)!;
    return s + perFrasco(p.cost_per_ml) * it.qty;
  }, 0);

  const buildMessage = () => {
    const date = new Date().toLocaleDateString("pt-BR");
    const lines = validItems.map((it, i) => {
      const p = productMap.get(it.productId)!;
      const brand = p.brand ? ` (${p.brand})` : "";
      return `${i + 1}. ${p.name}${brand} — ${it.qty} ${it.qty === 1 ? "frasco" : "frascos"}`;
    });
    return [
      "*Pedido de Reposição - Essência Capixaba*",
      `Data: ${date}`,
      "",
      ...lines,
      "",
      `Total: ${totalFrascos} ${totalFrascos === 1 ? "frasco" : "frascos"}`,
      `Valor estimado: R$ ${totalCost.toFixed(2)}`,
      "",
      "Obrigada!",
    ].join("\n");
  };

  const copyMessage = async () => {
    if (!validItems.length) {
      toast.error("Adicione pelo menos um perfume ao pedido");
      return;
    }
    await navigator.clipboard.writeText(buildMessage());
    toast.success("Mensagem copiada!");
  };

  const sendWhatsApp = () => {
    if (!validItems.length) {
      toast.error("Adicione pelo menos um perfume ao pedido");
      return;
    }
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(buildMessage())}`;
    window.open(url, "_blank");
  };

  const availableToAdd =
    purchasedProducts.filter(
      (p) =>
        !order.some((it) => it.productId === p.id) &&
        (p.name.toLowerCase().includes(addSearch.toLowerCase()) ||
          (p.brand ?? "").toLowerCase().includes(addSearch.toLowerCase()))
    );

  return (
    <div className="p-4 lg:p-0 space-y-4 max-w-2xl mx-auto pb-32 lg:pb-8">
      <div className="fade-in pt-2 flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-primary" /> Encomenda
          </h1>
          <p className="text-xs text-muted-foreground">
            Sugestão baseada em estoque baixo + giro dos últimos 60 dias
          </p>
        </div>
      </div>

      <div className="fade-in flex gap-2 text-[10px]">
        <Badge color="bg-emerald-500" label="Alta demanda (3+ vendas)" />
        <Badge color="bg-amber-400" label="Demanda média" />
        <Badge color="bg-red-500" label="Sem giro" />
      </div>

      <button
        onClick={() => setAddOpen(true)}
        className="fade-in w-full flex items-center gap-2 bg-card border border-dashed border-primary/40 rounded-2xl px-4 py-3 text-left hover:border-primary hover:bg-primary/5 transition-colors"
      >
        <Search className="w-4 h-4 text-primary shrink-0" />
        <span className="text-sm text-muted-foreground flex-1">
          Buscar perfume para adicionar ao pedido…
        </span>
        <span className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
          <Plus className="w-4 h-4" />
        </span>
      </button>

      {validItems.length === 0 && (
        <div className="text-center py-10 bg-card rounded-2xl border border-border/60 space-y-2">
          <p className="text-3xl">🎉</p>
          <p className="text-sm text-muted-foreground">
            Nenhum perfume precisando de reposição agora.
          </p>
        </div>
      )}

      <div className="space-y-2 fade-in">
        {order.map((it) => {
          const p = productMap.get(it.productId);
          if (!p) return null;
          const c = classifications.get(p.id);
          const cost = perFrasco(p.cost_per_ml);
          const subtotal = cost * it.qty;
          return (
            <div
              key={p.id}
              className="bg-card rounded-2xl border border-border/60 p-3 flex gap-3 items-center"
            >
              <div className="w-14 h-14 rounded-xl bg-secondary overflow-hidden flex-shrink-0 flex items-center justify-center relative">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-lg font-bold text-muted-foreground/40">
                    {p.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="absolute -top-1 -right-1">
                  <ClassificationDot c={c} />
                </span>
              </div>

              <div className="flex-1 min-w-0 space-y-0.5">
                <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {p.brand || "Sem marca"} · {c?.salesCount ?? 0} vendas/60d · estoque{" "}
                  {formatFrascos(p.current_ml)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  R$ {cost.toFixed(2)}/fr · Subtotal{" "}
                  <span className="font-semibold text-foreground">
                    R$ {subtotal.toFixed(2)}
                  </span>
                </p>
              </div>

              <div className="flex flex-col items-end gap-1.5">
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7 rounded-lg"
                    onClick={() => update(p.id, it.qty - 1)}
                  >
                    −
                  </Button>
                  <Input
                    type="number"
                    min={0}
                    value={it.qty}
                    onChange={(e) => update(p.id, parseInt(e.target.value) || 0)}
                    className="w-12 h-7 text-center text-sm p-1"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7 rounded-lg"
                    onClick={() => update(p.id, it.qty + 1)}
                  >
                    +
                  </Button>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-red-500 hover:text-red-600"
                  onClick={() => remove(p.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {validItems.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAddOpen(true)}
          className="w-full gap-1.5 text-xs h-9"
        >
          <Plus className="w-3.5 h-3.5" /> Adicionar outro perfume
        </Button>
      )}

      {validItems.length > 0 && (
        <div className="fixed lg:sticky bottom-20 lg:bottom-0 left-0 right-0 lg:rounded-2xl p-3 bg-card border-t lg:border border-border shadow-lg z-30 max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-[11px] text-muted-foreground">
                {totalFrascos} {totalFrascos === 1 ? "frasco" : "frascos"} ·{" "}
                {validItems.length} {validItems.length === 1 ? "item" : "itens"}
              </p>
              <p className="text-lg font-bold text-primary">R$ {totalCost.toFixed(2)}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={copyMessage} className="flex-1 gap-1.5 h-10">
              <Copy className="w-4 h-4" /> Copiar
            </Button>
            <Button
              onClick={sendWhatsApp}
              className="flex-1 gap-1.5 h-10 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <MessageCircle className="w-4 h-4" /> WhatsApp
            </Button>
          </div>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Adicionar perfume</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Buscar..."
            value={addSearch}
            onChange={(e) => setAddSearch(e.target.value)}
            className="text-sm h-9"
          />
          <div className="max-h-80 overflow-y-auto space-y-1">
            {availableToAdd.slice(0, 50).map((p) => {
              const c = classifications.get(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => addProduct(p)}
                  className="w-full text-left flex items-center gap-2 p-2 rounded-lg hover:bg-secondary"
                >
                  <ClassificationDot c={c} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {p.brand || "Sem marca"} · estoque {formatFrascos(p.current_ml)} ·{" "}
                      {c?.salesCount ?? 0} vendas/60d
                    </p>
                  </div>
                </button>
              );
            })}
            {availableToAdd.length === 0 && (
              <p className="text-xs text-center text-muted-foreground py-6">
                Nenhum perfume disponível.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Badge({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 bg-card border border-border/60 rounded-full px-2 py-0.5 text-muted-foreground">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}