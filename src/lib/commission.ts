// Regras puras de comissão e saldos — usadas na UI e testadas.
// Regras: fixed_per_unit = valor * quantidade;
// profit_percentage = max(0, preço - custo) * quantidade * (percentual/100).
// Snapshots congelam preço, custo, tipo e valor da comissão no ato da venda.

export type CommissionKind = "fixed_per_unit" | "profit_percentage";

export interface CommissionSnapshot {
  kind: CommissionKind;
  value: number;      // R$ por unidade quando fixed, % (0-100) quando percentage
  unitPrice: number;  // preço efetivo praticado
  unitCost: number;   // custo unitário congelado
  quantity: number;
}

export function calcCommission(s: CommissionSnapshot): number {
  const q = Number(s.quantity) || 0;
  if (q <= 0) return 0;
  if (s.kind === "fixed_per_unit") return round2((Number(s.value) || 0) * q);
  const profit = Math.max(0, (Number(s.unitPrice) || 0) - (Number(s.unitCost) || 0));
  return round2(profit * q * ((Number(s.value) || 0) / 100));
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ---------- Saldo de estoque a partir de movimentos ----------
export interface Movement {
  variantId: string;
  locationId: string;
  quantity: number; // positivo entra, negativo sai
}

export function stockBalance(
  movs: Movement[],
  variantId: string,
  locationId: string
): number {
  return movs
    .filter((m) => m.variantId === variantId && m.locationId === locationId)
    .reduce((acc, m) => acc + (Number(m.quantity) || 0), 0);
}

// ---------- Saldo devido de comissão / limite de repasse ----------
export interface SaleItemLike {
  commissionAmount: number;
  paidAmount: number; // soma das alocações já feitas
}

export function commissionDue(items: SaleItemLike[]): number {
  return round2(
    items.reduce(
      (acc, i) =>
        acc + Math.max(0, (Number(i.commissionAmount) || 0) - (Number(i.paidAmount) || 0)),
      0
    )
  );
}

/** Limita e aloca um valor de repasse FIFO sobre os itens pendentes. */
export function allocateSettlement(
  items: SaleItemLike[],
  amount: number
): { allocations: { index: number; amount: number }[]; remaining: number; used: number } {
  const cap = commissionDue(items);
  if (amount <= 0) throw new Error("Valor do repasse deve ser positivo");
  if (amount > cap + 1e-9) throw new Error("Repasse excede saldo devido");
  let remaining = amount;
  const allocations: { index: number; amount: number }[] = [];
  items.forEach((it, index) => {
    if (remaining <= 0) return;
    const due = Math.max(0, (it.commissionAmount || 0) - (it.paidAmount || 0));
    if (due <= 0) return;
    const take = Math.min(remaining, due);
    allocations.push({ index, amount: round2(take) });
    remaining = round2(remaining - take);
  });
  return { allocations, remaining, used: round2(amount - remaining) };
}

// ---------- Normalização de telefone (unicidade por owner) ----------
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  return digits.length ? digits : null;
}