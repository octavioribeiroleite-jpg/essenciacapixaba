import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  getActorContext,
  isSellerCoreReady,
  sellerDb,
  type ActorContext,
  type CommissionKind,
  type CustomerRow,
  type SellerRow,
  type StockLocationRow,
  type VariantCatalogRow,
} from "@/integrations/supabase/sellerDb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  ArrowLeftRight,
  Boxes,
  History,
  Loader2,
  ShoppingBag,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { normalizePhone } from "@/lib/commission";

const brl = (value: number) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const shortId = (value: string) => value.slice(0, 8);

function rpcError(error: unknown, fallback: string) {
  const message =
    typeof error === "object" && error && "message" in error
      ? String(error.message)
      : fallback;
  toast.error(message);
}

function SetupBanner() {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
      <div>
        <p className="font-medium">Núcleo de consignação aguardando aplicação</p>
        <p className="mt-1 text-muted-foreground">
          A migration segura ainda não foi aplicada ao banco. O catálogo e as
          telas antigas continuam funcionando normalmente.
        </p>
      </div>
    </div>
  );
}

function useCoreData(enabled: boolean) {
  const sellers = useQuery({
    queryKey: ["seller-core", "sellers"],
    enabled,
    queryFn: async () => {
      const { data, error } = await sellerDb.from("sellers_v2").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const locations = useQuery({
    queryKey: ["seller-core", "locations"],
    enabled,
    queryFn: async () => {
      const { data, error } = await sellerDb.from("stock_locations").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const variants = useQuery({
    queryKey: ["seller-core", "variants"],
    enabled,
    queryFn: async () => {
      const { data, error } = await sellerDb
        .from("v_variant_catalog")
        .select("*")
        .eq("active", true)
        .order("product_name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const stock = useQuery({
    queryKey: ["seller-core", "stock"],
    enabled,
    queryFn: async () => {
      const { data, error } = await sellerDb.from("v_available_stock").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
  const customers = useQuery({
    queryKey: ["seller-core", "customers"],
    enabled,
    queryFn: async () => {
      const { data, error } = await sellerDb.from("customers").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const transfers = useQuery({
    queryKey: ["seller-core", "transfers"],
    enabled,
    queryFn: async () => {
      const { data, error } = await sellerDb
        .from("transfers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const sales = useQuery({
    queryKey: ["seller-core", "sales"],
    enabled,
    queryFn: async () => {
      const { data, error } = await sellerDb
        .from("sales_v2")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const settlements = useQuery({
    queryKey: ["seller-core", "settlements"],
    enabled,
    queryFn: async () => {
      const { data, error } = await sellerDb
        .from("settlements")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const commissions = useQuery({
    queryKey: ["seller-core", "commissions"],
    enabled,
    queryFn: async () => {
      const { data, error } = await sellerDb.from("v_seller_commission").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });
  return { sellers, locations, variants, stock, customers, transfers, sales, settlements, commissions };
}

type CoreData = ReturnType<typeof useCoreData>;

function SellersTab({ context, data }: { context: ActorContext; data: CoreData }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<SellerRow | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    active: true,
    commission_kind: "fixed_per_unit" as CommissionKind,
    commission_value: "0",
  });

  const save = useMutation({
    mutationFn: async () => {
      const commissionValue = Number(form.commission_value);
      if (!form.name.trim()) throw new Error("Informe o nome");
      if (commissionValue < 0) throw new Error("Comissão inválida");
      if (form.commission_kind === "profit_percentage" && commissionValue > 100) {
        throw new Error("O percentual não pode ultrapassar 100%");
      }
      const payload = {
        owner_id: context.owner_id,
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: normalizePhone(form.phone),
        active: form.active,
        commission_kind: form.commission_kind,
        commission_value: commissionValue,
      };
      const result = editing
        ? await sellerDb.from("sellers_v2").update(payload).eq("id", editing.id)
        : await sellerDb.from("sellers_v2").insert(payload);
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      toast.success(editing ? "Vendedor atualizado" : "Vendedor cadastrado");
      setEditing(null);
      setForm({
        name: "",
        email: "",
        phone: "",
        active: true,
        commission_kind: "fixed_per_unit",
        commission_value: "0",
      });
      queryClient.invalidateQueries({ queryKey: ["seller-core"] });
    },
    onError: (error) => rpcError(error, "Falha ao salvar vendedor"),
  });

  const startEdit = (seller: SellerRow) => {
    setEditing(seller);
    setForm({
      name: seller.name,
      email: seller.email ?? "",
      phone: seller.phone ?? "",
      active: seller.active,
      commission_kind: seller.commission_kind,
      commission_value: String(seller.commission_value),
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form
        className="space-y-3 rounded-lg border border-border/60 bg-card/60 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <h3 className="text-lg font-semibold">{editing ? "Editar vendedor" : "Novo vendedor"}</h3>
        <div>
          <Label>Nome</Label>
          <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>E-mail de acesso</Label>
            <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Comissão</Label>
            <Select
              value={form.commission_kind}
              onValueChange={(value) => setForm({ ...form, commission_kind: value as CommissionKind })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed_per_unit">Fixa por unidade</SelectItem>
                <SelectItem value="profit_percentage">% do lucro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{form.commission_kind === "fixed_per_unit" ? "R$ por unidade" : "Percentual"}</Label>
            <Input type="number" min="0" max={form.commission_kind === "profit_percentage" ? 100 : undefined} step="0.01"
              value={form.commission_value}
              onChange={(event) => setForm({ ...form, commission_value: event.target.value })} />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-md border p-3">
          <Label>Ativo</Label>
          <Switch checked={form.active} onCheckedChange={(active) => setForm({ ...form, active })} />
        </div>
        <div className="flex gap-2">
          <Button disabled={save.isPending}>{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar</Button>
          {editing && <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>}
        </div>
      </form>

      <div className="rounded-lg border border-border/60 bg-card/60 p-4">
        <h3 className="mb-3 text-lg font-semibold">Vendedores</h3>
        <div className="space-y-2">
          {(data.sellers.data ?? []).map((seller) => (
            <button
              type="button"
              key={seller.id}
              className="w-full rounded-md border p-3 text-left hover:bg-accent"
              onClick={() => startEdit(seller)}
            >
              <div className="flex justify-between gap-3">
                <span className="font-medium">{seller.name}</span>
                <span className="text-xs text-muted-foreground">{seller.active ? "ativo" : "inativo"}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {seller.email ?? "sem acesso"} ·{" "}
                {seller.commission_kind === "fixed_per_unit"
                  ? `${brl(seller.commission_value)} por unidade`
                  : `${seller.commission_value}% do lucro`}
              </p>
            </button>
          ))}
          {!data.sellers.isLoading && !(data.sellers.data?.length) && (
            <p className="text-sm text-muted-foreground">Nenhum vendedor cadastrado.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StockTab({ context, data }: { context: ActorContext; data: CoreData }) {
  const queryClient = useQueryClient();
  const [variantId, setVariantId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [kind, setKind] = useState("restock");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");

  const variantMap = useMemo(
    () => new Map((data.variants.data ?? []).map((item) => [item.id, item])),
    [data.variants.data],
  );
  const locationMap = useMemo(
    () => new Map((data.locations.data ?? []).map((item) => [item.id, item])),
    [data.locations.data],
  );

  const adjust = useMutation({
    mutationFn: async () => {
      const raw = Number(quantity);
      const signed = kind === "loss" ? -Math.abs(raw) : raw;
      if (!variantId || !locationId || !raw) throw new Error("Preencha variante, local e quantidade");
      const { error } = await sellerDb.rpc("rpc_adjust_stock" as never, {
        p_variant: variantId,
        p_location: locationId,
        p_kind: kind,
        p_quantity: signed,
        p_note: note || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Movimento registrado");
      setQuantity("");
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["seller-core"] });
    },
    onError: (error) => rpcError(error, "Falha no ajuste"),
  });

  return (
    <div className="space-y-4">
      {context.role === "admin" && (
        <form
          className="grid gap-3 rounded-lg border border-border/60 bg-card/60 p-4 md:grid-cols-5"
          onSubmit={(event) => {
            event.preventDefault();
            adjust.mutate();
          }}
        >
          <div>
            <Label>Produto</Label>
            <VariantSelect variants={data.variants.data ?? []} value={variantId} onChange={setVariantId} />
          </div>
          <div>
            <Label>Local</Label>
            <LocationSelect locations={data.locations.data ?? []} value={locationId} onChange={setLocationId} />
          </div>
          <div>
            <Label>Movimento</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="restock">Entrada</SelectItem>
                <SelectItem value="return">Devolução</SelectItem>
                <SelectItem value="loss">Perda</SelectItem>
                <SelectItem value="adjustment">Ajuste</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Quantidade</Label>
            <Input type="number" min="0" step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </div>
          <div className="flex items-end"><Button className="w-full" disabled={adjust.isPending}>Registrar</Button></div>
          <Input className="md:col-span-5" placeholder="Observação" value={note} onChange={(event) => setNote(event.target.value)} />
        </form>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(data.stock.data ?? []).map((row) => {
          const variant = variantMap.get(row.variant_id);
          const location = locationMap.get(row.location_id);
          return (
            <div key={`${row.location_id}-${row.variant_id}`} className="rounded-lg border bg-card/60 p-4">
              <p className="font-medium">{variant?.product_name ?? shortId(row.variant_id)}</p>
              <p className="text-xs text-muted-foreground">
                {variant?.brand ?? "—"} · {variant?.volume_ml ?? "—"} ml · {location?.name ?? shortId(row.location_id)}
              </p>
              <div className="mt-3 flex justify-between text-sm">
                <span>Saldo: <strong>{row.balance}</strong></span>
                <span>Disponível: <strong>{row.available ?? row.balance}</strong></span>
              </div>
            </div>
          );
        })}
        {!data.stock.isLoading && !(data.stock.data?.length) && (
          <p className="text-sm text-muted-foreground">Nenhum estoque lançado no novo núcleo.</p>
        )}
      </div>
    </div>
  );
}

function TransfersTab({ context, data }: { context: ActorContext; data: CoreData }) {
  const queryClient = useQueryClient();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [variant, setVariant] = useState("");
  const [quantity, setQuantity] = useState("");

  const run = useMutation({
    mutationFn: async (action: "create" | "receive" | "cancel" | string) => {
      if (action === "create") {
        if (!from || !to || !variant || Number(quantity) <= 0) throw new Error("Preencha a transferência");
        const { error } = await sellerDb.rpc("rpc_create_transfer" as never, {
          p_from: from,
          p_to: to,
          p_items: [{ variant_id: variant, quantity: Number(quantity) }],
          p_note: null,
        } as never);
        if (error) throw error;
        return;
      }
      if (action.startsWith("receive:")) {
        const { error } = await sellerDb.rpc("rpc_receive_transfer" as never, {
          p_transfer: action.split(":")[1],
          p_received: null,
        } as never);
        if (error) throw error;
        return;
      }
      const reason = window.prompt("Justificativa do cancelamento:");
      if (!reason) throw new Error("Cancelamento não realizado");
      const { error } = await sellerDb.rpc("rpc_cancel_transfer" as never, {
        p_transfer: action.split(":")[1],
        p_reason: reason,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transferência atualizada");
      setQuantity("");
      queryClient.invalidateQueries({ queryKey: ["seller-core"] });
    },
    onError: (error) => rpcError(error, "Falha na transferência"),
  });

  const locationMap = new Map((data.locations.data ?? []).map((item) => [item.id, item.name]));

  return (
    <div className="space-y-4">
      {context.role === "admin" && (
        <form
          className="grid gap-3 rounded-lg border bg-card/60 p-4 md:grid-cols-5"
          onSubmit={(event) => {
            event.preventDefault();
            run.mutate("create");
          }}
        >
          <div><Label>Origem</Label><LocationSelect locations={data.locations.data ?? []} value={from} onChange={setFrom} /></div>
          <div><Label>Destino</Label><LocationSelect locations={data.locations.data ?? []} value={to} onChange={setTo} /></div>
          <div><Label>Produto</Label><VariantSelect variants={data.variants.data ?? []} value={variant} onChange={setVariant} /></div>
          <div><Label>Quantidade</Label><Input type="number" min="0" step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></div>
          <div className="flex items-end"><Button className="w-full">Enviar</Button></div>
        </form>
      )}
      <div className="space-y-2">
        {(data.transfers.data ?? []).map((transfer) => (
          <div key={transfer.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card/60 p-4">
            <div>
              <p className="font-medium">Transferência {shortId(transfer.id)}</p>
              <p className="text-xs text-muted-foreground">
                {locationMap.get(transfer.from_location) ?? shortId(transfer.from_location)} →{" "}
                {locationMap.get(transfer.to_location) ?? shortId(transfer.to_location)} · {transfer.status}
              </p>
            </div>
            {transfer.status === "in_transit" && (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => run.mutate(`receive:${transfer.id}`)}>Confirmar recebimento</Button>
                {context.role === "admin" && (
                  <Button size="sm" variant="outline" onClick={() => run.mutate(`cancel:${transfer.id}`)}>Cancelar</Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CustomersTab({ context, data }: { context: ActorContext; data: CoreData }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [seller, setSeller] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await sellerDb.rpc("rpc_save_customer" as never, {
        p_id: null,
        p_name: name,
        p_phone: normalizePhone(phone),
        p_email: email || null,
        p_note: null,
        p_seller: context.role === "admin" ? seller || null : null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente cadastrado");
      setName(""); setPhone(""); setEmail("");
      queryClient.invalidateQueries({ queryKey: ["seller-core", "customers"] });
    },
    onError: (error) => rpcError(error, "Falha ao salvar cliente"),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form className="space-y-3 rounded-lg border bg-card/60 p-4" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
        <h3 className="font-semibold">Novo cliente</h3>
        <Input placeholder="Nome" value={name} onChange={(event) => setName(event.target.value)} />
        <Input placeholder="Telefone" value={phone} onChange={(event) => setPhone(event.target.value)} />
        <Input type="email" placeholder="E-mail" value={email} onChange={(event) => setEmail(event.target.value)} />
        {context.role === "admin" && (
          <SellerSelect sellers={data.sellers.data ?? []} value={seller} onChange={setSeller} allowEmpty />
        )}
        <Button disabled={save.isPending}>Salvar cliente</Button>
      </form>
      <div className="space-y-2 rounded-lg border bg-card/60 p-4">
        {(data.customers.data ?? []).map((customer) => (
          <div key={customer.id} className="rounded-md border p-3">
            <p className="font-medium">{customer.name}</p>
            <p className="text-xs text-muted-foreground">{customer.phone ?? "sem telefone"} · {customer.email ?? "sem e-mail"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SalesTab({ context, data }: { context: ActorContext; data: CoreData }) {
  const queryClient = useQueryClient();
  const [location, setLocation] = useState("");
  const [seller, setSeller] = useState("");
  const [customer, setCustomer] = useState("");
  const [variant, setVariant] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      if (!location || !variant || Number(quantity) <= 0) throw new Error("Preencha local, produto e quantidade");
      const { error } = await sellerDb.rpc("rpc_register_sale" as never, {
        p_location: location,
        p_customer: customer || null,
        p_seller: context.role === "admin" ? seller || null : null,
        p_items: [{
          variant_id: variant,
          quantity: Number(quantity),
          unit_price: price ? Number(price) : null,
        }],
        p_note: null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Venda registrada");
      setQuantity(""); setPrice("");
      queryClient.invalidateQueries({ queryKey: ["seller-core"] });
    },
    onError: (error) => rpcError(error, "Falha ao registrar venda"),
  });

  return (
    <div className="space-y-4">
      <form className="grid gap-3 rounded-lg border bg-card/60 p-4 md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
        <div><Label>Local de saída</Label><LocationSelect locations={data.locations.data ?? []} value={location} onChange={setLocation} /></div>
        {context.role === "admin" && <div><Label>Vendedor</Label><SellerSelect sellers={data.sellers.data ?? []} value={seller} onChange={setSeller} allowEmpty /></div>}
        <div><Label>Cliente</Label><CustomerSelect customers={data.customers.data ?? []} value={customer} onChange={setCustomer} /></div>
        <div><Label>Produto</Label><VariantSelect variants={data.variants.data ?? []} value={variant} onChange={setVariant} /></div>
        <div><Label>Quantidade</Label><Input type="number" min="0" step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></div>
        <div><Label>Preço unitário praticado</Label><Input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Preço padrão" /></div>
        <Button className="md:col-span-3" disabled={save.isPending}><ShoppingBag className="mr-2 h-4 w-4" />Registrar venda</Button>
      </form>
      <SalesHistory context={context} data={data} />
    </div>
  );
}

function FinanceTab({ context, data }: { context: ActorContext; data: CoreData }) {
  const queryClient = useQueryClient();
  const [seller, setSeller] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Pix");

  const settle = useMutation({
    mutationFn: async () => {
      const { error } = await sellerDb.rpc("rpc_settle" as never, {
        p_seller: seller,
        p_amount: Number(amount),
        p_method: method,
        p_note: null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Repasse registrado");
      setAmount("");
      queryClient.invalidateQueries({ queryKey: ["seller-core"] });
    },
    onError: (error) => rpcError(error, "Falha no repasse"),
  });

  const commissionMap = new Map((data.commissions.data ?? []).map((row) => [row.seller_id, row]));
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(data.sellers.data ?? []).map((item) => {
          const balance = commissionMap.get(item.id);
          return (
            <div key={item.id} className="rounded-lg border bg-card/60 p-4">
              <p className="font-medium">{item.name}</p>
              <p className="mt-2 text-sm">Ganho: {brl(balance?.total_earned ?? 0)}</p>
              <p className="text-sm">Pago: {brl(balance?.total_paid ?? 0)}</p>
              <p className="font-semibold">Pendente: {brl(balance?.total_due ?? 0)}</p>
            </div>
          );
        })}
      </div>
      {context.role === "admin" && (
        <form className="grid max-w-2xl gap-3 rounded-lg border bg-card/60 p-4 sm:grid-cols-3" onSubmit={(event) => { event.preventDefault(); settle.mutate(); }}>
          <SellerSelect sellers={data.sellers.data ?? []} value={seller} onChange={setSeller} />
          <Input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Valor" />
          <Input value={method} onChange={(event) => setMethod(event.target.value)} placeholder="Forma" />
          <Button className="sm:col-span-3" disabled={!seller || !amount}>Registrar repasse</Button>
        </form>
      )}
    </div>
  );
}

function SalesHistory({ context, data }: { context: ActorContext; data: CoreData }) {
  const queryClient = useQueryClient();
  const reverse = useMutation({
    mutationFn: async (saleId: string) => {
      const reason = window.prompt("Justificativa do estorno:");
      if (!reason) throw new Error("Estorno não realizado");
      const { error } = await sellerDb.rpc("rpc_reverse_sale" as never, {
        p_sale: saleId,
        p_reason: reason,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Venda estornada");
      queryClient.invalidateQueries({ queryKey: ["seller-core"] });
    },
    onError: (error) => rpcError(error, "Falha no estorno"),
  });
  const sellerMap = new Map((data.sellers.data ?? []).map((item) => [item.id, item.name]));

  return (
    <div className="space-y-2">
      {(data.sales.data ?? []).map((sale) => (
        <div key={sale.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card/60 p-4">
          <div>
            <p className="font-medium">Venda {shortId(sale.id)} · {brl(sale.total_amount)}</p>
            <p className="text-xs text-muted-foreground">
              {sale.seller_id ? sellerMap.get(sale.seller_id) ?? shortId(sale.seller_id) : "Venda direta"} ·{" "}
              comissão {brl(sale.total_commission)} · {sale.status}
            </p>
          </div>
          {sale.status === "confirmed" && (
            <Button size="sm" variant="outline" onClick={() => reverse.mutate(sale.id)}>
              Estornar
            </Button>
          )}
        </div>
      ))}
      {context.role === "seller" && !(data.sales.data?.length) && (
        <p className="text-sm text-muted-foreground">Nenhuma venda registrada.</p>
      )}
    </div>
  );
}

function LocationSelect({ locations, value, onChange }: { locations: StockLocationRow[]; value: string; onChange: (value: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
      <SelectContent>{locations.filter((item) => item.active).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function VariantSelect({ variants, value, onChange }: { variants: VariantCatalogRow[]; value: string; onChange: (value: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
      <SelectContent>{variants.map((item) => <SelectItem key={item.id} value={item.id}>{item.product_name} · {item.volume_ml} ml</SelectItem>)}</SelectContent>
    </Select>
  );
}

function SellerSelect({ sellers, value, onChange, allowEmpty = false }: { sellers: SellerRow[]; value: string; onChange: (value: string) => void; allowEmpty?: boolean }) {
  return (
    <Select value={value || (allowEmpty ? "none" : undefined)} onValueChange={(next) => onChange(next === "none" ? "" : next)}>
      <SelectTrigger><SelectValue placeholder={allowEmpty ? "Venda direta / sem vendedor" : "Selecione o vendedor"} /></SelectTrigger>
      <SelectContent>
        {allowEmpty && <SelectItem value="none">Sem vendedor</SelectItem>}
        {sellers.filter((item) => item.active).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function CustomerSelect({ customers, value, onChange }: { customers: CustomerRow[]; value: string; onChange: (value: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Cliente opcional" /></SelectTrigger>
      <SelectContent>{customers.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
    </Select>
  );
}

export default function Sellers() {
  const { user } = useAuth();
  const [ready, setReady] = useState<boolean | null>(null);
  const [context, setContext] = useState<ActorContext | null>(null);

  useEffect(() => {
    if (!user) return;
    isSellerCoreReady().then(async (isReady) => {
      setReady(isReady);
      if (isReady) {
        try {
          setContext(await getActorContext());
        } catch (error) {
          rpcError(error, "Não foi possível identificar o perfil");
        }
      }
    });
  }, [user]);

  const data = useCoreData(ready === true && context !== null);
  if (!user) return null;

  if (ready === null) {
    return <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="mx-auto max-w-6xl p-4">
      <header className="mb-4 flex items-center gap-3">
        <Users className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Vendedores e consignação</h1>
          {context && <p className="text-xs text-muted-foreground">{context.role === "admin" ? "Acesso administrativo" : "Portal do vendedor"}</p>}
        </div>
      </header>
      {ready === false && <SetupBanner />}
      {ready === true && !context && <p className="text-sm text-muted-foreground">Carregando permissões…</p>}
      {context && (
        <Tabs defaultValue={context.role === "admin" ? "stock" : "stock"}>
          <TabsList className={`mb-4 grid h-auto w-full ${context.role === "admin" ? "grid-cols-3 md:grid-cols-7" : "grid-cols-2 md:grid-cols-5"}`}>
            <TabsTrigger value="stock"><Boxes className="mr-1 h-4 w-4" />Estoque</TabsTrigger>
            <TabsTrigger value="transfers"><ArrowLeftRight className="mr-1 h-4 w-4" />Transferências</TabsTrigger>
            <TabsTrigger value="sales"><ShoppingBag className="mr-1 h-4 w-4" />Vendas</TabsTrigger>
            <TabsTrigger value="customers"><Users className="mr-1 h-4 w-4" />Clientes</TabsTrigger>
            <TabsTrigger value="finance"><Wallet className="mr-1 h-4 w-4" />Comissões</TabsTrigger>
            {context.role === "admin" && <TabsTrigger value="sellers"><UserRound className="mr-1 h-4 w-4" />Cadastro</TabsTrigger>}
            {context.role === "admin" && <TabsTrigger value="history"><History className="mr-1 h-4 w-4" />Histórico</TabsTrigger>}
          </TabsList>
          <TabsContent value="stock"><StockTab context={context} data={data} /></TabsContent>
          <TabsContent value="transfers"><TransfersTab context={context} data={data} /></TabsContent>
          <TabsContent value="sales"><SalesTab context={context} data={data} /></TabsContent>
          <TabsContent value="customers"><CustomersTab context={context} data={data} /></TabsContent>
          <TabsContent value="finance"><FinanceTab context={context} data={data} /></TabsContent>
          {context.role === "admin" && <TabsContent value="sellers"><SellersTab context={context} data={data} /></TabsContent>}
          {context.role === "admin" && <TabsContent value="history"><SalesHistory context={context} data={data} /></TabsContent>}
        </Tabs>
      )}
    </div>
  );
}
