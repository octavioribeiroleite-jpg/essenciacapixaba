import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  sellerDb,
  isSellerCoreReady,
  fetchCurrentRole,
  type SellerRow,
  type CustomerRow,
  type CommissionKind,
  type AppRole,
  type StockLocationRow,
  type StockBalanceRow,
  type SellerCommissionRow,
  type TransferRow,
  type ProductVariantRow,
} from "@/integrations/supabase/sellerDb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle, ArrowLeftRight, Banknote, Boxes, Loader2, RotateCcw,
  ShoppingBag, Trash2, UserRound, Users, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { normalizePhone, calcCommission } from "@/lib/commission";

const brl = (v: number) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ================================================================
// Banner de setup (migration pendente)
// ================================================================
function SetupBanner() {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
      <div>
        <p className="font-medium text-amber-100">
          Núcleo de vendedores aguardando aplicação da migration
        </p>
        <p className="mt-1 text-amber-100/80">
          O arquivo{" "}
          <code className="rounded bg-black/30 px-1">
            supabase/pending-migrations/20260728130000_seller_core.sql
          </code>{" "}
          precisa ser aplicado. Enquanto isso, as ações abaixo ficam
          indisponíveis (a UI já está pronta e tipada).
        </p>
      </div>
    </div>
  );
}

function OnlyAdmin() {
  return (
    <div className="rounded-lg border border-border/60 bg-card/60 p-6 text-center text-sm text-muted-foreground">
      Área administrativa. Peça a um administrador o acesso.
    </div>
  );
}

