import { supabase } from "@/integrations/supabase/client";

export type MovementType =
  | "initial"
  | "restock"
  | "sale"
  | "sale_reversal"
  | "adjustment";

export async function logMovement(params: {
  userId: string;
  productId: string;
  type: MovementType;
  mlChange: number;
  mlAfter: number;
  note?: string | null;
  saleId?: string | null;
}) {
  const { error } = await supabase.from("stock_movements").insert({
    user_id: params.userId,
    product_id: params.productId,
    type: params.type,
    ml_change: params.mlChange,
    ml_after: params.mlAfter,
    note: params.note ?? null,
    sale_id: params.saleId ?? null,
  });
  if (error) throw error;
}

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  initial: "Estoque inicial",
  restock: "Entrada",
  sale: "Venda",
  sale_reversal: "Venda estornada",
  adjustment: "Ajuste",
};