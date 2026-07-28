// Cliente Supabase tipado para o núcleo de vendedores (migration
// `supabase/pending-migrations/20260728130000_seller_core.sql`, NÃO
// aplicada). Enquanto as tabelas não existirem no banco, as queries falham
// em runtime e a UI exibe um aviso. Isto elimina `supabase as any` na UI.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./client";

export type CommissionKind = "fixed_per_unit" | "profit_percentage";
export type AppRole = "admin" | "seller";
export type MovementKind =
  | "initial" | "restock" | "transfer_out" | "transfer_in"
  | "sale" | "return" | "loss" | "adjustment" | "reversal";
export type TransferStatus = "draft" | "in_transit" | "received" | "cancelled";
export type LocationKind = "warehouse" | "seller" | "customer" | "virtual";

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
  amount: number; method: string | null; note: string | null;
  reversed: boolean; created_at: string;
}
export interface TransferRow {
  id: string; owner_id: string;
  from_location: string; to_location: string;
  status: TransferStatus; note: string | null;
  shipped_at: string | null; received_at: string | null;
  cancelled_at: string | null; created_at: string;
}
export interface TransferItemRow {
  id: string; transfer_id: string; variant_id: string;
  quantity: number; received_quantity: number | null;
}
export interface ProfileRow {
  id: string; full_name: string | null; phone: string | null;
  created_at: string; updated_at: string;
}
export interface UserRoleRow {
  id: string; user_id: string; role: AppRole; created_at: string;
}
export interface InventoryMovementRow {
  id: string; owner_id: string; variant_id: string; location_id: string;
  kind: MovementKind; quantity: number;
  ref_table: string | null; ref_id: string | null; note: string | null;
  created_by: string; created_at: string;
}
export interface StockBalanceRow {
  owner_id: string; variant_id: string; location_id: string; balance: number;
}
export interface SellerCommissionRow {
  owner_id: string; seller_id: string; total_earned: number; total_paid: number;
}

// Insert/Update permissivos: a validação final é feita nas RPCs
// SECURITY DEFINER; a UI só precisa dos Row-types para leitura.
type Loose = Record<string, unknown>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rels = any[];

export interface SellerCoreDatabase {
  public: {
    Tables: {
      profiles:                { Row: ProfileRow;             Insert: Loose; Update: Loose; Relationships: Rels };
      user_roles:              { Row: UserRoleRow;            Insert: Loose; Update: Loose; Relationships: Rels };
      sellers_v2:              { Row: SellerRow;              Insert: Loose; Update: Loose; Relationships: Rels };
      customers:               { Row: CustomerRow;            Insert: Loose; Update: Loose; Relationships: Rels };
      stock_locations:         { Row: StockLocationRow;       Insert: Loose; Update: Loose; Relationships: Rels };
      product_variants:        { Row: ProductVariantRow;      Insert: Loose; Update: Loose; Relationships: Rels };
      inventory_movements:     { Row: InventoryMovementRow;   Insert: Loose; Update: Loose; Relationships: Rels };
      transfers:               { Row: TransferRow;            Insert: Loose; Update: Loose; Relationships: Rels };
      transfer_items:          { Row: TransferItemRow;        Insert: Loose; Update: Loose; Relationships: Rels };
      sales_v2:                { Row: SaleV2Row;              Insert: Loose; Update: Loose; Relationships: Rels };
      sale_items:              { Row: SaleItemRow;            Insert: Loose; Update: Loose; Relationships: Rels };
      settlements:             { Row: SettlementRow;          Insert: Loose; Update: Loose; Relationships: Rels };
      settlement_allocations:  { Row: { id: string; settlement_id: string; sale_item_id: string; amount: number }; Insert: Loose; Update: Loose; Relationships: Rels };
      audit_events:            { Row: { id: string; owner_id: string; actor_id: string | null; action: string; entity: string; entity_id: string | null; payload: unknown; created_at: string }; Insert: Loose; Update: Loose; Relationships: Rels };
    };
    Views: {
      v_stock_balances:    { Row: StockBalanceRow;     Insert: never; Update: never; Relationships: Rels };
      v_seller_commission: { Row: SellerCommissionRow; Insert: never; Update: never; Relationships: Rels };
    };
    Functions: {
      current_user_role: { Args: Record<string, never>; Returns: AppRole };
      rpc_register_sale: { Args: { p_sale: unknown }; Returns: string };
      rpc_reverse_sale:  { Args: { p_sale: string; p_reason: string }; Returns: void };
      rpc_adjust_stock:  { Args: { p_variant: string; p_location: string; p_kind: MovementKind; p_qty: number; p_note: string | null }; Returns: void };
      rpc_send_transfer:    { Args: { p_transfer: unknown }; Returns: string };
      rpc_cancel_transfer:  { Args: { p_transfer: string; p_reason: string | null }; Returns: void };
      rpc_receive_transfer: { Args: { p_transfer: string; p_items: unknown }; Returns: void };
      rpc_settle:              { Args: { p_seller: string; p_amount: number; p_method: string | null; p_note: string | null }; Returns: string };
      rpc_reverse_settlement:  { Args: { p_settlement: string; p_reason: string | null }; Returns: void };
    };
    Enums: {
      app_role: AppRole;
      commission_kind: CommissionKind;
      movement_kind: MovementKind;
      transfer_status: TransferStatus;
      location_kind: LocationKind;
    };
    CompositeTypes: Record<string, never>;
  };
}

// A tipagem `SellerCoreDatabase` está definida acima para documentar as
// tabelas, RPCs e views. O cliente em runtime, porém, é exposto sem
// generic para acomodar Insert/Update livres — a validação real vive nas
// RPCs SECURITY DEFINER. Os componentes tipam as leituras via
// `as SellerRow[]` / `as StockBalanceRow[]` etc.
export const sellerDb: SupabaseClient = supabase as unknown as SupabaseClient;
export type { SellerCoreDatabase as _SellerCoreDatabaseSchema };

export async function isSellerCoreReady(): Promise<boolean> {
  try {
    const { error } = await sellerDb.from("sellers_v2").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}

/** Papel efetivo do usuário atual (admin | seller | null). */
export async function fetchCurrentRole(): Promise<AppRole | null> {
  try {
    const { data, error } = await sellerDb.rpc("current_user_role");
    if (error) return null;
    return (data as AppRole | null) ?? null;
  } catch {
    return null;
  }
}