// ================================================================
// Cadastro de vendedores (ADMIN)
// ================================================================
function SellersAdminTab({ ownerId, enabled }: { ownerId: string; enabled: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<SellerRow | null>(null);
  const [form, setForm] = useState({
    name: "", email: "", phone: "", active: true,
    commission_kind: "fixed_per_unit" as CommissionKind,
    commission_value: "0",
  });

  const { data: sellers = [], isLoading } = useQuery<SellerRow[]>({
    queryKey: ["sellers_v2", ownerId],
    enabled,
    queryFn: async () => {
      const { data, error } = await sellerDb.from("sellers_v2").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as SellerRow[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        owner_id: ownerId,
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: normalizePhone(form.phone),
        active: form.active,
        commission_kind: form.commission_kind,
        commission_value: Number(form.commission_value) || 0,
      };
      if (editing) {
        const { error } = await sellerDb.from("sellers_v2").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await sellerDb.from("sellers_v2").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Vendedor atualizado" : "Vendedor cadastrado");
      setEditing(null);
      setForm({ name: "", email: "", phone: "", active: true, commission_kind: "fixed_per_unit", commission_value: "0" });
      qc.invalidateQueries({ queryKey: ["sellers_v2", ownerId] });
    },
    onError: (e: Error) => toast.error(e?.message ?? "Falha ao salvar vendedor"),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sellerDb.from("sellers_v2").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sellers_v2", ownerId] }),
    onError: (e: Error) => toast.error(e?.message ?? "Falha ao remover"),
  });

  function loadForEdit(s: SellerRow) {
    setEditing(s);
    setForm({
      name: s.name, email: s.email ?? "", phone: s.phone ?? "", active: s.active,
      commission_kind: s.commission_kind, commission_value: String(s.commission_value),
    });
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form
        onSubmit={(e) => { e.preventDefault();
          if (!form.name.trim()) return toast.error("Informe o nome");
          saveMutation.mutate();
        }}
        className="space-y-3 rounded-lg border border-border/60 bg-card/60 p-4"
      >
        <h3 className="text-lg font-semibold">{editing ? "Editar vendedor" : "Novo vendedor"}</h3>
        <div>
          <Label>Nome</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>E-mail (Supabase Auth)</Label>
            <Input type="email" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="vendedor@exemplo.com" />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Tipo de comissão</Label>
            <Select value={form.commission_kind}
              onValueChange={(v) => setForm({ ...form, commission_kind: v as CommissionKind })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed_per_unit">Valor fixo por unidade</SelectItem>
                <SelectItem value="profit_percentage">% sobre o lucro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{form.commission_kind === "fixed_per_unit" ? "R$ por unidade" : "% do lucro"}</Label>
            <Input type="number" min="0" step="0.01" value={form.commission_value}
              onChange={(e) => setForm({ ...form, commission_value: e.target.value })} />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
          <Label className="mb-0">Ativo</Label>
          <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={!enabled || saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? "Atualizar" : "Cadastrar"}
          </Button>
          {editing && <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>}
        </div>
      </form>

      <div className="rounded-lg border border-border/60 bg-card/60 p-4">
        <h3 className="mb-3 text-lg font-semibold">Vendedores cadastrados</h3>
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : sellers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum vendedor ainda.</p>
        ) : (
          <ul className="space-y-2">
            {sellers.map((s) => (
              <li key={s.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border/40 bg-background/40 p-3">
                <div>
                  <p className="font-medium">
                    {s.name}{" "}
                    {!s.active && <span className="text-xs text-muted-foreground">(inativo)</span>}
                    {!s.user_id && <span className="ml-2 text-xs text-amber-400">sem login vinculado</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.email ?? "sem email"} · {s.phone ?? "sem telefone"} ·{" "}
                    {s.commission_kind === "fixed_per_unit"
                      ? `${brl(s.commission_value)} / unid.`
                      : `${s.commission_value}% do lucro`}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => loadForEdit(s)}>Editar</Button>
                  <Button size="sm" variant="ghost"
                    onClick={() => { if (confirm(`Remover ${s.name}?`)) removeMutation.mutate(s.id); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ================================================================
// Clientes (ADMIN)
// ================================================================
function CustomersTab({ ownerId, enabled }: { ownerId: string; enabled: boolean }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", phone: "", email: "", note: "" });

  const { data: customers = [] } = useQuery<CustomerRow[]>({
    queryKey: ["customers", ownerId],
    enabled,
    queryFn: async () => {
      const { data, error } = await sellerDb.from("customers").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as CustomerRow[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await sellerDb.from("customers").insert({
        owner_id: ownerId, name: form.name.trim(),
        phone: normalizePhone(form.phone),
        email: form.email.trim() || null, note: form.note.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente cadastrado");
      setForm({ name: "", phone: "", email: "", note: "" });
      qc.invalidateQueries({ queryKey: ["customers", ownerId] });
    },
    onError: (e: Error) => toast.error(e?.message ?? "Falha ao salvar cliente"),
  });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <form onSubmit={(e) => { e.preventDefault();
        if (!form.name.trim()) return toast.error("Informe o nome");
        create.mutate();
      }} className="space-y-3 rounded-lg border border-border/60 bg-card/60 p-4">
        <h3 className="text-lg font-semibold">Novo cliente</h3>
        <div><Label>Nome</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Telefone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label>E-mail</Label>
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        </div>
        <div><Label>Observações</Label>
          <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
        <Button type="submit" disabled={!enabled || create.isPending}>
          {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
        </Button>
      </form>
      <div className="rounded-lg border border-border/60 bg-card/60 p-4">
        <h3 className="mb-3 text-lg font-semibold">Clientes</h3>
        {customers.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum cliente ainda.</p>
        ) : (
          <ul className="space-y-2">
            {customers.map((c) => (
              <li key={c.id} className="rounded-md border border-border/40 bg-background/40 p-3">
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {c.phone ?? "sem telefone"} · {c.email ?? "sem email"}
                </p>
                {c.note && <p className="mt-1 text-xs text-muted-foreground">{c.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ================================================================
// Estoque (por local e por variante) — ADMIN vê tudo; seller vê o próprio.
// ================================================================
function StockTab({ enabled, role }: { enabled: boolean; role: AppRole }) {
  const { data: balances = [] } = useQuery<StockBalanceRow[]>({
    queryKey: ["v_stock_balances", role],
    enabled,
    queryFn: async () => {
      const { data, error } = await sellerDb.from("v_stock_balances").select("*");
      if (error) throw error;
      return (data ?? []) as StockBalanceRow[];
    },
  });
  const { data: locations = [] } = useQuery<StockLocationRow[]>({
    queryKey: ["stock_locations", role],
    enabled,
    queryFn: async () => {
      const { data, error } = await sellerDb.from("stock_locations").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as StockLocationRow[];
    },
  });
  const { data: variants = [] } = useQuery<ProductVariantRow[]>({
    queryKey: ["product_variants", role],
    enabled,
    queryFn: async () => {
      const { data, error } = await sellerDb.from("product_variants").select("*");
      if (error) throw error;
      return (data ?? []) as ProductVariantRow[];
    },
  });

  const nameOfLoc = (id: string) => locations.find((l) => l.id === id)?.name ?? id.slice(0, 8);
  const nameOfVar = (id: string) => {
    const v = variants.find((x) => x.id === id);
    return v ? `${v.sku ?? v.id.slice(0, 8)} · ${v.volume_ml}ml` : id.slice(0, 8);
  };

  return (
    <div className="rounded-lg border border-border/60 bg-card/60 p-4">
      <h3 className="mb-3 text-lg font-semibold">Saldos por local</h3>
      {balances.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem movimentos ainda.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-muted-foreground">
              <th className="py-1">Local</th><th>Variante</th><th className="text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {balances.map((b, i) => (
              <tr key={i} className="border-t border-border/40">
                <td className="py-1">{nameOfLoc(b.location_id)}</td>
                <td>{nameOfVar(b.variant_id)}</td>
                <td className="text-right font-medium">{Number(b.balance).toLocaleString("pt-BR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ================================================================
// Transferências — ADMIN cria/envia e cancela; seller recebe.
// ================================================================
function TransfersTab({ enabled, role }: { enabled: boolean; role: AppRole }) {
  const qc = useQueryClient();
  const { data: transfers = [] } = useQuery<TransferRow[]>({
    queryKey: ["transfers"],
    enabled,
    queryFn: async () => {
      const { data, error } = await sellerDb.from("transfers").select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TransferRow[];
    },
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const reason = prompt("Justificativa do cancelamento?") ?? "";
      const { error } = await sellerDb.rpc("rpc_cancel_transfer", {
        p_transfer: id, p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Transferência cancelada"); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e?.message ?? "Falha ao cancelar"),
  });
  const receive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sellerDb.rpc("rpc_receive_transfer", {
        p_transfer: id, p_items: null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Recebimento confirmado"); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e?.message ?? "Falha ao receber"),
  });

  return (
    <div className="rounded-lg border border-border/60 bg-card/60 p-4">
      <h3 className="mb-3 text-lg font-semibold">Transferências</h3>
      {transfers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {role === "admin"
            ? "Nenhuma transferência ainda. Use rpc_send_transfer via ferramentas administrativas."
            : "Nenhuma transferência destinada a você ainda."}
        </p>
      ) : (
        <ul className="space-y-2">
          {transfers.map((t) => (
            <li key={t.id}
              className="flex items-center justify-between rounded-md border border-border/40 bg-background/40 p-3 text-sm">
              <div>
                <p className="font-medium">#{t.id.slice(0, 8)}</p>
                <p className="text-xs text-muted-foreground">
                  {t.status} · criado {new Date(t.created_at).toLocaleString("pt-BR")}
                </p>
              </div>
              <div className="flex gap-1">
                {t.status === "in_transit" && (
                  <Button size="sm" onClick={() => receive.mutate(t.id)}>Confirmar</Button>
                )}
                {role === "admin" && (t.status === "draft" || t.status === "in_transit") && (
                  <Button size="sm" variant="ghost" onClick={() => cancel.mutate(t.id)}>Cancelar</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ================================================================
// Repasses (ADMIN)
// ================================================================
function SettlementsTab({ ownerId, enabled }: { ownerId: string; enabled: boolean }) {
  const qc = useQueryClient();
  const [sellerId, setSellerId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Pix");

  const { data: sellers = [] } = useQuery<SellerRow[]>({
    queryKey: ["sellers_v2", ownerId],
    enabled,
    queryFn: async () => {
      const { data, error } = await sellerDb.from("sellers_v2").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as SellerRow[];
    },
  });
  const { data: commission = [] } = useQuery<SellerCommissionRow[]>({
    queryKey: ["v_seller_commission", ownerId],
    enabled,
    queryFn: async () => {
      const { data, error } = await sellerDb.from("v_seller_commission").select("*");
      if (error) throw error;
      return (data ?? []) as SellerCommissionRow[];
    },
  });
  const due = useMemo(() => {
    const row = commission.find((c) => c.seller_id === sellerId);
    return row ? Math.max(0, Number(row.total_earned) - Number(row.total_paid)) : 0;
  }, [commission, sellerId]);

  const settle = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      if (!(value > 0)) throw new Error("Valor inválido");
      if (!sellerId) throw new Error("Selecione o vendedor");
      const { error } = await sellerDb.rpc("rpc_settle", {
        p_seller: sellerId, p_amount: value, p_method: method, p_note: null,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Repasse registrado"); setAmount(""); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e?.message ?? "Falha no repasse"),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); settle.mutate(); }}
      className="grid max-w-xl gap-3 rounded-lg border border-border/60 bg-card/60 p-4">
      <h3 className="text-lg font-semibold">Repasse parcial ou total</h3>
      <div><Label>Vendedor</Label>
        <Select value={sellerId} onValueChange={setSellerId}>
          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {sellers.filter((s) => s.active).map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {sellerId && (
        <p className="text-xs text-muted-foreground">Saldo devido: <strong>{brl(due)}</strong></p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>Valor</Label>
          <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><Label>Forma</Label>
          <Input value={method} onChange={(e) => setMethod(e.target.value)} /></div>
      </div>
      <p className="text-xs text-muted-foreground">
        Nunca ultrapassa o saldo devido — validado no servidor via RPC transacional com lock.
      </p>
      <Button type="submit" disabled={!enabled || settle.isPending}>
        {settle.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Registrar repasse
      </Button>
    </form>
  );
}

// ================================================================
// Estorno (ADMIN)
// ================================================================
function ReverseTab({ enabled }: { enabled: boolean }) {
  const [saleId, setSaleId] = useState("");
  const [reason, setReason] = useState("");
  const reverse = useMutation({
    mutationFn: async () => {
      if (!saleId) throw new Error("Informe o ID da venda");
      if (reason.trim().length < 3) throw new Error("Justificativa é obrigatória");
      const { error } = await sellerDb.rpc("rpc_reverse_sale", { p_sale: saleId, p_reason: reason });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Venda estornada com movimentos compensatórios");
      setSaleId(""); setReason(""); },
    onError: (e: Error) => toast.error(e?.message ?? "Falha ao estornar"),
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); reverse.mutate(); }}
      className="grid max-w-xl gap-3 rounded-lg border border-border/60 bg-card/60 p-4">
      <h3 className="text-lg font-semibold">Estornar venda com justificativa</h3>
      <div><Label>ID da venda</Label>
        <Input value={saleId} onChange={(e) => setSaleId(e.target.value)} /></div>
      <div><Label>Justificativa</Label>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      <Button type="submit" disabled={!enabled || reverse.isPending}>
        <RotateCcw className="mr-2 h-4 w-4" /> Estornar
      </Button>
    </form>
  );
}

// ================================================================
// Venda consignada — SELLER usa o próprio estoque; ADMIN escolhe o vendedor.
// ================================================================
function ConsignedSaleTab({ enabled, role }: { enabled: boolean; role: AppRole }) {
  const { data: sellers = [] } = useQuery<SellerRow[]>({
    queryKey: ["sellers_v2_all"], enabled: enabled && role === "admin",
    queryFn: async () => (await sellerDb.from("sellers_v2").select("*")).data as SellerRow[] ?? [],
  });
  const { data: locations = [] } = useQuery<StockLocationRow[]>({
    queryKey: ["locations"], enabled,
    queryFn: async () => (await sellerDb.from("stock_locations").select("*")).data as StockLocationRow[] ?? [],
  });
  const { data: variants = [] } = useQuery<ProductVariantRow[]>({
    queryKey: ["variants"], enabled,
    queryFn: async () => (await sellerDb.from("product_variants").select("*")).data as ProductVariantRow[] ?? [],
  });

  const [sellerId, setSellerId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      if (!locationId || !variantId) throw new Error("Selecione local e variante");
      const { error } = await sellerDb.rpc("rpc_register_sale", {
        p_sale: {
          location_id: locationId,
          seller_id: role === "admin" ? sellerId || null : null,
          items: [{ variant_id: variantId, quantity: Number(qty), unit_price: price ? Number(price) : undefined }],
        },
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Venda registrada"),
    onError: (e: Error) => toast.error(e?.message ?? "Falha ao registrar venda"),
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}
      className="grid max-w-xl gap-3 rounded-lg border border-border/60 bg-card/60 p-4">
      <h3 className="text-lg font-semibold">Registrar venda</h3>
      {role === "admin" && (
        <div><Label>Vendedor (opcional)</Label>
          <Select value={sellerId} onValueChange={setSellerId}>
            <SelectTrigger><SelectValue placeholder="Venda direta (sem vendedor)" /></SelectTrigger>
            <SelectContent>
              {sellers.filter((s) => s.active).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div><Label>Local do estoque</Label>
        <Select value={locationId} onValueChange={setLocationId}>
          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {locations.map((l) => (
              <SelectItem key={l.id} value={l.id}>{l.name} · {l.kind}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div><Label>Variante</Label>
        <Select value={variantId} onValueChange={setVariantId}>
          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {variants.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.sku ?? v.id.slice(0, 8)} · {v.volume_ml}ml
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>Quantidade</Label>
          <Input type="number" min="0" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
        <div><Label>Preço unitário (opcional)</Label>
          <Input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)}
            placeholder="usa preço da variante" /></div>
      </div>
      <p className="text-xs text-muted-foreground">
        Custo e política de comissão são carregados no servidor. Cliente não pode alterá-los.
      </p>
      <Button type="submit" disabled={!enabled || submit.isPending}>
        {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Registrar
      </Button>
    </form>
  );
}

// ================================================================
// Portal do vendedor
// ================================================================
function SellerSelfView({ userId }: { userId: string }) {
  const { data: seller } = useQuery<SellerRow | null>({
    queryKey: ["me_seller", userId],
    queryFn: async () => {
      const { data, error } = await sellerDb
        .from("sellers_v2").select("*").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return (data as SellerRow | null) ?? null;
    },
  });
  const { data: commission = [] } = useQuery<SellerCommissionRow[]>({
    queryKey: ["me_commission", userId], enabled: !!seller,
    queryFn: async () => (await sellerDb.from("v_seller_commission").select("*")).data as SellerCommissionRow[] ?? [],
  });
  if (!seller) {
    return (
      <div className="rounded-lg border border-border/60 bg-card/60 p-6 text-center text-muted-foreground">
        Sua conta ainda não está vinculada como vendedor. Peça ao administrador
        para cadastrar seu e-mail em <strong>Vendedores</strong>.
      </div>
    );
  }
  const mine = commission.find((c) => c.seller_id === seller.id);
  const earned = Number(mine?.total_earned ?? 0);
  const paid = Number(mine?.total_paid ?? 0);
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border/60 bg-card/60 p-4">
        <p className="text-sm text-muted-foreground">Olá,</p>
        <p className="text-xl font-semibold">{seller.name}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Comissão:{" "}
          {seller.commission_kind === "fixed_per_unit"
            ? `${brl(seller.commission_value)} por unidade`
            : `${seller.commission_value}% do lucro`}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-md border border-border/40 bg-background/40 p-3">
          <p className="text-xs text-muted-foreground">Ganho</p>
          <p className="text-lg font-semibold">{brl(earned)}</p>
        </div>
        <div className="rounded-md border border-border/40 bg-background/40 p-3">
          <p className="text-xs text-muted-foreground">Recebido</p>
          <p className="text-lg font-semibold">{brl(paid)}</p>
        </div>
        <div className="rounded-md border border-border/40 bg-background/40 p-3">
          <p className="text-xs text-muted-foreground">Devido</p>
          <p className="text-lg font-semibold">{brl(Math.max(0, earned - paid))}</p>
        </div>
      </div>
    </div>
  );
}

// ================================================================
// Página
// ================================================================
export default function Sellers() {
  const { user } = useAuth();
  const [ready, setReady] = useState<boolean | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);
  const [previewCalc, setPreviewCalc] = useState({
    kind: "fixed_per_unit" as CommissionKind,
    value: 15, unitPrice: 260, unitCost: 160, quantity: 1,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await isSellerCoreReady();
      if (cancelled) return;
      setReady(ok);
      if (ok) {
        const r = await fetchCurrentRole();
        if (!cancelled) setRole(r);
      }
      if (!cancelled) setRoleLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!user) return null;
  const enabled = ready === true;
  const isAdmin = role === "admin";
  const isSeller = role === "seller";

  return (
    <div className="mx-auto max-w-5xl p-4">
      <header className="mb-4 flex items-center gap-3">
        <Users className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-semibold">
          {isAdmin ? "Vendedores (admin)" : isSeller ? "Meu portal" : "Vendedores"}
        </h1>
        {enabled && !roleLoading && !role && (
          <span className="text-xs text-amber-400">papel não definido</span>
        )}
      </header>

      {ready === false && <SetupBanner />}

      <Tabs defaultValue={isAdmin ? "sellers" : "me"} className="w-full">
        <TabsList className={`mb-4 grid w-full ${isAdmin ? "grid-cols-3 md:grid-cols-7" : "grid-cols-3"}`}>
          {isAdmin && (
            <>
              <TabsTrigger value="sellers"><UserRound className="mr-1 h-4 w-4" />Cadastro</TabsTrigger>
              <TabsTrigger value="customers"><Users className="mr-1 h-4 w-4" />Clientes</TabsTrigger>
              <TabsTrigger value="stock"><Boxes className="mr-1 h-4 w-4" />Estoque</TabsTrigger>
              <TabsTrigger value="transfers"><ArrowLeftRight className="mr-1 h-4 w-4" />Transferências</TabsTrigger>
              <TabsTrigger value="sale"><ShoppingBag className="mr-1 h-4 w-4" />Venda</TabsTrigger>
              <TabsTrigger value="settle"><Wallet className="mr-1 h-4 w-4" />Repasses</TabsTrigger>
              <TabsTrigger value="reverse"><RotateCcw className="mr-1 h-4 w-4" />Estorno</TabsTrigger>
            </>
          )}
          {isSeller && (
            <>
              <TabsTrigger value="me"><Banknote className="mr-1 h-4 w-4" />Portal</TabsTrigger>
              <TabsTrigger value="stock"><Boxes className="mr-1 h-4 w-4" />Meu estoque</TabsTrigger>
              <TabsTrigger value="transfers"><ArrowLeftRight className="mr-1 h-4 w-4" />Recebimentos</TabsTrigger>
              <TabsTrigger value="sale"><ShoppingBag className="mr-1 h-4 w-4" />Venda</TabsTrigger>
            </>
          )}
        </TabsList>

        {isAdmin && (
          <>
            <TabsContent value="sellers">
              <SellersAdminTab ownerId={user.id} enabled={enabled} />
              <details className="mt-4 rounded-md border border-border/40 bg-card/40 p-3 text-sm">
                <summary className="cursor-pointer font-medium">Simulador de comissão</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-5">
                  <Select value={previewCalc.kind}
                    onValueChange={(v) => setPreviewCalc({ ...previewCalc, kind: v as CommissionKind })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed_per_unit">Fixo por unidade</SelectItem>
                      <SelectItem value="profit_percentage">% do lucro</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="number" value={previewCalc.value}
                    onChange={(e) => setPreviewCalc({ ...previewCalc, value: Number(e.target.value) })} placeholder="valor" />
                  <Input type="number" value={previewCalc.unitPrice}
                    onChange={(e) => setPreviewCalc({ ...previewCalc, unitPrice: Number(e.target.value) })} placeholder="preço" />
                  <Input type="number" value={previewCalc.unitCost}
                    onChange={(e) => setPreviewCalc({ ...previewCalc, unitCost: Number(e.target.value) })} placeholder="custo" />
                  <Input type="number" value={previewCalc.quantity}
                    onChange={(e) => setPreviewCalc({ ...previewCalc, quantity: Number(e.target.value) })} placeholder="qtd" />
                </div>
                <p className="mt-2 text-sm">Comissão calculada: <strong>{brl(calcCommission(previewCalc))}</strong></p>
              </details>
            </TabsContent>
            <TabsContent value="customers"><CustomersTab ownerId={user.id} enabled={enabled} /></TabsContent>
            <TabsContent value="stock"><StockTab enabled={enabled} role="admin" /></TabsContent>
            <TabsContent value="transfers"><TransfersTab enabled={enabled} role="admin" /></TabsContent>
            <TabsContent value="sale"><ConsignedSaleTab enabled={enabled} role="admin" /></TabsContent>
            <TabsContent value="settle"><SettlementsTab ownerId={user.id} enabled={enabled} /></TabsContent>
            <TabsContent value="reverse"><ReverseTab enabled={enabled} /></TabsContent>
          </>
        )}

        {isSeller && (
          <>
            <TabsContent value="me"><SellerSelfView userId={user.id} /></TabsContent>
            <TabsContent value="stock"><StockTab enabled={enabled} role="seller" /></TabsContent>
            <TabsContent value="transfers"><TransfersTab enabled={enabled} role="seller" /></TabsContent>
            <TabsContent value="sale"><ConsignedSaleTab enabled={enabled} role="seller" /></TabsContent>
          </>
        )}

        {!isAdmin && !isSeller && enabled && <OnlyAdmin />}
      </Tabs>
    </div>
  );
}