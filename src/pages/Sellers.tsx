import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ML_PER_FRASCO, perFrasco } from "@/lib/frascos";
import {
  Banknote,
  Box,
  Check,
  Clipboard,
  Loader2,
  PackagePlus,
  Phone,
  Plus,
  ShoppingBag,
  UserRound,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const db = supabase as any;

type Seller = {
  id: string;
  owner_id: string;
  name: string;
  phone: string | null;
  active: boolean;
  commission_per_unit: number;
  access_token: string;
  created_at: string;
};

type Product = {
  id: string;
  name: string;
  brand: string | null;
  image_url: string | null;
  current_ml: number;
  sale_price_per_ml: number;
};

type InventoryItem = {
  id: string;
  seller_id: string;
  product_id: string;
  quantity_delivered: number;
  quantity_sold: number;
  unit_price: number;
  commission_per_unit: number;
  created_at: string;
  products: Pick<Product, "id" | "name" | "brand" | "image_url"> | null;
};

type SellerSale = {
  id: string;
  seller_id: string;
  product_id: string;
  quantity: number;
  total_amount: number;
  commission_amount: number;
  amount_due_owner: number;
  customer_name: string | null;
  settled_at: string | null;
  created_at: string;
  products: Pick<Product, "id" | "name" | "brand"> | null;
};

const brl = (value: number) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

export default function Sellers() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);
  const [sellerDialog, setSellerDialog] = useState(false);
  const [deliveryDialog, setDeliveryDialog] = useState(false);
  const [sellerName, setSellerName] = useState("");
  const [sellerPhone, setSellerPhone] = useState("");
  const [sellerCommission, setSellerCommission] = useState("40");
  const [deliverySellerId, setDeliverySellerId] = useState("");
  const [deliveryProductId, setDeliveryProductId] = useState("");
  const [deliveryQuantity, setDeliveryQuantity] = useState("1");
  const [deliveryPrice, setDeliveryPrice] = useState("");
  const [deliveryCommission, setDeliveryCommission] = useState("");

  const { data: sellers = [], isLoading: sellersLoading } = useQuery<Seller[]>({
    queryKey: ["sellers"],
    queryFn: async () => {
      const { data, error } = await db.from("sellers").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["products", "seller-delivery"],
    queryFn: async () => {
      const { data, error } = await db
        .from("products")
        .select("id,name,brand,image_url,current_ml,sale_price_per_ml")
        .gte("current_ml", ML_PER_FRASCO)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: inventory = [] } = useQuery<InventoryItem[]>({
    queryKey: ["seller-inventory"],
    queryFn: async () => {
      const { data, error } = await db
        .from("seller_inventory")
        .select("*, products(id,name,brand,image_url)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: sellerSales = [] } = useQuery<SellerSale[]>({
    queryKey: ["seller-sales"],
    queryFn: async () => {
      const { data, error } = await db
        .from("seller_sales")
        .select("*, products(id,name,brand)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!selectedSellerId && sellers.length) setSelectedSellerId(sellers[0].id);
  }, [selectedSellerId, sellers]);

  const invalidateSellers = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["sellers"] }),
      queryClient.invalidateQueries({ queryKey: ["seller-inventory"] }),
      queryClient.invalidateQueries({ queryKey: ["seller-sales"] }),
      queryClient.invalidateQueries({ queryKey: ["products"] }),
    ]);
  };

  const createSeller = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Não autenticado");
      if (!sellerName.trim()) throw new Error("Informe o nome do vendedor");
      const commission = Number(sellerCommission.replace(",", "."));
      if (commission < 0) throw new Error("Comissão inválida");
      const { data, error } = await db
        .from("sellers")
        .insert({
          owner_id: user.id,
          name: sellerName.trim(),
          phone: sellerPhone.trim() || null,
          commission_per_unit: commission || 0,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as Seller;
    },
    onSuccess: async (seller) => {
      await invalidateSellers();
      setSelectedSellerId(seller.id);
      setSellerDialog(false);
      setSellerName("");
      setSellerPhone("");
      setSellerCommission("40");
      toast.success("Vendedor cadastrado");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const assignInventory = useMutation({
    mutationFn: async () => {
      const quantity = Math.floor(Number(deliveryQuantity));
      const unitPrice = Number(deliveryPrice.replace(",", "."));
      const commission = Number(deliveryCommission.replace(",", "."));
      if (!deliverySellerId || !deliveryProductId) throw new Error("Selecione vendedor e produto");
      if (quantity < 1) throw new Error("Quantidade inválida");
      if (unitPrice <= 0) throw new Error("Preço de venda inválido");
      if (commission < 0 || commission >= unitPrice)
        throw new Error("A comissão deve ser menor que o preço de venda");

      const { data, error } = await db.rpc("assign_seller_inventory", {
        p_seller_id: deliverySellerId,
        p_product_id: deliveryProductId,
        p_quantity: quantity,
        p_unit_price: unitPrice,
        p_commission_per_unit: commission,
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Não foi possível entregar o estoque");
      return data;
    },
    onSuccess: async () => {
      await invalidateSellers();
      setDeliveryDialog(false);
      setDeliveryProductId("");
      setDeliveryQuantity("1");
      setDeliveryPrice("");
      toast.success("Mercadoria entregue ao vendedor");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const settleSale = useMutation({
    mutationFn: async (saleId: string) => {
      const { error } = await db
        .from("seller_sales")
        .update({ settled_at: new Date().toISOString() })
        .eq("id", saleId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["seller-sales"] });
      toast.success("Acerto registrado");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const selectedSeller = sellers.find((seller) => seller.id === selectedSellerId) ?? null;
  const selectedInventory = inventory.filter((item) => item.seller_id === selectedSellerId);
  const selectedSales = sellerSales.filter((sale) => sale.seller_id === selectedSellerId);

  const summary = useMemo(() => {
    const unitsWithSellers = inventory.reduce(
      (sum, item) => sum + Math.max(0, Number(item.quantity_delivered) - Number(item.quantity_sold)),
      0,
    );
    const unitsSold = sellerSales.reduce((sum, sale) => sum + Number(sale.quantity), 0);
    const receivable = sellerSales
      .filter((sale) => !sale.settled_at)
      .reduce((sum, sale) => sum + Number(sale.amount_due_owner), 0);
    const commission = sellerSales.reduce(
      (sum, sale) => sum + Number(sale.commission_amount),
      0,
    );
    return { unitsWithSellers, unitsSold, receivable, commission };
  }, [inventory, sellerSales]);

  const openDelivery = (seller?: Seller) => {
    const target = seller ?? selectedSeller ?? sellers[0];
    setDeliverySellerId(target?.id ?? "");
    setDeliveryCommission(String(target?.commission_per_unit ?? 40));
    setDeliveryDialog(true);
  };

  const selectDeliveryProduct = (productId: string) => {
    setDeliveryProductId(productId);
    const product = products.find((item) => item.id === productId);
    if (product) setDeliveryPrice(perFrasco(product.sale_price_per_ml).toFixed(2));
  };

  const copySellerLink = async (seller: Seller) => {
    const url = `${window.location.origin}/vendedor/${seller.access_token}`;
    await navigator.clipboard.writeText(url);
    toast.success("Link do vendedor copiado");
  };

  if (sellersLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-0 space-y-4 max-w-lg lg:max-w-7xl mx-auto pb-28 lg:pb-8">
      <div className="rounded-3xl bg-[#111111] p-5 lg:p-6 text-white shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[#D8C7A3] text-xs uppercase tracking-[0.16em]">
              <Users className="h-4 w-4" /> Consignação
            </div>
            <h1 className="mt-2 text-2xl font-semibold">Vendedores</h1>
            <p className="mt-1 text-sm text-[#D8C7A3]">
              Controle o estoque entregue, as baixas e os acertos.
            </p>
          </div>
          <Button
            onClick={() => setSellerDialog(true)}
            className="bg-[#C8A45D] text-black hover:bg-[#D8B86B] shrink-0"
            size="sm"
          >
            <Plus className="h-4 w-4 mr-1" /> Novo
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {[
          { label: "Com vendedores", value: `${summary.unitsWithSellers} un.`, icon: Box },
          { label: "Unidades vendidas", value: String(summary.unitsSold), icon: ShoppingBag },
          { label: "A receber", value: brl(summary.receivable), icon: Banknote },
          { label: "Comissões", value: brl(summary.commission), icon: UserRound },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-border/60 bg-card p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {item.label}
              </span>
              <item.icon className="h-4 w-4 text-primary shrink-0" />
            </div>
            <p className="mt-2 text-lg font-semibold text-foreground">{item.value}</p>
          </div>
        ))}
      </div>

      {sellers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <Users className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <h2 className="mt-3 font-semibold">Nenhum vendedor cadastrado</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre o primeiro vendedor para começar a entregar mercadorias.
          </p>
          <Button className="mt-4" onClick={() => setSellerDialog(true)}>
            <Plus className="h-4 w-4 mr-1" /> Cadastrar vendedor
          </Button>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[320px_1fr] gap-4 items-start">
          <section className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-semibold">Equipe</h2>
              <span className="text-xs text-muted-foreground">{sellers.length}</span>
            </div>
            {sellers.map((seller) => {
              const stock = inventory
                .filter((item) => item.seller_id === seller.id)
                .reduce(
                  (sum, item) => sum + Number(item.quantity_delivered) - Number(item.quantity_sold),
                  0,
                );
              const due = sellerSales
                .filter((sale) => sale.seller_id === seller.id && !sale.settled_at)
                .reduce((sum, sale) => sum + Number(sale.amount_due_owner), 0);
              const active = selectedSellerId === seller.id;
              return (
                <button
                  type="button"
                  key={seller.id}
                  onClick={() => setSelectedSellerId(seller.id)}
                  className={`w-full text-left rounded-2xl border p-3.5 transition-all ${
                    active
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border/60 bg-card hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-[#111111] text-[#C8A45D] flex items-center justify-center font-semibold">
                      {seller.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{seller.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {stock} em mãos · {brl(due)} a receber
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </section>

          {selectedSeller && (
            <section className="space-y-4">
              <div className="rounded-2xl border border-border/60 bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{selectedSeller.name}</h2>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {selectedSeller.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {selectedSeller.phone}
                        </span>
                      )}
                      <span>Comissão padrão: {brl(selectedSeller.commission_per_unit)}/un.</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => copySellerLink(selectedSeller)}>
                      <Clipboard className="h-4 w-4 mr-1" /> Copiar acesso
                    </Button>
                    <Button size="sm" onClick={() => openDelivery(selectedSeller)}>
                      <PackagePlus className="h-4 w-4 mr-1" /> Entregar
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border/60 bg-card p-4">
                <h3 className="text-sm font-semibold mb-3">Mercadorias em mãos</h3>
                {selectedInventory.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Nenhuma mercadoria entregue.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedInventory.map((item) => {
                      const remaining = Number(item.quantity_delivered) - Number(item.quantity_sold);
                      return (
                        <div key={item.id} className="rounded-xl border border-border/50 p-3 flex items-center gap-3">
                          <div className="h-11 w-11 rounded-lg bg-secondary overflow-hidden shrink-0">
                            {item.products?.image_url ? (
                              <img
                                src={item.products.image_url}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center">🧴</div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{item.products?.name ?? "Produto"}</p>
                            <p className="text-[11px] text-muted-foreground">
                              Entregue: {item.quantity_delivered} · Vendido: {item.quantity_sold}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-lg font-semibold text-primary">{remaining}</p>
                            <p className="text-[10px] text-muted-foreground">em mãos</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border/60 bg-card p-4">
                <h3 className="text-sm font-semibold mb-3">Vendas informadas</h3>
                {selectedSales.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Nenhuma venda informada.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedSales.map((sale) => (
                      <div key={sale.id} className="rounded-xl border border-border/50 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {sale.quantity}× {sale.products?.name ?? "Produto"}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {format(new Date(sale.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                              {sale.customer_name ? ` · ${sale.customer_name}` : ""}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-1">
                              Venda {brl(sale.total_amount)} · Comissão {brl(sale.commission_amount)}
                            </p>
                          </div>
                          {sale.settled_at ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-1 text-[11px] font-medium">
                              <Check className="h-3 w-3" /> Acertado
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs shrink-0"
                              onClick={() => settleSale.mutate(sale.id)}
                              disabled={settleSale.isPending}
                            >
                              Receber {brl(sale.amount_due_owner)}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      <Dialog open={sellerDialog} onOpenChange={setSellerDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Novo vendedor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nome</label>
              <Input value={sellerName} onChange={(event) => setSellerName(event.target.value)} placeholder="Nome completo" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Telefone</label>
              <Input value={sellerPhone} onChange={(event) => setSellerPhone(event.target.value)} placeholder="(27) 99999-9999" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Comissão padrão por unidade</label>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={sellerCommission}
                onChange={(event) => setSellerCommission(event.target.value)}
              />
            </div>
            <Button className="w-full" onClick={() => createSeller.mutate()} disabled={createSeller.isPending}>
              {createSeller.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Cadastrar vendedor
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deliveryDialog} onOpenChange={setDeliveryDialog}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Entregar mercadoria</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Vendedor</label>
              <select
                value={deliverySellerId}
                onChange={(event) => {
                  setDeliverySellerId(event.target.value);
                  const seller = sellers.find((item) => item.id === event.target.value);
                  setDeliveryCommission(String(seller?.commission_per_unit ?? 0));
                }}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Selecione</option>
                {sellers.filter((seller) => seller.active).map((seller) => (
                  <option key={seller.id} value={seller.id}>{seller.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Produto</label>
              <select
                value={deliveryProductId}
                onChange={(event) => selectDeliveryProduct(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Selecione</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} · {Math.floor(Number(product.current_ml) / ML_PER_FRASCO)} disponíveis
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Quantidade</label>
                <Input type="number" inputMode="numeric" min="1" value={deliveryQuantity} onChange={(event) => setDeliveryQuantity(event.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Preço/unidade</label>
                <Input type="number" inputMode="decimal" min="0" step="0.01" value={deliveryPrice} onChange={(event) => setDeliveryPrice(event.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Comissão do vendedor por unidade</label>
              <Input type="number" inputMode="decimal" min="0" step="0.01" value={deliveryCommission} onChange={(event) => setDeliveryCommission(event.target.value)} />
            </div>
            <p className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
              A quantidade será retirada do estoque principal e ficará registrada em nome do vendedor.
            </p>
            <Button className="w-full" onClick={() => assignInventory.mutate()} disabled={assignInventory.isPending}>
              {assignInventory.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Confirmar entrega
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
