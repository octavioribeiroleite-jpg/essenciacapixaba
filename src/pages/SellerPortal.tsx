import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Banknote, CheckCircle2, Loader2, Package, ShoppingBag, UserRound } from "lucide-react";
import { toast } from "sonner";

const db = supabase as any;

type PortalInventory = {
  inventory_id: string;
  product_id: string;
  name: string;
  brand: string | null;
  image_url: string | null;
  quantity_delivered: number;
  quantity_sold: number;
  quantity_available: number;
  unit_price: number;
  commission_per_unit: number;
};

type PortalData = {
  seller: {
    id: string;
    name: string;
  };
  inventory: PortalInventory[];
  totals: {
    quantity_available: number;
    quantity_sold: number;
    amount_due_owner: number;
  };
};

const brl = (value: number) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

export default function SellerPortal() {
  const { token = "" } = useParams();
  const queryClient = useQueryClient();
  const [selectedItem, setSelectedItem] = useState<PortalInventory | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [customerName, setCustomerName] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<PortalData>({
    queryKey: ["seller-portal", token],
    queryFn: async () => {
      const { data: portal, error: portalError } = await db.rpc("get_seller_portal", {
        p_access_token: token,
      });
      if (portalError) throw portalError;
      if (!portal?.ok) throw new Error(portal?.error || "Acesso inválido");
      return portal.data as PortalData;
    },
    enabled: !!token,
    retry: false,
  });

  const recordSale = useMutation({
    mutationFn: async () => {
      if (!selectedItem) throw new Error("Produto não selecionado");
      const saleQuantity = Math.floor(Number(quantity));
      if (saleQuantity < 1 || saleQuantity > selectedItem.quantity_available)
        throw new Error("Quantidade inválida");

      const { data: result, error: saleError } = await db.rpc("record_seller_sale", {
        p_access_token: token,
        p_inventory_id: selectedItem.inventory_id,
        p_quantity: saleQuantity,
        p_customer_name: customerName.trim() || null,
      });
      if (saleError) throw saleError;
      if (!result?.ok) throw new Error(result?.error || "Não foi possível registrar a venda");
      return result;
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["seller-portal", token] });
      const amount = brl(result.total_amount);
      setSuccessMessage(`Venda registrada: ${quantity} unidade(s), total de ${amount}.`);
      setSelectedItem(null);
      setQuantity("1");
      setCustomerName("");
      toast.success("Baixa realizada com sucesso");
    },
    onError: (saleError: Error) => toast.error(saleError.message),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F5EF]">
        <Loader2 className="h-8 w-8 animate-spin text-[#9B7A37]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#F7F5EF] px-4 flex items-center justify-center">
        <div className="max-w-sm w-full rounded-3xl border border-red-200 bg-white p-7 text-center shadow-sm">
          <UserRound className="mx-auto h-10 w-10 text-red-400" />
          <h1 className="mt-3 text-lg font-semibold">Acesso indisponível</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Este link não é válido ou o vendedor está inativo. Solicite um novo acesso.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F5EF] pb-10">
      <header className="bg-[#111111] text-white px-4 pt-6 pb-9">
        <div className="max-w-lg mx-auto">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#C8A45D]">Essência Capixaba</p>
          <h1 className="mt-2 text-2xl font-semibold">Olá, {data.seller.name}</h1>
          <p className="mt-1 text-sm text-[#D8C7A3]">Registre aqui cada produto vendido.</p>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 -mt-5 space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-[#E7E1D4] bg-white p-3 shadow-sm">
            <Package className="h-4 w-4 text-[#9B7A37]" />
            <p className="mt-2 text-xl font-semibold">{data.totals.quantity_available}</p>
            <p className="text-[10px] text-muted-foreground">em mãos</p>
          </div>
          <div className="rounded-2xl border border-[#E7E1D4] bg-white p-3 shadow-sm">
            <ShoppingBag className="h-4 w-4 text-emerald-600" />
            <p className="mt-2 text-xl font-semibold">{data.totals.quantity_sold}</p>
            <p className="text-[10px] text-muted-foreground">vendidos</p>
          </div>
          <div className="rounded-2xl border border-[#E7E1D4] bg-white p-3 shadow-sm">
            <Banknote className="h-4 w-4 text-blue-600" />
            <p className="mt-2 text-sm font-semibold leading-6">{brl(data.totals.amount_due_owner)}</p>
            <p className="text-[10px] text-muted-foreground">a repassar</p>
          </div>
        </div>

        {successMessage && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 flex items-start gap-2 text-emerald-800">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <p className="text-sm">{successMessage}</p>
          </div>
        )}

        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold">Mercadorias em mãos</h2>
            <span className="text-xs text-muted-foreground">Toque para dar baixa</span>
          </div>

          {data.inventory.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#D8D1C3] bg-white p-8 text-center">
              <Package className="mx-auto h-9 w-9 text-muted-foreground/50" />
              <p className="mt-2 text-sm font-medium">Nenhum produto disponível</p>
              <p className="mt-1 text-xs text-muted-foreground">As novas entregas aparecerão aqui.</p>
            </div>
          ) : (
            data.inventory.map((item) => (
              <button
                type="button"
                key={item.inventory_id}
                onClick={() => {
                  setSelectedItem(item);
                  setQuantity("1");
                  setCustomerName("");
                  setSuccessMessage(null);
                }}
                className="w-full rounded-2xl border border-[#E7E1D4] bg-white p-3 text-left shadow-sm active:scale-[0.99] transition-transform"
              >
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 rounded-xl bg-[#F2EEE5] overflow-hidden shrink-0">
                    {item.image_url ? (
                      <img src={item.image_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-xl">🧴</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.brand || "Sem marca"}</p>
                    <p className="mt-1 text-xs">
                      Venda: <span className="font-semibold">{brl(item.unit_price)}</span>
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-2xl font-semibold text-[#9B7A37]">{item.quantity_available}</p>
                    <p className="text-[10px] text-muted-foreground">disponíveis</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </section>
      </main>

      <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar venda</DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-3">
              <div className="rounded-xl bg-secondary/60 p-3">
                <p className="font-medium">{selectedItem.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedItem.quantity_available} disponíveis · {brl(selectedItem.unit_price)} por unidade
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Quantidade vendida</label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max={selectedItem.quantity_available}
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Cliente (opcional)</label>
                <Input
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="Nome do cliente"
                  maxLength={100}
                />
              </div>
              <div className="rounded-xl border border-[#E7E1D4] bg-[#F7F5EF] p-3 flex justify-between text-sm">
                <span className="text-muted-foreground">Total da venda</span>
                <span className="font-semibold">
                  {brl((Number(quantity) || 0) * Number(selectedItem.unit_price))}
                </span>
              </div>
              <Button className="w-full" onClick={() => recordSale.mutate()} disabled={recordSale.isPending}>
                {recordSale.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Confirmar baixa
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
