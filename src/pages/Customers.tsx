import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  sellerDb,
  getActorContext,
  isSellerCoreReady,
  type ActorContext,
  type CustomerRow,
} from "@/integrations/supabase/sellerDb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import {
  Cake,
  Loader2,
  MessageCircle,
  Phone,
  Plus,
  Search,
  UserPlus,
  Users as UsersIcon,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { lookupCep, maskCep, maskCpf, maskPhone } from "@/lib/viaCep";

const brl = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type FilterKey =
  | "all"
  | "no_purchase"
  | "inactive_30"
  | "inactive_60"
  | "one_time"
  | "recurring"
  | "birthday";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "birthday", label: "Aniversariantes do mês" },
  { key: "recurring", label: "Recorrentes (2+)" },
  { key: "one_time", label: "Só 1 compra" },
  { key: "inactive_30", label: "Sem compra há 30d" },
  { key: "inactive_60", label: "Sem compra há 60d" },
  { key: "no_purchase", label: "Sem compras" },
];

interface SaleAgg {
  id: string;
  customer_id: string | null;
  created_at: string;
  total_amount: number;
  seller_id: string | null;
}
interface SaleItemAgg {
  sale_id: string;
  variant_id: string;
  quantity: number;
  unit_price: number;
}
interface VariantAgg {
  id: string;
  product_id: string;
  volume_ml: number;
}
interface ProductAgg {
  id: string;
  name: string;
  brand: string | null;
}

interface CustomerMetrics {
  count: number;
  total: number;
  ticket: number;
  first?: string;
  last?: string;
  perfumes: string[];
}

const emptyForm = {
  id: null as string | null,
  name: "",
  phone: "",
  whatsapp: "",
  email: "",
  cpf: "",
  birth_date: "",
  zip: "",
  address: "",
  number: "",
  complement: "",
  district: "",
  city: "",
  state: "",
  note: "",
};

