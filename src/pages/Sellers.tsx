import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertCircle,
  ArrowLeftRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  History,
  Loader2,
  Plus,
  ShoppingBag,
  Trash2,
  UserRound,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import {
  getActorContext,
  isSellerCoreReady,
  sellerDb,
  type ActorContext,
  type CommissionKind,
  type CustomerRow,
  type InventoryMovementRow,
  type MovementKind,
  type SaleItemRow,
  type SellerRow,
  type StockLocationRow,
  type TransferItemRow,
  type VariantCatalogRow,
} from "@/integrations/supabase/sellerDb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { normalizePhone } from "@/lib/commission";
import { lookupCep, maskCep, maskPhone } from "@/lib/viaCep";

const brl = (value: number) =>
  Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const shortId = (value: string) => value.slice(0, 8);

const MOVEMENT_LABEL: Record<MovementKind, string> = {
  initial: "Estoque inicial",
  restock: "Entrada",
  transfer_out: "Transferência (saída)",
  transfer_in: "Transferência (entrada)",
  sale: "Venda",
  return: "Devolução",
  loss: "Perda",
  adjustment: "Ajuste",
  reversal: "Estorno",
};

function rpcError(error: unknown, fallback: string) {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? fallback)
      : fallback;
  toast.error(message);
}

function fmtDateTime(iso: string) {
  try {
    return format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return iso;
  }
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
  const transferItems = useQuery({
    queryKey: ["seller-core", "transfer-items"],
    enabled,
    queryFn: async () => {
      const { data, error } = await sellerDb.from("transfer_items").select("*");
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
  const saleItems = useQuery({
    queryKey: ["seller-core", "sale-items"],
    enabled,
    queryFn: async () => {
      const { data, error } = await sellerDb.from("sale_items").select("*");
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
  const movements = useQuery({
    queryKey: ["seller-core", "movements"],
    enabled,
    queryFn: async () => {
      const { data, error } = await sellerDb
        .from("inventory_movements")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });
  return {
    sellers,
    locations,
    variants,
    stock,
    customers,
    transfers,
    transferItems,
    sales,
    saleItems,
    settlements,
    commissions,
    movements,
  };
}

type CoreData = ReturnType<typeof useCoreData>;

// ============================================================
// Cadastro de vendedores (admin) — extendido
// ============================================================
function SellersTab({ context, data }: { context: ActorContext; data: CoreData }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<SellerRow | null>(null);
  const emptyForm = {
    name: "",
    email: "",
    phone: "",
    whatsapp: "",
    establishment_name: "",
    zip: "",
    address: "",
    active: true,
    commission_kind: "fixed_per_unit" as CommissionKind,
    commission_value: "0",
  };
  const [form, setForm] = useState(emptyForm);

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
        whatsapp: normalizePhone(form.whatsapp) || null,
        establishment_name: form.establishment_name.trim() || null,
        zip: form.zip.replace(/\D/g, "") || null,
        address: form.address.trim() || null,
        active: form.active,
        commission_kind: form.commission_kind,
        commission_value: commissionValue,
      };
      const result = editing
        ? await sellerDb.from("sellers_v2").update(payload as never).eq("id", editing.id)
        : await sellerDb.from("sellers_v2").insert(payload as never);
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      toast.success(editing ? "Vendedor atualizado" : "Vendedor cadastrado");
      setEditing(null);
      setForm(emptyForm);
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
      whatsapp: seller.whatsapp ?? "",
      establishment_name: seller.establishment_name ?? "",
      zip: seller.zip ? maskCep(seller.zip) : "",
      address: seller.address ?? "",
      active: seller.active,
      commission_kind: seller.commission_kind,
      commission_value: String(seller.commission_value),
    });
  };

  const runCepLookup = async () => {
    const info = await lookupCep(form.zip);
    if (!info) {
      toast.error("CEP não encontrado");
      return;
    }
    const line = [info.logradouro, info.bairro, info.localidade, info.uf]
      .filter(Boolean)
      .join(", ");
    setForm((prev) => ({ ...prev, address: line || prev.address }));
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
        <h3 className="text-lg font-semibold">
          {editing ? "Editar vendedor" : "Novo vendedor"}
        </h3>
        <div>
          <Label>Nome</Label>
          <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </div>
        <div>
          <Label>Estabelecimento (loja/ponto)</Label>
          <Input
            value={form.establishment_name}
            onChange={(event) => setForm({ ...form, establishment_name: event.target.value })}
            placeholder="Ex.: Perfumaria Central"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>E-mail de acesso</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: maskPhone(event.target.value) })}
            />
          </div>
        </div>
        <div>
          <Label>WhatsApp</Label>
          <Input
            value={form.whatsapp}
            onChange={(event) => setForm({ ...form, whatsapp: maskPhone(event.target.value) })}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <Label>CEP</Label>
            <div className="flex gap-2">
              <Input
                value={form.zip}
                onChange={(event) => setForm({ ...form, zip: maskCep(event.target.value) })}
                onBlur={runCepLookup}
                inputMode="numeric"
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <Label>Endereço</Label>
            <Input
              value={form.address}
              onChange={(event) => setForm({ ...form, address: event.target.value })}
              placeholder="Rua, número, bairro, cidade/UF"
            />
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
            <Input
              type="number"
              min="0"
              max={form.commission_kind === "profit_percentage" ? 100 : undefined}
              step="0.01"
              value={form.commission_value}
              onChange={(event) => setForm({ ...form, commission_value: event.target.value })}
            />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-md border p-3">
          <Label>Ativo</Label>
          <Switch checked={form.active} onCheckedChange={(active) => setForm({ ...form, active })} />
        </div>
        <div className="flex gap-2">
          <Button disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
          {editing && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditing(null);
                setForm(emptyForm);
              }}
            >
              Cancelar
            </Button>
          )}
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{seller.name}</span>
                <div className="flex flex-wrap gap-1">
                  <Badge variant={seller.active ? "default" : "secondary"}>
                    {seller.active ? "Ativo" : "Inativo"}
                  </Badge>
                  <Badge variant={seller.user_id ? "outline" : "secondary"}>
                    {seller.user_id ? "Conta vinculada" : "Aguardando acesso"}
                  </Badge>
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {seller.establishment_name ?? "Sem estabelecimento"} ·{" "}
                {seller.email ?? "sem e-mail"} ·{" "}
                {seller.commission_kind === "fixed_per_unit"
                  ? `${brl(seller.commission_value)} por unidade`
                  : `${seller.commission_value}% do lucro`}
              </p>
              {(seller.whatsapp || seller.address) && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {seller.whatsapp ? `WhatsApp ${maskPhone(seller.whatsapp)}` : ""}
                  {seller.whatsapp && seller.address ? " · " : ""}
                  {seller.address ?? ""}
                </p>
              )}
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

