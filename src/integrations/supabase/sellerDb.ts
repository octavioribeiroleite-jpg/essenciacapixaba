import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./client";

export type CommissionKind = "fixed_per_unit" | "profit_percentage";
export type ActorRole = "admin" | "seller";

export interface ActorContext {
  role: ActorRole;
  owner_id: string;
  seller_id: string | null;
}

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
  id: string;
  owner_id: string;
  seller_id: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockLocationRow {
  id: string;
  owner_id: string;
  name: string;
  kind: "warehouse" | "seller" | "virtual";
  seller_id: string | null;
  active: boolean;
  created_at: string;
}

export interface ProductVariantRow {
  id: string;
  owner_id: string;
  product_id: string;
  volume_ml: number;
  sku: string | null;
  barcode: string | null;
  unit_cost: number;
  unit_price: number;
  is_default: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StockBalanceRow {
  owner_id: string;
  variant_id: string;
  location_id: string;
  balance: number;
  reserved?: number;
  available?: number;
}

export interface TransferRow {
  id: string;
  owner_id: string;
  from_location: string;
  to_location: string;
  status: "in_transit" | "received" | "cancelled";
  note: string | null;
  created_by: string;
  created_at: string;
  received_at: string | null;
  cancelled_at: string | null;
}

export interface SaleV2Row {
  id: string;
  owner_id: string;
  seller_id: string | null;
  customer_id: string | null;
  location_id: string;
  status: "confirmed" | "reversed";
  total_amount: number;
  total_cost: number;
  total_commission: number;
  note: string | null;
  created_by: string;
  created_at: string;
  reversed_at: string | null;
  reversed_reason: string | null;
}

export interface SettlementRow {
  id: string;
  owner_id: string;
  seller_id: string;
  amount: number;
  status: "confirmed" | "reversed";
  method: string | null;
  note: string | null;
  created_at: string;
  reversed_at: string | null;
  reversed_reason: string | null;
}

export interface CommissionBalanceRow {
  owner_id: string;
  seller_id: string;
  total_earned: number;
  total_paid: number;
  total_due: number;
}

export interface VariantCatalogRow extends ProductVariantRow {
  product_name: string;
  brand: string | null;
}

type TableDef<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type ViewDef<Row> = {
  Row: Row;
  Relationships: [];
};

export interface SellerCoreDatabase {
  public: {
    Tables: {
      sellers_v2: TableDef<
        SellerRow,
        Partial<SellerRow> & Pick<SellerRow, "owner_id" | "name">
      >;
      customers: TableDef<CustomerRow>;
      stock_locations: TableDef<StockLocationRow>;
      product_variants: TableDef<ProductVariantRow>;
      transfers: TableDef<TransferRow>;
      sales_v2: TableDef<SaleV2Row>;
      settlements: TableDef<SettlementRow>;
    };
    Views: {
      v_stock_balances: ViewDef<StockBalanceRow>;
      v_available_stock: ViewDef<StockBalanceRow>;
      v_seller_commission: ViewDef<CommissionBalanceRow>;
      v_variant_catalog: ViewDef<VariantCatalogRow>;
    };
    Functions: Record<string, never>;
    Enums: {
      app_role: ActorRole;
      commission_kind: CommissionKind;
    };
    CompositeTypes: Record<string, never>;
  };
}

export const sellerDb = supabase as unknown as SupabaseClient<SellerCoreDatabase>;

export async function isSellerCoreReady(): Promise<boolean> {
  const { error } = await sellerDb.rpc("rpc_actor_context" as never);
  return !error;
}

export async function getActorContext(): Promise<ActorContext> {
  const { data, error } = await sellerDb.rpc("rpc_actor_context" as never);
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as ActorContext | undefined;
  if (!row) throw new Error("Usuário sem perfil no núcleo de vendedores");
  return row;
}
