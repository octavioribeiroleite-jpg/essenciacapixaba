import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { ArrowLeft, Plus, Search, Trash2, PackagePlus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ML_PER_FRASCO, formatFrascos, perFrasco } from "@/lib/frascos";
import { logMovement } from "@/lib/stockMovements";

interface Product {
  id: string;
  name: string;
  brand: string | null;
  image_url: string | null;
  current_ml: number;
  cost_per_ml: number;
}

interface Item {
  productId: string;
  qty: number;
}

export default function Restock() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<Item[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,brand,image_url,current_ml,cost_per_ml")
        .order("name");
      if (error) throw error;
      return data as Product[];
    },
    enabled: !!user,
  });

  const productMap = useMemo(() => {
    const m = new Map<string, Product>();
    products?.forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);

  const update = (id: string, qty: number) =>
    setItems((arr) =>
      arr.map((it) => (it.productId === id ? { ...it, qty: Math.max(0, qty) } : it))
    );

  const remove = (id: string) =>
    setItems((arr) => arr.filter((it) => it.productId !== id));

  const addProduct = (p: Product) => {
    if (items.some((it) => it.productId === p.id)) {
      toast.info("Já está na lista");
      return;
    }
    setItems([...items, { productId: p.id, qty: 1 }]);
    setAddOpen(false);
    setSearch("");
  };

  const valid = items.filter((it) => it.qty > 0 && productMap.has(it.productId));
  const totalFrascos = valid.reduce((s, it) => s + it.qty, 0);
  const totalCost = valid.reduce((s, it) => {
    const p = productMap.get(it.productId)!;
    return s + perFrasco(p.cost_per_ml) * it.qty;
  }, 0);

  const filtered = (products ?? []).filter(
    (p) =>
      !items.some((it) => it.productId === p.id) &&
      (p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.brand ?? "").toLowerCase().includes(search.toLowerCase()))
  );

  const save = async () => {
    if (!user || !valid.length) {
      toast.error("Adicione pelo menos um perfume");
      return;
    }
    setSaving(true);
    try {
      for (const it of valid) {
        const p = productMap.get(it.productId)!;
        const add = it.qty * ML_PER_FRASCO;
        const newMl = Number(p.current_ml) + add;
        const { error } = await supabase
          .from("products")
          .update({ current_ml: newMl })
          .eq("id", p.id);
        if (error) throw error;
        await logMovement({
          userId: user.id,
          productId: p.id,
          type: "restock",
          mlChange: add,
          mlAfter: newMl,
          note: note.trim() || `Compra: ${it.qty} frasco(s)`,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(`${valid.length} entrada(s) registrada(s)!`);
      navigate("/products");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao registrar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 lg:p-0 space-y-4 max-w-2xl mx-auto pb-32 lg:pb-8">
      <div className="fade-in pt-2 flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-8 w-8">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <PackagePlus className="w-5 h-5 text-primary" /> Registrar compra
          </h1>
          <p className="text-xs text-muted-foreground">
            Adicione vários perfumes que você comprou de uma vez
          </p>
        </div>
      </div>

      <button
        onClick={() => setAddOpen(true)}
        className="fade-in w-full flex items-center gap-2 bg-card border border-dashed border-primary/40 rounded-2xl px-4 py-3 text-left hover:border-primary hover:bg-primary/5 transition-colors"
      >
        <Search className="w-4 h-4 text-primary shrink-0" />
        <span className="text-sm text-muted-foreground flex-1">
          Buscar perfume para adicionar…
        </span>
        <span className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
          <Plus className="w-4 h-4" />
        </span>
      </button>

      {valid.length === 0 && (
        <div className="text-center py-10 bg-card rounded-2xl border border-border/60 space-y-2">
          <p className="text-3xl">📦</p>
          <p className="text-sm text-muted-foreground">
            Nenhum item ainda. Toque acima para buscar perfumes.
          </p>
        </div>
      )}

      <div className="space-y-2 fade-in">
        {items.map((it) => {
          const p = productMap.get(it.productId);
          if (!p) return null;
          const cost = perFrasco(p.cost_per_ml);
          const subtotal = cost * it.qty;
          return (
            <div
              key={p.id}
              className="bg-card rounded-2xl border border-border/60 p-3 flex gap-3 items-center"
            >
              <div className="w-14 h-14 rounded-xl bg-secondary overflow-hidden flex-shrink-0 flex items-center justify-center">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-lg font-bold text-muted-foreground/40">
                    {p.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-0.5">
                <p className="text-sm font-semibold text-foreground truncate">{p.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {p.brand || "Sem marca"} · estoque atual {formatFrascos(p.current_ml)}
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

      {valid.length > 0 && (
        <Textarea
          placeholder="Observação (opcional) — ex: NF 123, Fornecedor X"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="text-sm"
          rows={2}
        />
      )}

      {valid.length > 0 && (
        <div className="fixed lg:sticky bottom-20 lg:bottom-0 left-0 right-0 lg:rounded-2xl p-3 bg-card border-t lg:border border-border shadow-lg z-30 max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-[11px] text-muted-foreground">
                {totalFrascos} {totalFrascos === 1 ? "frasco" : "frascos"} ·{" "}
                {valid.length} {valid.length === 1 ? "item" : "itens"}
              </p>
              <p className="text-lg font-bold text-primary">R$ {totalCost.toFixed(2)}</p>
            </div>
          </div>
          <Button
            onClick={save}
            disabled={saving}
            className="w-full gap-1.5 h-11 bg-primary text-primary-foreground"
          >
            <Check className="w-4 h-4" />
            {saving ? "Registrando..." : "Registrar entrada no estoque"}
          </Button>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Adicionar perfume</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm h-9"
            autoFocus
          />
          <div className="max-h-80 overflow-y-auto space-y-1">
            {filtered.slice(0, 50).map((p) => (
              <button
                key={p.id}
                onClick={() => addProduct(p)}
                className="w-full text-left flex items-center gap-2 p-2 rounded-lg hover:bg-secondary"
              >
                <div className="w-9 h-9 rounded-lg bg-secondary overflow-hidden flex items-center justify-center shrink-0">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold text-muted-foreground/40">
                      {p.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {p.brand || "Sem marca"} · estoque {formatFrascos(p.current_ml)}
                  </p>
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-center text-muted-foreground py-6">
                Nenhum perfume encontrado.
              </p>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground text-center">
            Não achou? Cadastre primeiro em Produtos → Novo.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}