// Cliente Supabase tipado para o núcleo de vendedores (migration
// `20260728120000_seller_core.sql`, ainda NÃO aplicada). Enquanto as
// tabelas não existirem no banco, as queries falham em runtime e a UI
// exibe um aviso. Isso evita `supabase as any` no código de tela.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./client";

export type CommissionKind = "fixed_per_unit" | "profit_percentage";

export interface SellerRow {
  id: string;
  owner_id: string;
  user_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  commission_kind: CommissionKind;
  commission_value: number;
  created_at: string;
  updated_at: string;
}
export interface CustomerRow {
  id: string; owner_id: string; name: string;
  phone: string | null; email: string | null; note: string | null;
  created_at: string; updated_at: string;
}
export interface StockLocationRow {
  id: string; owner_id: string; name: string;
  kind: "warehouse" | "seller" | "customer" | "virtual";
  seller_id: string | null; active: boolean; created_at: string;
}
export interface ProductVariantRow {
  id: string; owner_id: string; product_id: string;
  volume_ml: number; sku: string | null; barcode: string | null;
  unit_cost: number; unit_price: number; is_default: boolean;
  created_at: string; updated_at: string;
}
export interface SaleV2Row {
  id: string; owner_id: string; seller_id: string | null;
  customer_id: string | null; location_id: string; status: "confirmed" | "reversed";
  total_amount: number; total_cost: number; total_commission: number;
  note: string | null; created_at: string;
  reversed_at: string | null; reversed_reason: string | null;
}
export interface SaleItemRow {
  id: string; sale_id: string; variant_id: string; quantity: number;
  unit_price: number; unit_cost: number;
  commission_kind: CommissionKind; commission_value: number; commission_amount: number;
}
export interface SettlementRow {
  id: string; owner_id: string; seller_id: string;
  amount: number; method: string | null; note: string | null; created_at: string;
}

export interface SellerCoreDatabase {
  public: {
    Tables: {
      sellers_v2: { Row: SellerRow; Insert: Partial<SellerRow> & Pick<SellerRow, "owner_id" | "name">; Update: Partial<SellerRow> };
      customers: { Row: CustomerRow; Insert: Partial<CustomerRow> & Pick<CustomerRow, "owner_id" | "name">; Update: Partial<CustomerRow> };
      stock_locations: { Row: StockLocationRow; Insert: Partial<StockLocationRow> & Pick<StockLocationRow, "owner_id" | "name" | "kind">; Update: Partial<StockLocationRow> };
      product_variants: { Row: ProductVariantRow; Insert: Partial<ProductVariantRow> & Pick<ProductVariantRow, "owner_id" | "product_id" | "volume_ml">; Update: Partial<ProductVariantRow> };
      sales_v2: { Row: SaleV2Row; Insert: Partial<SaleV2Row> & Pick<SaleV2Row, "owner_id" | "location_id">; Update: Partial<SaleV2Row> };
      sale_items: { Row: SaleItemRow; Insert: Partial<SaleItemRow> & Pick<SaleItemRow, "sale_id" | "variant_id" | "quantity" | "unit_price" | "unit_cost" | "commission_kind" | "commission_value">; Update: Partial<SaleItemRow> };
      settlements: { Row: SettlementRow; Insert: Partial<SettlementRow> & Pick<SettlementRow, "owner_id" | "seller_id" | "amount">; Update: Partial<SettlementRow> };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export const sellerDb = supabase as unknown as SupabaseClient<SellerCoreDatabase>;

export async function isSellerCoreReady(): Promise<boolean> {
  try {
    const { error } = await sellerDb.from("sellers_v2").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}