export default function Customers() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [detail, setDetail] = useState<CustomerRow | null>(null);
  const [cepLoading, setCepLoading] = useState(false);

  const ready = useQuery({
    queryKey: ["core-ready"],
    queryFn: async () => isSellerCoreReady(),
  });

  const ctxQuery = useQuery({
    queryKey: ["actor-context"],
    enabled: ready.data === true,
    queryFn: async (): Promise<ActorContext> => getActorContext(),
  });

  const customersQ = useQuery({
    queryKey: ["customers"],
    enabled: ready.data === true,
    queryFn: async () => {
      const { data, error } = await sellerDb
        .from("customers")
        .select("*")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const salesQ = useQuery({
    queryKey: ["sales-for-crm"],
    enabled: ready.data === true,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sales_v2")
        .select("id,customer_id,created_at,total_amount,seller_id,status")
        .eq("status", "confirmed");
      if (error) throw error;
      return (data ?? []) as SaleAgg[];
    },
  });

  const itemsQ = useQuery({
    queryKey: ["sale-items-for-crm"],
    enabled: ready.data === true,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sale_items")
        .select("sale_id,variant_id,quantity,unit_price");
      if (error) throw error;
      return (data ?? []) as SaleItemAgg[];
    },
  });

  const variantsQ = useQuery({
    queryKey: ["variants-for-crm"],
    enabled: ready.data === true,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_variants")
        .select("id,product_id,volume_ml");
      if (error) throw error;
      return (data ?? []) as VariantAgg[];
    },
  });

  const productsQ = useQuery({
    queryKey: ["products-for-crm"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,brand");
      if (error) throw error;
      return (data ?? []) as ProductAgg[];
    },
  });

  const metricsByCustomer = useMemo(() => {
    const map = new Map<string, CustomerMetrics>();
    const sales = salesQ.data ?? [];
    const items = itemsQ.data ?? [];
    const variants = new Map((variantsQ.data ?? []).map((v) => [v.id, v]));
    const products = new Map((productsQ.data ?? []).map((p) => [p.id, p]));
    const itemsBySale = new Map<string, SaleItemAgg[]>();
    for (const it of items) {
      const arr = itemsBySale.get(it.sale_id) ?? [];
      arr.push(it);
      itemsBySale.set(it.sale_id, arr);
    }
    for (const s of sales) {
      if (!s.customer_id) continue;
      const cur =
        map.get(s.customer_id) ??
        ({ count: 0, total: 0, ticket: 0, perfumes: [] as string[] } as CustomerMetrics);
      cur.count += 1;
      cur.total += Number(s.total_amount || 0);
      if (!cur.first || s.created_at < cur.first) cur.first = s.created_at;
      if (!cur.last || s.created_at > cur.last) cur.last = s.created_at;
      const sitems = itemsBySale.get(s.id) ?? [];
      for (const it of sitems) {
        const v = variants.get(it.variant_id);
        if (!v) continue;
        const p = products.get(v.product_id);
        if (p && !cur.perfumes.includes(p.name)) cur.perfumes.push(p.name);
      }
      map.set(s.customer_id, cur);
    }
    for (const [, m] of map) {
      m.ticket = m.count > 0 ? m.total / m.count : 0;
    }
    return map;
  }, [salesQ.data, itemsQ.data, variantsQ.data, productsQ.data]);

  const filtered = useMemo(() => {
    const rows = customersQ.data ?? [];
    const now = Date.now();
    const q = search.trim().toLowerCase();
    return rows.filter((c) => {
      if (q) {
        const hay = `${c.name} ${c.phone ?? ""} ${c.email ?? ""} ${c.cpf ?? ""} ${c.whatsapp ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const m = metricsByCustomer.get(c.id);
      switch (filter) {
        case "no_purchase":
          return !m || m.count === 0;
        case "one_time":
          return m?.count === 1;
        case "recurring":
          return (m?.count ?? 0) >= 2;
        case "inactive_30":
          return m?.last && now - new Date(m.last).getTime() >= 30 * 864e5;
        case "inactive_60":
          return m?.last && now - new Date(m.last).getTime() >= 60 * 864e5;
        case "birthday": {
          if (!c.birth_date) return false;
          const bd = new Date(c.birth_date + "T00:00:00");
          return bd.getMonth() === new Date().getMonth();
        }
        default:
          return true;
      }
    });
  }, [customersQ.data, metricsByCustomer, filter, search]);

  const openNew = () => {
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };
  const openEdit = (c: CustomerRow) => {
    setForm({
      id: c.id,
      name: c.name,
      phone: c.phone ?? "",
      whatsapp: c.whatsapp ?? "",
      email: c.email ?? "",
      cpf: c.cpf ?? "",
      birth_date: c.birth_date ?? "",
      zip: c.zip ?? "",
      address: c.address ?? "",
      number: c.number ?? "",
      complement: c.complement ?? "",
      district: c.district ?? "",
      city: c.city ?? "",
      state: c.state ?? "",
      note: c.note ?? "",
    });
    setDialogOpen(true);
  };

  const autofillCep = async () => {
    const clean = form.zip.replace(/\D/g, "");
    if (clean.length !== 8) return;
    setCepLoading(true);
    const r = await lookupCep(clean);
    setCepLoading(false);
    if (!r) {
      toast.error("CEP não encontrado");
      return;
    }
    setForm((f) => ({
      ...f,
      address: r.logradouro || f.address,
      district: r.bairro || f.district,
      city: r.localidade || f.city,
      state: r.uf || f.state,
    }));
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Informe o nome");
      const ctx = ctxQuery.data;
      if (!ctx) throw new Error("Perfil não carregado");
      const payload: Record<string, unknown> = {
        owner_id: ctx.owner_id,
        seller_id: ctx.role === "seller" ? ctx.seller_id : null,
        name: form.name.trim(),
        phone: form.phone ? form.phone.replace(/\D/g, "") : null,
        whatsapp: form.whatsapp ? form.whatsapp.replace(/\D/g, "") : null,
        email: form.email.trim() || null,
        cpf: form.cpf ? form.cpf.replace(/\D/g, "") : null,
        birth_date: form.birth_date || null,
        zip: form.zip ? form.zip.replace(/\D/g, "") : null,
        address: form.address || null,
        number: form.number || null,
        complement: form.complement || null,
        district: form.district || null,
        city: form.city || null,
        state: form.state ? form.state.toUpperCase().slice(0, 2) : null,
        note: form.note || null,
      };
      if (form.id) {
        const { error } = await (sellerDb as any)
          .from("customers")
          .update(payload)
          .eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await (sellerDb as any).from("customers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(form.id ? "Cliente atualizado" : "Cliente cadastrado");
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });

  const detailMetrics = detail ? metricsByCustomer.get(detail.id) : undefined;
  const detailSales = useMemo(() => {
    if (!detail) return [];
    return (salesQ.data ?? [])
      .filter((s) => s.customer_id === detail.id)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [detail, salesQ.data]);

  if (ready.data === false) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        O núcleo de vendedores ainda não está ativo para este usuário.
      </div>
    );
  }

  const loading =
    customersQ.isLoading || salesQ.isLoading || itemsQ.isLoading || variantsQ.isLoading;

  return (
    <div className="space-y-4 pb-24 lg:pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <UsersIcon className="h-5 w-5 text-primary" /> Clientes / CRM
        </h1>
        <Button onClick={openNew} size="sm">
          <UserPlus className="h-4 w-4 mr-1" /> Novo cliente
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone, CPF ou e-mail"
            className="pl-9"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-xs rounded-full px-3 py-1.5 border transition ${
              filter === f.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
          Nenhum cliente encontrado com esses filtros.
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => {
            const m = metricsByCustomer.get(c.id);
            const isBirthday =
              c.birth_date && new Date(c.birth_date + "T00:00:00").getMonth() === new Date().getMonth();
            return (
              <button
                key={c.id}
                onClick={() => setDetail(c)}
                className="text-left rounded-2xl border border-border/60 bg-card p-4 hover:border-primary/60 transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.whatsapp
                        ? maskPhone(c.whatsapp)
                        : c.phone
                        ? maskPhone(c.phone)
                        : c.email || "—"}
                    </p>
                  </div>
                  {isBirthday && (
                    <span title="Aniversariante do mês" className="shrink-0">
                      <Cake className="h-4 w-4 text-pink-500" />
                    </span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">Compras</p>
                    <p className="text-sm font-semibold">{m?.count ?? 0}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">Total</p>
                    <p className="text-sm font-semibold">{brl(m?.total ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">Ticket</p>
                    <p className="text-sm font-semibold">{brl(m?.ticket ?? 0)}</p>
                  </div>
                </div>
                {m?.last && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Última compra {format(new Date(m.last), "dd/MM/yy", { locale: ptBR })}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Detalhe */}
      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {detail && (
            <div className="space-y-4">
              <SheetHeader>
                <SheetTitle>{detail.name}</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-muted p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Compras</p>
                  <p className="text-sm font-semibold">{detailMetrics?.count ?? 0}</p>
                </div>
                <div className="rounded-lg bg-muted p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Total</p>
                  <p className="text-sm font-semibold">{brl(detailMetrics?.total ?? 0)}</p>
                </div>
                <div className="rounded-lg bg-muted p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Ticket</p>
                  <p className="text-sm font-semibold">{brl(detailMetrics?.ticket ?? 0)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                {detail.cpf && <div><b>CPF:</b> {maskCpf(detail.cpf)}</div>}
                {detail.birth_date && (
                  <div>
                    <b>Nasc.:</b>{" "}
                    {format(new Date(detail.birth_date + "T00:00:00"), "dd/MM/yyyy")}
                  </div>
                )}
                {detail.email && <div className="col-span-2"><b>E-mail:</b> {detail.email}</div>}
                {(detail.address || detail.city) && (
                  <div className="col-span-2">
                    <b>Endereço:</b>{" "}
                    {[detail.address, detail.number, detail.complement, detail.district, detail.city, detail.state]
                      .filter(Boolean)
                      .join(", ")}
                    {detail.zip ? ` — ${maskCep(detail.zip)}` : ""}
                  </div>
                )}
                {detail.note && <div className="col-span-2"><b>Obs:</b> {detail.note}</div>}
              </div>
              <div className="flex flex-wrap gap-2">
                {detail.whatsapp && (
                  <a
                    href={`https://wa.me/55${detail.whatsapp.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-500 text-white px-3 py-1.5 text-xs"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                )}
                {detail.phone && (
                  <a
                    href={`tel:${detail.phone.replace(/\D/g, "")}`}
                    className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-xs"
                  >
                    <Phone className="h-3.5 w-3.5" /> Ligar
                  </a>
                )}
                <Button size="sm" variant="outline" onClick={() => openEdit(detail)}>
                  Editar
                </Button>
              </div>
              <div>
                <h4 className="text-sm font-semibold mb-2">Histórico de compras</h4>
                {detailSales.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma compra registrada.</p>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {detailSales.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between border-b border-border/40 py-1"
                      >
                        <span>{format(new Date(s.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}</span>
                        <span className="font-medium">{brl(Number(s.total_amount))}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {detailMetrics?.perfumes.length ? (
                  <div className="mt-3">
                    <p className="text-[11px] uppercase text-muted-foreground mb-1">
                      Perfumes comprados
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {detailMetrics.perfumes.map((p) => (
                        <span key={p} className="text-[11px] rounded-full bg-muted px-2 py-0.5">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Dialog cadastro/edição */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <span />
        </DialogTrigger>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar cliente" : "Novo cliente"}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div>
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Telefone</Label>
                <Input
                  value={maskPhone(form.phone)}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div>
                <Label>WhatsApp</Label>
                <Input
                  value={maskPhone(form.whatsapp)}
                  onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>CPF</Label>
                <Input
                  value={maskCpf(form.cpf)}
                  onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                />
              </div>
              <div>
                <Label>Data de nascimento</Label>
                <Input
                  type="date"
                  value={form.birth_date}
                  onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>E-mail</Label>
              <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <Label>CEP</Label>
                <div className="flex gap-1">
                  <Input
                    value={maskCep(form.zip)}
                    onChange={(e) => setForm({ ...form, zip: e.target.value })}
                    onBlur={autofillCep}
                  />
                  {cepLoading && <Loader2 className="h-4 w-4 animate-spin self-center" />}
                </div>
              </div>
              <div className="col-span-2">
                <Label>Endereço</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Número</Label>
                <Input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>Complemento</Label>
                <Input value={form.complement} onChange={(e) => setForm({ ...form, complement: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Bairro</Label>
                <Input value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} />
              </div>
              <div>
                <Label>Cidade</Label>
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div>
                <Label>UF</Label>
                <Input
                  maxLength={2}
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
                />
              </div>
            </div>
            <div>
              <Label>Observação</Label>
              <Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}