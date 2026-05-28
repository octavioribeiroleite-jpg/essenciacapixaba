import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ML_PER_FRASCO, perFrasco, priceFrascoRounded, formatFrascos } from "@/lib/frascos";
import { ArrowLeft, Wallet, Package, TrendingUp, DollarSign, AlertTriangle, ArrowUpDown, ChevronDown } from "lucide-react";

type SortKey = "valor" | "nome" | "estoque" | "lucro";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function Patrimonio() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [sort, setSort] = useState<SortKey>("valor");
  const [showZerados, setShowZerados] = useState(false);

  const { data: products, isLoading } = useQuery({
    queryKey: ["patrimonio-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,brand,image_url,current_ml,total_ml,cost_per_ml,sale_price_per_ml");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const rows = useMemo(() => {
    const list = (products ?? []).map((p) => {
      const frascos = Number(p.current_ml) / ML_PER_FRASCO;
      const custoFrasco = perFrasco(p.cost_per_ml);
      const vendaFrasco = priceFrascoRounded(p.sale_price_per_ml);
      const investido = custoFrasco * frascos;
      const potencial = vendaFrasco * frascos;
      const lucro = potencial - investido;
      return {
        id: p.id,
        name: p.name,
        brand: p.brand,
        image_url: p.image_url,
        frascos,
        custoFrasco,
        vendaFrasco,
        investido,
        potencial,
        lucro,
      };
    });

    list.sort((a, b) => {
      if (sort === "nome") return a.name.localeCompare(b.name);
      if (sort === "estoque") return b.frascos - a.frascos;
      if (sort === "lucro") return b.lucro - a.lucro;
      return b.potencial - a.potencial;
    });
    return list;
  }, [products, sort]);

  const totais = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        frascos: acc.frascos + r.frascos,
        investido: acc.investido + r.investido,
        potencial: acc.potencial + r.potencial,
        lucro: acc.lucro + r.lucro,
        zerados: acc.zerados + (r.frascos === 0 ? 1 : 0),
      }),
      { frascos: 0, investido: 0, potencial: 0, lucro: 0, zerados: 0 }
    );
  }, [rows]);

  const margem = totais.investido > 0 ? (totais.lucro / totais.investido) * 100 : 0;
  const rowsComEstoque = rows.filter((r) => r.frascos > 0);
  const rowsZerados = rows.filter((r) => r.frascos === 0);

  return (
    <div className="p-4 lg:p-0 space-y-4 max-w-lg lg:max-w-7xl mx-auto pb-24 lg:pb-8">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/dashboard")}
          className="h-9 w-9 rounded-xl bg-card border border-border/60 flex items-center justify-center hover:bg-secondary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-tight">Patrimônio</h1>
          <p className="text-xs text-muted-foreground">Visão financeira do estoque atual</p>
        </div>
      </div>

      {/* Hero card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary/90 to-amber-400 p-5 text-white shadow-lg">
        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/85 font-semibold">
            <Wallet className="w-3.5 h-3.5" /> Valor potencial de venda
          </div>
          <p className="text-3xl sm:text-4xl font-bold mt-1">{brl(totais.potencial)}</p>
          <p className="text-xs text-white/85 mt-1">
            {formatFrascos(totais.frascos * ML_PER_FRASCO)} frasco(s) em estoque
            {totais.zerados > 0 && ` · ${totais.zerados} esgotado(s)`}
          </p>
        </div>
      </div>

      {/* Cards resumo 2x2 */}
      <div className="grid grid-cols-2 gap-2.5">
        <SummaryCard
          icon={DollarSign}
          label="Investido"
          value={brl(totais.investido)}
          sub="custo total"
          gradient="from-rose-400 to-red-500"
        />
        <SummaryCard
          icon={TrendingUp}
          label="Lucro previsto"
          value={brl(totais.lucro)}
          sub={`margem ${margem.toFixed(0)}%`}
          gradient="from-emerald-400 to-green-500"
        />
        <SummaryCard
          icon={Package}
          label="Produtos ativos"
          value={String(rowsComEstoque.length)}
          sub={`de ${rows.length} cadastrados`}
          gradient="from-sky-400 to-blue-500"
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Esgotados"
          value={String(totais.zerados)}
          sub="sem estoque"
          gradient="from-amber-400 to-orange-500"
        />
      </div>

      {/* Filtros sort */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <h2 className="text-sm font-semibold text-foreground">Detalhamento por produto</h2>
        <div className="flex items-center gap-1 text-xs">
          <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="bg-card border border-border/60 rounded-lg px-2 py-1 text-xs"
          >
            <option value="valor">Maior valor</option>
            <option value="lucro">Maior lucro</option>
            <option value="estoque">Mais estoque</option>
            <option value="nome">A → Z</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 bg-card rounded-xl border border-border/60 animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          Nenhum produto cadastrado ainda.
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            {rowsComEstoque.map((r, idx) => (
              <button
                key={r.id}
                onClick={() => navigate(`/products/${r.id}`)}
                className={`w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-secondary/60 transition-colors ${
                  idx !== rowsComEstoque.length - 1 ? "border-b border-border/40" : ""
                }`}
              >
                <div className="h-11 w-11 rounded-lg overflow-hidden bg-muted shrink-0 border border-border/50">
                  {r.image_url ? (
                    <img src={r.image_url} alt={r.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-amber-200 text-primary text-sm font-bold">
                      {r.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{r.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {r.brand || "—"} · {formatFrascos(r.frascos * ML_PER_FRASCO)} frasco(s) ·{" "}
                    custo {brl(r.custoFrasco)}/un
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-primary">{brl(r.potencial)}</p>
                  <p className="text-[11px] text-emerald-600 font-medium">+{brl(r.lucro)}</p>
                </div>
              </button>
            ))}
            {rowsComEstoque.length === 0 && (
              <p className="text-center text-xs text-muted-foreground py-6">
                Nenhum produto com estoque no momento.
              </p>
            )}
          </div>

          {rowsZerados.length > 0 && (
            <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
              <button
                onClick={() => setShowZerados((v) => !v)}
                className="w-full flex items-center gap-3 px-3 py-3 hover:bg-secondary/60 transition-colors"
              >
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-semibold text-foreground">Indisponíveis</p>
                  <p className="text-[11px] text-muted-foreground">
                    {rowsZerados.length} produto(s) sem estoque · sob encomenda
                  </p>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-muted-foreground transition-transform ${
                    showZerados ? "rotate-180" : ""
                  }`}
                />
              </button>
              {showZerados && (
                <div className="border-t border-border/40">
                  {rowsZerados.map((r, idx) => (
                    <button
                      key={r.id}
                      onClick={() => navigate(`/products/${r.id}`)}
                      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-secondary/60 transition-colors opacity-75 ${
                        idx !== rowsZerados.length - 1 ? "border-b border-border/40" : ""
                      }`}
                    >
                      <div className="h-9 w-9 rounded-lg overflow-hidden bg-muted shrink-0 border border-border/50">
                        {r.image_url ? (
                          <img src={r.image_url} alt={r.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-amber-200 text-primary text-xs font-bold">
                            {r.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{r.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {r.brand || "—"} · venda {brl(r.vendaFrasco)}/un
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <p className="text-[10px] text-center text-muted-foreground pt-2">
        Valores baseados em preço de venda arredondado e estoque atual.
      </p>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  gradient,
}: {
  icon: any;
  label: string;
  value: string;
  sub?: string;
  gradient: string;
}) {
  return (
    <div className="bg-card rounded-2xl border border-border/60 p-3.5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <div className={`h-8 w-8 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-sm`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
      </div>
      <p className="text-base font-bold text-foreground leading-tight break-words">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}