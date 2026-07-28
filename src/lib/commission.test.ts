import { describe, it, expect } from "vitest";
import {
  calcCommission,
  stockBalance,
  commissionDue,
  allocateSettlement,
  normalizePhone,
} from "./commission";

describe("calcCommission", () => {
  it("fixed_per_unit multiplica valor por quantidade", () => {
    expect(
      calcCommission({ kind: "fixed_per_unit", value: 15, unitPrice: 260, unitCost: 160, quantity: 3 }),
    ).toBe(45);
  });
  it("profit_percentage usa lucro = preço - custo", () => {
    // lucro = 260-160 = 100; 100 * 2 * 30% = 60
    expect(
      calcCommission({ kind: "profit_percentage", value: 30, unitPrice: 260, unitCost: 160, quantity: 2 }),
    ).toBe(60);
  });
  it("profit_percentage nunca fica negativo", () => {
    expect(
      calcCommission({ kind: "profit_percentage", value: 40, unitPrice: 100, unitCost: 150, quantity: 5 }),
    ).toBe(0);
  });
  it("quantidade <= 0 retorna zero", () => {
    expect(
      calcCommission({ kind: "fixed_per_unit", value: 20, unitPrice: 260, unitCost: 160, quantity: 0 }),
    ).toBe(0);
  });
});

describe("stockBalance após transferência/venda/devolução/estorno", () => {
  const V = "v1", W = "warehouse", S = "seller";
  const movs = [
    { variantId: V, locationId: W, quantity: 10 },         // entrada inicial
    { variantId: V, locationId: W, quantity: -3 },         // transfer_out
    { variantId: V, locationId: S, quantity: 3 },          // transfer_in
    { variantId: V, locationId: S, quantity: -2 },         // sale
    { variantId: V, locationId: S, quantity: 1 },          // return
    { variantId: V, locationId: S, quantity: 1 },          // reversal de venda
  ];
  it("saldo warehouse", () => expect(stockBalance(movs, V, W)).toBe(7));
  it("saldo seller reflete venda+devolução+estorno", () =>
    expect(stockBalance(movs, V, S)).toBe(3));
});

describe("allocateSettlement (repasse parcial)", () => {
  const items = [
    { commissionAmount: 40, paidAmount: 0 },
    { commissionAmount: 25, paidAmount: 10 },
    { commissionAmount: 20, paidAmount: 20 }, // já quitado
  ];
  it("saldo devido considera pagamentos anteriores", () => {
    expect(commissionDue(items)).toBe(55);
  });
  it("aloca FIFO respeitando o devido de cada item", () => {
    const r = allocateSettlement(items, 45);
    expect(r.used).toBe(45);
    expect(r.remaining).toBe(0);
    expect(r.allocations).toEqual([
      { index: 0, amount: 40 },
      { index: 1, amount: 5 },
    ]);
  });
  it("rejeita valor acima do saldo devido", () => {
    expect(() => allocateSettlement(items, 56)).toThrow(/excede/i);
  });
  it("rejeita valor não positivo", () => {
    expect(() => allocateSettlement(items, 0)).toThrow();
  });
});

describe("normalizePhone", () => {
  it("mantém somente dígitos", () => {
    expect(normalizePhone("+55 (27) 98876-7528")).toBe("5527988767528");
  });
  it("string vazia vira null", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

// ------------------------------------------------------------------
// Regras de autorização/estado (espelham a RPC no servidor)
// ------------------------------------------------------------------

type Role = "admin" | "seller";

/** Espelho puro da checagem `rpc_reverse_sale` (para admin + estado). */
function canReverseSale(role: Role, sale: { status: "confirmed" | "reversed"; hasSettlementAllocations: boolean }, reason: string) {
  if (role !== "admin") return { ok: false, err: "apenas admin" };
  if (!reason || reason.trim().length < 3) return { ok: false, err: "justificativa obrigatória" };
  if (sale.status === "reversed") return { ok: false, err: "venda já estornada" };
  if (sale.hasSettlementAllocations) return { ok: false, err: "reverta o repasse antes" };
  return { ok: true as const };
}

describe("autorização de estorno de venda", () => {
  it("seller nunca pode estornar", () => {
    expect(canReverseSale("seller", { status: "confirmed", hasSettlementAllocations: false }, "erro").ok).toBe(false);
  });
  it("rejeita venda já estornada", () => {
    expect(canReverseSale("admin", { status: "reversed", hasSettlementAllocations: false }, "engano").ok).toBe(false);
  });
  it("rejeita quando há comissão já repassada", () => {
    const r = canReverseSale("admin", { status: "confirmed", hasSettlementAllocations: true }, "cliente devolveu");
    expect(r.ok).toBe(false);
    expect(r.err).toMatch(/repasse/);
  });
  it("exige justificativa mínima", () => {
    expect(canReverseSale("admin", { status: "confirmed", hasSettlementAllocations: false }, "a").ok).toBe(false);
  });
  it("aceita admin com justificativa e sem repasse", () => {
    expect(canReverseSale("admin", { status: "confirmed", hasSettlementAllocations: false }, "cliente devolveu").ok).toBe(true);
  });
});

/** Espelho da checagem `rpc_adjust_stock` para sinal por kind. */
type Kind = "initial" | "restock" | "return" | "loss" | "adjustment";
function validateAdjust(kind: Kind, qty: number) {
  if (qty === 0) return "quantidade não pode ser zero";
  if (kind === "loss" && qty >= 0) return "loss precisa ser negativo";
  if ((kind === "initial" || kind === "restock" || kind === "return") && qty <= 0)
    return "entrada precisa ser positiva";
  return null;
}
describe("sinal coerente por kind em ajuste", () => {
  it("loss exige negativo", () => expect(validateAdjust("loss", 3)).toMatch(/negativo/));
  it("restock exige positivo", () => expect(validateAdjust("restock", -1)).toMatch(/positiva/));
  it("adjustment aceita qualquer sinal, exceto zero", () => {
    expect(validateAdjust("adjustment", 0)).toMatch(/zero/);
    expect(validateAdjust("adjustment", -2)).toBeNull();
    expect(validateAdjust("adjustment", 2)).toBeNull();
  });
});

/** Alocação de repasse: garantia de que overpayment concorrente é rejeitado. */
describe("saldo devido após repasse anterior", () => {
  it("bloqueia overpayment mesmo com FIFO", () => {
    const items = [{ commissionAmount: 40, paidAmount: 40 }, { commissionAmount: 10, paidAmount: 0 }];
    expect(commissionDue(items)).toBe(10);
    expect(() => allocateSettlement(items, 11)).toThrow(/excede/);
  });
});