// Classificação automática de perfumes baseada nas vendas dos últimos 60 dias.
// 🟢 Verde: 3+ vendas | 🟡 Amarelo: 1-2 vendas | 🔴 Vermelho: 0 vendas | ⚪ Cinza: novo (< 30d sem vendas)
import { ML_PER_FRASCO } from "./frascos";

export type Tier = "green" | "yellow" | "red" | "gray";

export interface Classification {
  tier: Tier;
  salesCount: number;
  label: string;
  color: string;
  bgColor: string;
  description: string;
}

export const DAYS_WINDOW = 60;

interface SaleRow {
  product_id: string;
  ml_sold: number | string;
  created_at: string;
}

interface ProductRow {
  id: string;
  created_at: string;
}

export function classifyProducts(
  products: ProductRow[],
  sales: SaleRow[]
): Map<string, Classification> {
  const cutoff = Date.now() - DAYS_WINDOW * 24 * 60 * 60 * 1000;
  const counts = new Map<string, number>();

  for (const s of sales) {
    const t = new Date(s.created_at).getTime();
    if (t < cutoff) continue;
    const frascos = (Number(s.ml_sold) || 0) / ML_PER_FRASCO;
    counts.set(s.product_id, (counts.get(s.product_id) || 0) + frascos);
  }

  const map = new Map<string, Classification>();
  const newCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

  for (const p of products) {
    const sold = Math.round(counts.get(p.id) || 0);
    const isNew = new Date(p.created_at).getTime() > newCutoff;
    map.set(p.id, buildClassification(sold, isNew));
  }
  return map;
}

function buildClassification(salesCount: number, isNew: boolean): Classification {
  if (salesCount >= 3) {
    return {
      tier: "green",
      salesCount,
      label: "Alta demanda",
      color: "bg-emerald-500",
      bgColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
      description: "Estocar mais — entre os mais vendidos",
    };
  }
  if (salesCount >= 1) {
    return {
      tier: "yellow",
      salesCount,
      label: "Demanda média",
      color: "bg-amber-400",
      bgColor: "bg-amber-50 text-amber-700 border-amber-200",
      description: "Manter em estoque",
    };
  }
  if (isNew) {
    return {
      tier: "gray",
      salesCount: 0,
      label: "Novo",
      color: "bg-slate-300",
      bgColor: "bg-slate-50 text-slate-600 border-slate-200",
      description: "Cadastrado há pouco — sem histórico ainda",
    };
  }
  return {
    tier: "red",
    salesCount: 0,
    label: "Sem giro",
    color: "bg-red-500",
    bgColor: "bg-red-50 text-red-700 border-red-200",
    description: "Não repor — não vendeu nos últimos 60 dias",
  };
}

export const TIER_ORDER: Record<Tier, number> = { green: 0, yellow: 1, gray: 2, red: 3 };

export function suggestedQuantity(tier: Tier): number {
  if (tier === "green") return 3;
  if (tier === "yellow") return 2;
  return 1;
}