// ============================================================
// Estoque por local — filtros + baixo estoque
// ============================================================
const LOW_STOCK_THRESHOLD = 3;

function StockTab({ context, data }: { context: ActorContext; data: CoreData }) {
  const queryClient = useQueryClient();
  const [locFilter, setLocFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);

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

  const rows = useMemo(() => {
    const source = data.stock.data ?? [];
    const search = productFilter.trim().toLowerCase();
    return source
      .filter((row) => (locFilter === "all" ? true : row.location_id === locFilter))
      .filter((row) => {
        if (!search) return true;
        const v = variantMap.get(row.variant_id);
        return (v?.product_name ?? "").toLowerCase().includes(search)
          || (v?.brand ?? "").toLowerCase().includes(search);
      })
      .filter((row) => {
        if (!onlyLow) return true;
        const avail = row.available ?? row.balance;
        return Number(avail) <= LOW_STOCK_THRESHOLD;
      })
      .sort((a, b) => {
        const va = variantMap.get(a.variant_id)?.product_name ?? "";
        const vb = variantMap.get(b.variant_id)?.product_name ?? "";
        return va.localeCompare(vb);
      });
  }, [data.stock.data, locFilter, productFilter, onlyLow, variantMap]);

  const adjust = useMutation({
    mutationFn: async () => {
      const raw = Number(quantity);
      if (!variantId || !locationId || !raw) throw new Error("Preencha variante, local e quantidade");
      const signed = kind === "loss" ? -Math.abs(raw) : raw;
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
            <Input
              type="number"
              min="0"
              step="0.001"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button className="w-full" disabled={adjust.isPending}>Registrar</Button>
          </div>
          <Input
            className="md:col-span-5"
            placeholder="Observação"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </form>
      )}

      <div className="grid gap-3 rounded-lg border border-border/60 bg-card/60 p-4 md:grid-cols-3">
        <div>
          <Label>Local</Label>
          <Select value={locFilter} onValueChange={setLocFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os locais</SelectItem>
              {(data.locations.data ?? []).filter((l) => l.active).map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Buscar produto</Label>
          <Input
            placeholder="Nome ou marca"
            value={productFilter}
            onChange={(event) => setProductFilter(event.target.value)}
          />
        </div>
        <div className="flex items-end gap-3 rounded-md border p-3">
          <Switch checked={onlyLow} onCheckedChange={setOnlyLow} id="only-low" />
          <Label htmlFor="only-low" className="!m-0">Somente estoque baixo (≤ {LOW_STOCK_THRESHOLD})</Label>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => {
          const variant = variantMap.get(row.variant_id);
          const location = locationMap.get(row.location_id);
          const available = Number(row.available ?? row.balance);
          const isLow = available <= LOW_STOCK_THRESHOLD;
          return (
            <div
              key={`${row.location_id}-${row.variant_id}`}
              className={`rounded-lg border p-4 ${
                isLow ? "border-amber-500/50 bg-amber-500/5" : "bg-card/60"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{variant?.product_name ?? shortId(row.variant_id)}</p>
                  <p className="text-xs text-muted-foreground">
                    {variant?.brand ?? "—"} · {variant?.volume_ml ?? "—"} ml · {location?.name ?? shortId(row.location_id)}
                  </p>
                </div>
                {isLow && <Badge variant="destructive">Baixo</Badge>}
              </div>
              <div className="mt-3 flex justify-between text-sm">
                <span>Saldo: <strong>{row.balance}</strong></span>
                <span>Disponível: <strong>{available}</strong></span>
              </div>
            </div>
          );
        })}
        {!data.stock.isLoading && !rows.length && (
          <p className="text-sm text-muted-foreground">Nenhum lançamento no filtro atual.</p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Transferências — multi-item + detalhes
// ============================================================
type TransferDraftItem = { variant_id: string; quantity: string };

function TransfersTab({ context, data }: { context: ActorContext; data: CoreData }) {
  const queryClient = useQueryClient();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<TransferDraftItem[]>([{ variant_id: "", quantity: "" }]);

  const variantMap = useMemo(
    () => new Map((data.variants.data ?? []).map((item) => [item.id, item])),
    [data.variants.data],
  );
  const locationMap = useMemo(
    () => new Map((data.locations.data ?? []).map((item) => [item.id, item])),
    [data.locations.data],
  );
  const itemsByTransfer = useMemo(() => {
    const map = new Map<string, TransferItemRow[]>();
    for (const it of data.transferItems.data ?? []) {
      const arr = map.get(it.transfer_id) ?? [];
      arr.push(it);
      map.set(it.transfer_id, arr);
    }
    return map;
  }, [data.transferItems.data]);

  const create = useMutation({
    mutationFn: async () => {
      if (!from || !to) throw new Error("Selecione origem e destino");
      const payload = items
        .filter((it) => it.variant_id && Number(it.quantity) > 0)
        .map((it) => ({ variant_id: it.variant_id, quantity: Number(it.quantity) }));
      if (!payload.length) throw new Error("Adicione ao menos um item");
      const { error } = await sellerDb.rpc("rpc_create_transfer" as never, {
        p_from: from,
        p_to: to,
        p_items: payload,
        p_note: note.trim() || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transferência enviada");
      setItems([{ variant_id: "", quantity: "" }]);
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["seller-core"] });
    },
    onError: (error) => rpcError(error, "Falha ao criar transferência"),
  });

  const receive = useMutation({
    mutationFn: async (transferId: string) => {
      const { error } = await sellerDb.rpc("rpc_receive_transfer" as never, {
        p_transfer: transferId,
        p_received: null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Recebimento confirmado");
      queryClient.invalidateQueries({ queryKey: ["seller-core"] });
    },
    onError: (error) => rpcError(error, "Falha ao receber"),
  });

  const cancel = useMutation({
    mutationFn: async (transferId: string) => {
      const reason = window.prompt("Justificativa do cancelamento:");
      if (!reason || reason.trim().length < 3) throw new Error("Justificativa obrigatória (mín. 3)");
      const { error } = await sellerDb.rpc("rpc_cancel_transfer" as never, {
        p_transfer: transferId,
        p_reason: reason,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transferência cancelada");
      queryClient.invalidateQueries({ queryKey: ["seller-core"] });
    },
    onError: (error) => rpcError(error, "Falha ao cancelar"),
  });

  return (
    <div className="space-y-4">
      {context.role === "admin" && (
        <form
          className="space-y-3 rounded-lg border bg-card/60 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Origem</Label>
              <LocationSelect locations={data.locations.data ?? []} value={from} onChange={setFrom} />
            </div>
            <div>
              <Label>Destino</Label>
              <LocationSelect locations={data.locations.data ?? []} value={to} onChange={setTo} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Itens</Label>
            {items.map((item, index) => (
              <div key={index} className="grid gap-2 md:grid-cols-[1fr_140px_40px]">
                <VariantSelect
                  variants={data.variants.data ?? []}
                  value={item.variant_id}
                  onChange={(v) => setItems((prev) => prev.map((it, i) => (i === index ? { ...it, variant_id: v } : it)))}
                />
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  placeholder="Qtd"
                  value={item.quantity}
                  onChange={(event) => setItems((prev) => prev.map((it, i) => (i === index ? { ...it, quantity: event.target.value } : it)))}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setItems((prev) => [...prev, { variant_id: "", quantity: "" }])}
            >
              <Plus className="mr-1 h-4 w-4" /> Adicionar item
            </Button>
          </div>
          <Textarea placeholder="Observação (opcional)" value={note} onChange={(event) => setNote(event.target.value)} />
          <Button disabled={create.isPending}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enviar transferência
          </Button>
        </form>
      )}

      <div className="space-y-2">
        {(data.transfers.data ?? []).map((transfer) => {
          const its = itemsByTransfer.get(transfer.id) ?? [];
          return (
            <div key={transfer.id} className="rounded-lg border bg-card/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {locationMap.get(transfer.from_location)?.name ?? shortId(transfer.from_location)} →{" "}
                    {locationMap.get(transfer.to_location)?.name ?? shortId(transfer.to_location)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Criada {fmtDateTime(transfer.created_at)}
                    {transfer.received_at && ` · Recebida ${fmtDateTime(transfer.received_at)}`}
                    {transfer.cancelled_at && ` · Cancelada ${fmtDateTime(transfer.cancelled_at)}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      transfer.status === "received"
                        ? "default"
                        : transfer.status === "cancelled"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {transfer.status === "in_transit" ? "Em trânsito" : transfer.status === "received" ? "Recebida" : "Cancelada"}
                  </Badge>
                  {transfer.status === "in_transit" && (
                    <>
                      <Button size="sm" onClick={() => receive.mutate(transfer.id)}>Confirmar recebimento</Button>
                      {context.role === "admin" && (
                        <Button size="sm" variant="outline" onClick={() => cancel.mutate(transfer.id)}>
                          Cancelar
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
              {its.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm">
                  {its.map((it) => {
                    const v = variantMap.get(it.variant_id);
                    return (
                      <li key={it.id} className="flex justify-between border-t pt-1">
                        <span>{v?.product_name ?? shortId(it.variant_id)} · {v?.volume_ml ?? "—"} ml</span>
                        <span>
                          {it.received_quantity != null
                            ? `${it.received_quantity}/${it.quantity}`
                            : `${it.quantity} un`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {transfer.note && (
                <p className="mt-2 text-xs text-muted-foreground">Obs.: {transfer.note}</p>
              )}
            </div>
          );
        })}
        {!(data.transfers.data ?? []).length && (
          <p className="text-sm text-muted-foreground">Nenhuma transferência.</p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Vendas — carrinho + cadastro rápido de cliente + resumo
// ============================================================
type SaleDraftItem = { variant_id: string; quantity: string; price: string };

function useQuickCustomer(context: ActorContext, onCreated: (id: string) => void) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Informe o nome");
      const { data: created, error } = await sellerDb.rpc("rpc_save_customer" as never, {
        p_id: null,
        p_name: name.trim(),
        p_phone: normalizePhone(whatsapp),
        p_email: null,
        p_note: null,
        p_seller: context.role === "admin" ? null : context.seller_id,
      } as never);
      if (error) throw error;
      return created as unknown as string;
    },
    onSuccess: (id) => {
      toast.success("Cliente cadastrado");
      queryClient.invalidateQueries({ queryKey: ["seller-core", "customers"] });
      onCreated(id);
      setOpen(false);
      setName("");
      setWhatsapp("");
    },
    onError: (error) => rpcError(error, "Falha ao salvar cliente"),
  });

  const Trigger = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Plus className="mr-1 h-4 w-4" /> Novo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cadastro rápido</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div>
            <Label>WhatsApp</Label>
            <Input value={whatsapp} onChange={(event) => setWhatsapp(maskPhone(event.target.value))} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Cadastrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
  return Trigger;
}

function SalesTab({ context, data }: { context: ActorContext; data: CoreData }) {
  const queryClient = useQueryClient();
  const [location, setLocation] = useState("");
  const [seller, setSeller] = useState("");
  const [customer, setCustomer] = useState("");
  const [items, setItems] = useState<SaleDraftItem[]>([{ variant_id: "", quantity: "", price: "" }]);
  const [note, setNote] = useState("");
  const [lastSummary, setLastSummary] = useState<{
    amount: number;
    cost: number;
    profit: number;
    commission: number;
  } | null>(null);

  const variantMap = useMemo(
    () => new Map((data.variants.data ?? []).map((v) => [v.id, v])),
    [data.variants.data],
  );

  const draftSummary = useMemo(() => {
    const activeSeller = context.role === "admin" ? seller : context.seller_id ?? "";
    const sellerRow = (data.sellers.data ?? []).find((s) => s.id === activeSeller);
    let amount = 0;
    let cost = 0;
    let commission = 0;
    for (const it of items) {
      const v = variantMap.get(it.variant_id);
      if (!v) continue;
      const qty = Number(it.quantity);
      const price = it.price ? Number(it.price) : Number(v.unit_price);
      if (!qty || price < 0) continue;
      amount += qty * price;
      cost += qty * Number(v.unit_cost);
      if (sellerRow) {
        commission +=
          sellerRow.commission_kind === "fixed_per_unit"
            ? sellerRow.commission_value * qty
            : Math.max(0, price - Number(v.unit_cost)) * qty * (sellerRow.commission_value / 100);
      }
    }
    return { amount, cost, profit: amount - cost, commission };
  }, [items, variantMap, seller, context, data.sellers.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!location) throw new Error("Selecione o local");
      const payload = items
        .filter((it) => it.variant_id && Number(it.quantity) > 0)
        .map((it) => ({
          variant_id: it.variant_id,
          quantity: Number(it.quantity),
          unit_price: it.price ? Number(it.price) : null,
        }));
      if (!payload.length) throw new Error("Adicione ao menos um item");
      const { error } = await sellerDb.rpc("rpc_register_sale" as never, {
        p_location: location,
        p_customer: customer || null,
        p_seller: context.role === "admin" ? seller || null : null,
        p_items: payload,
        p_note: note.trim() || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Venda registrada");
      setLastSummary(draftSummary);
      setItems([{ variant_id: "", quantity: "", price: "" }]);
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["seller-core"] });
    },
    onError: (error) => rpcError(error, "Falha ao registrar venda"),
  });

  const QuickCustomer = useQuickCustomer(context, (id) => setCustomer(id));

  return (
    <div className="space-y-4">
      <form
        className="space-y-3 rounded-lg border bg-card/60 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>Local de saída</Label>
            <LocationSelect locations={data.locations.data ?? []} value={location} onChange={setLocation} />
          </div>
          {context.role === "admin" && (
            <div>
              <Label>Vendedor</Label>
              <SellerSelect sellers={data.sellers.data ?? []} value={seller} onChange={setSeller} allowEmpty />
            </div>
          )}
          <div>
            <div className="flex items-center justify-between">
              <Label>Cliente</Label>
              {QuickCustomer}
            </div>
            <CustomerSelect customers={data.customers.data ?? []} value={customer} onChange={setCustomer} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Itens</Label>
          {items.map((it, index) => (
            <div key={index} className="grid gap-2 md:grid-cols-[1fr_120px_140px_40px]">
              <VariantSelect
                variants={data.variants.data ?? []}
                value={it.variant_id}
                onChange={(v) => setItems((prev) => prev.map((x, i) => (i === index ? { ...x, variant_id: v } : x)))}
              />
              <Input
                type="number"
                min="0"
                step="0.001"
                placeholder="Qtd"
                value={it.quantity}
                onChange={(event) => setItems((prev) => prev.map((x, i) => (i === index ? { ...x, quantity: event.target.value } : x)))}
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Preço"
                value={it.price}
                onChange={(event) => setItems((prev) => prev.map((x, i) => (i === index ? { ...x, price: event.target.value } : x)))}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setItems((prev) => [...prev, { variant_id: "", quantity: "", price: "" }])}
          >
            <Plus className="mr-1 h-4 w-4" /> Adicionar item
          </Button>
        </div>

        <Textarea placeholder="Observação (opcional)" value={note} onChange={(event) => setNote(event.target.value)} />

        <div className="grid gap-2 rounded-md bg-muted/40 p-3 text-sm md:grid-cols-4">
          <div><span className="text-muted-foreground">Total:</span> <strong>{brl(draftSummary.amount)}</strong></div>
          <div><span className="text-muted-foreground">Custo:</span> {brl(draftSummary.cost)}</div>
          <div><span className="text-muted-foreground">Lucro:</span> {brl(draftSummary.profit)}</div>
          <div><span className="text-muted-foreground">Comissão:</span> {brl(draftSummary.commission)}</div>
        </div>

        <Button disabled={save.isPending}>
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <ShoppingBag className="mr-2 h-4 w-4" />
          Registrar venda
        </Button>
      </form>

      {lastSummary && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
          <strong>Última venda registrada:</strong> Total {brl(lastSummary.amount)} · Custo {brl(lastSummary.cost)} ·
          Lucro {brl(lastSummary.profit)} · Comissão {brl(lastSummary.commission)}
        </div>
      )}

      <SalesHistory context={context} data={data} />
    </div>
  );
}

// ============================================================
// Comissões / Repasses — filtros
// ============================================================
function FinanceTab({ context, data }: { context: ActorContext; data: CoreData }) {
  const queryClient = useQueryClient();
  const [seller, setSeller] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Pix");
  const [note, setNote] = useState("");

  const [filterSeller, setFilterSeller] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const settle = useMutation({
    mutationFn: async () => {
      if (!seller || !Number(amount)) throw new Error("Selecione vendedor e valor");
      const { error } = await sellerDb.rpc("rpc_settle" as never, {
        p_seller: seller,
        p_amount: Number(amount),
        p_method: method,
        p_note: note.trim() || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Repasse registrado");
      setAmount("");
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["seller-core"] });
    },
    onError: (error) => rpcError(error, "Falha no repasse"),
  });

  const reverse = useMutation({
    mutationFn: async (settlementId: string) => {
      const reason = window.prompt("Justificativa do estorno do repasse:");
      if (!reason || reason.trim().length < 3) throw new Error("Justificativa obrigatória (mín. 3)");
      const { error } = await sellerDb.rpc("rpc_reverse_settlement" as never, {
        p_settlement: settlementId,
        p_reason: reason,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Repasse estornado");
      queryClient.invalidateQueries({ queryKey: ["seller-core"] });
    },
    onError: (error) => rpcError(error, "Falha ao estornar"),
  });

  const commissionMap = new Map((data.commissions.data ?? []).map((row) => [row.seller_id, row]));
  const sellerMap = new Map((data.sellers.data ?? []).map((s) => [s.id, s.name]));

  const filtered = (data.settlements.data ?? []).filter((s) => {
    if (filterSeller !== "all" && s.seller_id !== filterSeller) return false;
    if (filterStatus !== "all" && s.status !== filterStatus) return false;
    if (filterFrom && new Date(s.created_at) < new Date(filterFrom)) return false;
    if (filterTo && new Date(s.created_at) > new Date(`${filterTo}T23:59:59`)) return false;
    return true;
  });

  const scope = context.role === "seller"
    ? (data.sellers.data ?? []).filter((s) => s.id === context.seller_id)
    : (data.sellers.data ?? []);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {scope.map((item) => {
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
        <form
          className="grid max-w-3xl gap-3 rounded-lg border bg-card/60 p-4 sm:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            settle.mutate();
          }}
        >
          <SellerSelect sellers={data.sellers.data ?? []} value={seller} onChange={setSeller} />
          <Input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="Valor"
          />
          <Input value={method} onChange={(event) => setMethod(event.target.value)} placeholder="Forma" />
          <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Observação" />
          <Button className="sm:col-span-4" disabled={settle.isPending || !seller || !amount}>
            Registrar repasse
          </Button>
        </form>
      )}

      <div className="rounded-lg border bg-card/60 p-4">
        <div className="mb-3 grid gap-3 md:grid-cols-4">
          {context.role === "admin" && (
            <div>
              <Label>Vendedor</Label>
              <Select value={filterSeller} onValueChange={setFilterSeller}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {(data.sellers.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Status</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="confirmed">Confirmado</SelectItem>
                <SelectItem value="reversed">Estornado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>De</Label>
            <Input type="date" value={filterFrom} onChange={(event) => setFilterFrom(event.target.value)} />
          </div>
          <div>
            <Label>Até</Label>
            <Input type="date" value={filterTo} onChange={(event) => setFilterTo(event.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          {filtered.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
              <div>
                <p className="font-medium">
                  {sellerMap.get(s.seller_id) ?? shortId(s.seller_id)} · {brl(s.amount)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {fmtDateTime(s.created_at)} · {s.method ?? "—"}
                  {s.note && ` · ${s.note}`}
                </p>
                {s.reversed_reason && (
                  <p className="text-xs text-destructive">Estornado: {s.reversed_reason}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={s.status === "confirmed" ? "default" : "destructive"}>
                  {s.status === "confirmed" ? "Confirmado" : "Estornado"}
                </Badge>
                {context.role === "admin" && s.status === "confirmed" && (
                  <Button size="sm" variant="outline" onClick={() => reverse.mutate(s.id)}>Estornar</Button>
                )}
              </div>
            </div>
          ))}
          {!filtered.length && (
            <p className="text-sm text-muted-foreground">Nenhum repasse no filtro.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Histórico de vendas — detalhes + estorno
// ============================================================
function SalesHistory({ context, data }: { context: ActorContext; data: CoreData }) {
  const queryClient = useQueryClient();
  const [detail, setDetail] = useState<string | null>(null);

  const reverse = useMutation({
    mutationFn: async (saleId: string) => {
      const reason = window.prompt("Justificativa do estorno:");
      if (!reason || reason.trim().length < 3) throw new Error("Justificativa obrigatória (mín. 3)");
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

  const sellerMap = new Map((data.sellers.data ?? []).map((s) => [s.id, s.name]));
  const customerMap = new Map((data.customers.data ?? []).map((c) => [c.id, c.name]));
  const variantMap = new Map((data.variants.data ?? []).map((v) => [v.id, v]));
  const itemsBySale = useMemo(() => {
    const map = new Map<string, SaleItemRow[]>();
    for (const it of data.saleItems.data ?? []) {
      const arr = map.get(it.sale_id) ?? [];
      arr.push(it);
      map.set(it.sale_id, arr);
    }
    return map;
  }, [data.saleItems.data]);

  const openSale = detail ? (data.sales.data ?? []).find((s) => s.id === detail) : null;
  const openItems = detail ? itemsBySale.get(detail) ?? [] : [];

  return (
    <div className="space-y-2">
      {(data.sales.data ?? []).map((sale) => (
        <div key={sale.id} className="rounded-lg border bg-card/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setDetail(sale.id)}
              className="min-w-0 text-left"
            >
              <p className="font-medium">
                {sale.customer_id ? customerMap.get(sale.customer_id) ?? "Cliente" : "Venda direta"} · {brl(sale.total_amount)}
              </p>
              <p className="text-xs text-muted-foreground">
                {fmtDateTime(sale.created_at)} ·{" "}
                {sale.seller_id ? sellerMap.get(sale.seller_id) ?? shortId(sale.seller_id) : "Sem vendedor"} ·
                Lucro {brl(Number(sale.total_amount) - Number(sale.total_cost))} · Comissão {brl(sale.total_commission)}
              </p>
            </button>
            <div className="flex items-center gap-2">
              <Badge variant={sale.status === "confirmed" ? "default" : "destructive"}>
                {sale.status === "confirmed" ? "Confirmada" : "Estornada"}
              </Badge>
              {sale.status === "confirmed" && (
                <Button size="sm" variant="outline" onClick={() => reverse.mutate(sale.id)}>
                  Estornar
                </Button>
              )}
            </div>
          </div>
          {sale.reversed_reason && (
            <p className="mt-1 text-xs text-destructive">Estornada: {sale.reversed_reason}</p>
          )}
        </div>
      ))}
      {!(data.sales.data ?? []).length && (
        <p className="text-sm text-muted-foreground">Nenhuma venda registrada.</p>
      )}

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes da venda</DialogTitle>
          </DialogHeader>
          {openSale && (
            <div className="space-y-3 text-sm">
              <p>
                <strong>Data:</strong> {fmtDateTime(openSale.created_at)}
              </p>
              <p>
                <strong>Cliente:</strong>{" "}
                {openSale.customer_id ? customerMap.get(openSale.customer_id) ?? "—" : "Venda direta"}
              </p>
              <p>
                <strong>Vendedor:</strong>{" "}
                {openSale.seller_id ? sellerMap.get(openSale.seller_id) ?? shortId(openSale.seller_id) : "—"}
              </p>
              <div>
                <strong>Itens:</strong>
                <ul className="mt-1 space-y-1">
                  {openItems.map((it) => {
                    const v = variantMap.get(it.variant_id);
                    return (
                      <li key={it.id} className="flex justify-between border-t pt-1">
                        <span>{v?.product_name ?? shortId(it.variant_id)} · {it.quantity} un</span>
                        <span>{brl(Number(it.quantity) * Number(it.unit_price))}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/40 p-3">
                <div>Total: <strong>{brl(openSale.total_amount)}</strong></div>
                <div>Custo: {brl(openSale.total_cost)}</div>
                <div>Lucro: {brl(Number(openSale.total_amount) - Number(openSale.total_cost))}</div>
                <div>Comissão: {brl(openSale.total_commission)}</div>
              </div>
              {openSale.note && <p><strong>Obs.:</strong> {openSale.note}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// Clientes — reencaminhamento resumido (a página completa é /clientes)
// ============================================================
function CustomersTab({
  context,
  data,
  onCustomerSaved,
}: {
  context: ActorContext;
  data: CoreData;
  onCustomerSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [seller, setSeller] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Informe o nome");
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
      setName("");
      setPhone("");
      setEmail("");
      queryClient.invalidateQueries({ queryKey: ["seller-core", "customers"] });
      onCustomerSaved?.();
    },
    onError: (error) => rpcError(error, "Falha ao salvar cliente"),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form
        className="space-y-3 rounded-lg border bg-card/60 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Etapa 1</p>
          <h3 className="font-semibold">Cadastre o cliente</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Comece pelo cliente que receberá o atendimento da consignação.
          </p>
        </div>
        <Input placeholder="Nome" value={name} onChange={(event) => setName(event.target.value)} />
        <Input placeholder="Telefone" value={phone} onChange={(event) => setPhone(maskPhone(event.target.value))} />
        <Input type="email" placeholder="E-mail" value={email} onChange={(event) => setEmail(event.target.value)} />
        {context.role === "admin" && (
          <SellerSelect sellers={data.sellers.data ?? []} value={seller} onChange={setSeller} allowEmpty />
        )}
        <Button className="w-full sm:w-auto" disabled={save.isPending}>
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar e continuar para transferência
          {!save.isPending && <ChevronRight className="ml-2 h-4 w-4" />}
        </Button>
        <p className="text-xs text-muted-foreground">
          Para o CRM completo (endereço, aniversário, filtros e histórico), use a página <strong>Clientes</strong>.
        </p>
      </form>
      <div className="space-y-2 rounded-lg border bg-card/60 p-4">
        <h3 className="mb-2 font-semibold">Últimos cadastros</h3>
        {(data.customers.data ?? []).slice(0, 15).map((customer: CustomerRow) => (
          <div key={customer.id} className="rounded-md border p-3">
            <p className="font-medium">{customer.name}</p>
            <p className="text-xs text-muted-foreground">
              {customer.phone ?? "sem telefone"} · {customer.email ?? "sem e-mail"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Movimentações — histórico imutável
// ============================================================
function MovementsTab({ context, data }: { context: ActorContext; data: CoreData }) {
  const [locFilter, setLocFilter] = useState("all");
  const [kindFilter, setKindFilter] = useState("all");
  const [search, setSearch] = useState("");

  const variantMap = useMemo(
    () => new Map((data.variants.data ?? []).map((v) => [v.id, v])),
    [data.variants.data],
  );
  const locationMap = useMemo(
    () => new Map((data.locations.data ?? []).map((l) => [l.id, l])),
    [data.locations.data],
  );

  const rows = (data.movements.data ?? []).filter((m: InventoryMovementRow) => {
    if (locFilter !== "all" && m.location_id !== locFilter) return false;
    if (kindFilter !== "all" && m.kind !== kindFilter) return false;
    if (search) {
      const v = variantMap.get(m.variant_id);
      const hay = `${v?.product_name ?? ""} ${v?.brand ?? ""}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border bg-card/60 p-4 md:grid-cols-3">
        <div>
          <Label>Local</Label>
          <Select value={locFilter} onValueChange={setLocFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {(data.locations.data ?? []).map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Tipo</Label>
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(MOVEMENT_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Buscar produto</Label>
          <Input value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card/60">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">Data</th>
              <th className="p-3">Produto</th>
              <th className="p-3">Local</th>
              <th className="p-3">Tipo</th>
              <th className="p-3 text-right">Quantidade</th>
              <th className="p-3">Observação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const v = variantMap.get(m.variant_id);
              const l = locationMap.get(m.location_id);
              return (
                <tr key={m.id} className="border-t">
                  <td className="p-3 text-xs">{fmtDateTime(m.created_at)}</td>
                  <td className="p-3">{v?.product_name ?? shortId(m.variant_id)}</td>
                  <td className="p-3">{l?.name ?? shortId(m.location_id)}</td>
                  <td className="p-3">{MOVEMENT_LABEL[m.kind]}</td>
                  <td className={`p-3 text-right font-medium ${Number(m.quantity) < 0 ? "text-destructive" : "text-emerald-600"}`}>
                    {Number(m.quantity) > 0 ? `+${m.quantity}` : m.quantity}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{m.note ?? "—"}</td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted-foreground">
                  Nenhuma movimentação no filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {context.role === "seller" && (
        <p className="text-xs text-muted-foreground">Você visualiza apenas movimentações dos seus locais.</p>
      )}
    </div>
  );
}

// ============================================================
// Selects reutilizáveis
// ============================================================
function LocationSelect({
  locations,
  value,
  onChange,
}: {
  locations: StockLocationRow[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
      <SelectContent>
        {locations.filter((item) => item.active).map((item) => (
          <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function VariantSelect({
  variants,
  value,
  onChange,
}: {
  variants: VariantCatalogRow[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder="Selecione o produto" /></SelectTrigger>
      <SelectContent className="max-h-72">
        {variants.map((item) => (
          <SelectItem key={item.id} value={item.id}>
            {item.product_name} · {item.volume_ml} ml
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SellerSelect({
  sellers,
  value,
  onChange,
  allowEmpty = false,
}: {
  sellers: SellerRow[];
  value: string;
  onChange: (value: string) => void;
  allowEmpty?: boolean;
}) {
  return (
    <Select
      value={value || (allowEmpty ? "none" : undefined)}
      onValueChange={(next) => onChange(next === "none" ? "" : next)}
    >
      <SelectTrigger>
        <SelectValue placeholder={allowEmpty ? "Venda direta / sem vendedor" : "Selecione o vendedor"} />
      </SelectTrigger>
      <SelectContent>
        {allowEmpty && <SelectItem value="none">Sem vendedor</SelectItem>}
        {sellers.filter((item) => item.active).map((item) => (
          <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CustomerSelect({
  customers,
  value,
  onChange,
}: {
  customers: CustomerRow[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value || "none"} onValueChange={(next) => onChange(next === "none" ? "" : next)}>
      <SelectTrigger><SelectValue placeholder="Cliente opcional" /></SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value="none">Sem cliente</SelectItem>
        {customers.map((item) => (
          <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ============================================================
// Página raiz
// ============================================================
export default function Sellers() {
  const { user } = useAuth();
  const [ready, setReady] = useState<boolean | null>(null);
  const [context, setContext] = useState<ActorContext | null>(null);
  const [activeTab, setActiveTab] = useState("customers");

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
  const hasCustomers = (data.customers.data?.length ?? 0) > 0;
  if (!user) return null;

  if (ready === null) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="page-shell max-w-6xl">
      <header className="premium-grid relative overflow-hidden rounded-[1.5rem] border border-white/5 bg-[#171512] p-5 text-white shadow-[0_16px_42px_rgba(28,22,14,0.14)] lg:p-6">
        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-[#c8a45d]/10 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06]">
            <Users className="h-5 w-5 text-[#d7b868]" />
          </div>
          <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#d8c7a3]">
            Operação comercial
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-white lg:text-2xl">Vendedores e consignação</h1>
          {context && (
            <p className="mt-1 text-xs text-white/55">
              {context.role === "admin"
                ? "Cadastre clientes, transfira produtos e acompanhe cada etapa."
                : "Consulte seu estoque, vendas, comissões e recebimentos."}
            </p>
          )}
          </div>
        </div>
      </header>
      {ready === false && <SetupBanner />}
      {ready === true && !context && (
        <p className="text-sm text-muted-foreground">Carregando permissões…</p>
      )}
      {context && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          {context.role === "admin" && (
            <section className="app-card p-4 lg:p-5">
              <div className="mb-4">
                <p className="eyebrow">Fluxo guiado</p>
                <h2 className="section-title">Nova consignação</h2>
                <p className="text-sm text-muted-foreground">
                  Siga as etapas na ordem. Ao salvar o cliente, você irá direto para a transferência.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setActiveTab("customers")}
                  className={`flex min-h-[76px] items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                    activeTab === "customers"
                      ? "border-primary/50 bg-primary/[0.07] shadow-[0_5px_16px_rgba(155,116,44,0.08)]"
                      : "border-border/70 bg-muted/20 hover:border-primary/25 hover:bg-muted/50"
                  }`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">1</span>
                  <span>
                    <span className="block font-medium">Cadastrar cliente</span>
                    <span className="text-xs text-muted-foreground">Nome e contato</span>
                  </span>
                  {hasCustomers && <CheckCircle2 className="ml-auto h-5 w-5 text-emerald-600" />}
                </button>
                <button
                  type="button"
                  disabled={!hasCustomers}
                  onClick={() => setActiveTab("transfers")}
                  className={`flex min-h-[76px] items-center gap-3 rounded-xl border p-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                    activeTab === "transfers"
                      ? "border-primary/50 bg-primary/[0.07] shadow-[0_5px_16px_rgba(155,116,44,0.08)]"
                      : "border-border/70 bg-muted/20 hover:border-primary/25 hover:bg-muted/50"
                  }`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">2</span>
                  <span>
                    <span className="block font-medium">Transferir produtos</span>
                    <span className="text-xs text-muted-foreground">
                      {hasCustomers ? "Escolher destino e itens" : "Cadastre um cliente primeiro"}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("sales")}
                  className={`flex min-h-[76px] items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                    activeTab === "sales"
                      ? "border-primary/50 bg-primary/[0.07] shadow-[0_5px_16px_rgba(155,116,44,0.08)]"
                      : "border-border/70 bg-muted/20 hover:border-primary/25 hover:bg-muted/50"
                  }`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold">3</span>
                  <span>
                    <span className="block font-medium">Registrar venda</span>
                    <span className="text-xs text-muted-foreground">Quando o produto for vendido</span>
                  </span>
                </button>
              </div>
            </section>
          )}

          <div className="app-card space-y-3 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {context.role === "admin" ? "Fluxo principal" : "Minha operação"}
            </p>
            <TabsList className="grid h-auto w-full grid-cols-3 rounded-xl bg-muted/70 p-1">
              <TabsTrigger value="customers"><Users className="mr-1 h-4 w-4" />Clientes</TabsTrigger>
              <TabsTrigger value="transfers" disabled={context.role === "admin" && !hasCustomers}>
                <ArrowLeftRight className="mr-1 h-4 w-4" />Transferir
              </TabsTrigger>
              <TabsTrigger value="sales"><ShoppingBag className="mr-1 h-4 w-4" />Vender</TabsTrigger>
            </TabsList>
          </div>

          <div className="app-card space-y-3 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Consultar e administrar
            </p>
            <TabsList
              className={`grid h-auto w-full rounded-xl bg-muted/70 p-1 ${
                context.role === "admin" ? "grid-cols-2 md:grid-cols-5" : "grid-cols-3"
              }`}
            >
              <TabsTrigger value="stock"><Boxes className="mr-1 h-4 w-4" />Estoque</TabsTrigger>
              <TabsTrigger value="finance"><Wallet className="mr-1 h-4 w-4" />Comissões</TabsTrigger>
              <TabsTrigger value="movements"><History className="mr-1 h-4 w-4" />Movimentações</TabsTrigger>
              {context.role === "admin" && (
                <TabsTrigger value="sellers"><UserRound className="mr-1 h-4 w-4" />Vendedores</TabsTrigger>
              )}
              {context.role === "admin" && (
                <TabsTrigger value="history"><History className="mr-1 h-4 w-4" />Histórico</TabsTrigger>
              )}
            </TabsList>
          </div>
          <TabsContent value="stock"><StockTab context={context} data={data} /></TabsContent>
          <TabsContent value="transfers"><TransfersTab context={context} data={data} /></TabsContent>
          <TabsContent value="sales"><SalesTab context={context} data={data} /></TabsContent>
          <TabsContent value="customers">
            <CustomersTab
              context={context}
              data={data}
              onCustomerSaved={() => setActiveTab("transfers")}
            />
          </TabsContent>
          <TabsContent value="finance"><FinanceTab context={context} data={data} /></TabsContent>
          <TabsContent value="movements"><MovementsTab context={context} data={data} /></TabsContent>
          {context.role === "admin" && (
            <TabsContent value="sellers"><SellersTab context={context} data={data} /></TabsContent>
          )}
          {context.role === "admin" && (
            <TabsContent value="history"><SalesHistory context={context} data={data} /></TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}
