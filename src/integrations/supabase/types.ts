export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_events: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          owner_id: string
          payload: Json | null
        }
        Insert: {
          action: string
          actor_id?: string
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          owner_id: string
          payload?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          owner_id?: string
          payload?: Json | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          birth_date: string | null
          city: string | null
          complement: string | null
          cpf: string | null
          created_at: string
          district: string | null
          email: string | null
          id: string
          name: string
          note: string | null
          number: string | null
          owner_id: string
          phone: string | null
          seller_id: string | null
          state: string | null
          updated_at: string
          whatsapp: string | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          city?: string | null
          complement?: string | null
          cpf?: string | null
          created_at?: string
          district?: string | null
          email?: string | null
          id?: string
          name: string
          note?: string | null
          number?: string | null
          owner_id: string
          phone?: string | null
          seller_id?: string | null
          state?: string | null
          updated_at?: string
          whatsapp?: string | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          city?: string | null
          complement?: string | null
          cpf?: string | null
          created_at?: string
          district?: string | null
          email?: string | null
          id?: string
          name?: string
          note?: string | null
          number?: string | null
          owner_id?: string
          phone?: string | null
          seller_id?: string | null
          state?: string | null
          updated_at?: string
          whatsapp?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "v_seller_commission"
            referencedColumns: ["seller_id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          created_by: string
          id: string
          kind: Database["public"]["Enums"]["movement_kind"]
          location_id: string
          note: string | null
          owner_id: string
          quantity: number
          ref_id: string | null
          ref_table: string | null
          variant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          kind: Database["public"]["Enums"]["movement_kind"]
          location_id: string
          note?: string | null
          owner_id: string
          quantity: number
          ref_id?: string | null
          ref_table?: string | null
          variant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          kind?: Database["public"]["Enums"]["movement_kind"]
          location_id?: string
          note?: string | null
          owner_id?: string
          quantity?: number
          ref_id?: string | null
          ref_table?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v_variant_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          active: boolean
          barcode: string | null
          created_at: string
          id: string
          is_default: boolean
          owner_id: string
          product_id: string
          sku: string | null
          unit_cost: number
          unit_price: number
          updated_at: string
          volume_ml: number
        }
        Insert: {
          active?: boolean
          barcode?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          owner_id: string
          product_id: string
          sku?: string | null
          unit_cost?: number
          unit_price?: number
          updated_at?: string
          volume_ml: number
        }
        Update: {
          active?: boolean
          barcode?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          owner_id?: string
          product_id?: string
          sku?: string | null
          unit_cost?: number
          unit_price?: number
          updated_at?: string
          volume_ml?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand: string | null
          concentration: string | null
          cost_per_ml: number
          created_at: string
          current_ml: number
          description: string | null
          fragrance_notes: Json | null
          gender: string | null
          id: string
          image_url: string | null
          longevity: string | null
          name: string
          occasions: string[] | null
          olfactory_family: string | null
          sale_price_per_ml: number
          sillage: string | null
          total_ml: number
          updated_at: string
          user_id: string
        }
        Insert: {
          brand?: string | null
          concentration?: string | null
          cost_per_ml?: number
          created_at?: string
          current_ml?: number
          description?: string | null
          fragrance_notes?: Json | null
          gender?: string | null
          id?: string
          image_url?: string | null
          longevity?: string | null
          name: string
          occasions?: string[] | null
          olfactory_family?: string | null
          sale_price_per_ml?: number
          sillage?: string | null
          total_ml?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          brand?: string | null
          concentration?: string | null
          cost_per_ml?: number
          created_at?: string
          current_ml?: number
          description?: string | null
          fragrance_notes?: Json | null
          gender?: string | null
          id?: string
          image_url?: string | null
          longevity?: string | null
          name?: string
          occasions?: string[] | null
          olfactory_family?: string | null
          sale_price_per_ml?: number
          sillage?: string | null
          total_ml?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sale_items: {
        Row: {
          commission_amount: number
          commission_kind: Database["public"]["Enums"]["commission_kind"]
          commission_value: number
          id: string
          quantity: number
          sale_id: string
          unit_cost: number
          unit_price: number
          variant_id: string
        }
        Insert: {
          commission_amount?: number
          commission_kind: Database["public"]["Enums"]["commission_kind"]
          commission_value: number
          id?: string
          quantity: number
          sale_id: string
          unit_cost: number
          unit_price: number
          variant_id: string
        }
        Update: {
          commission_amount?: number
          commission_kind?: Database["public"]["Enums"]["commission_kind"]
          commission_value?: number
          id?: string
          quantity?: number
          sale_id?: string
          unit_cost?: number
          unit_price?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v_variant_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          amount_due: number
          amount_paid: number
          cost_price: number
          created_at: string
          customer_name: string | null
          due_date: string | null
          first_due_date: string | null
          first_paid: boolean
          id: string
          ml_sold: number
          order_id: string | null
          payment_method: string
          payment_status: string
          product_id: string
          sale_price: number
          user_id: string
        }
        Insert: {
          amount_due?: number
          amount_paid?: number
          cost_price?: number
          created_at?: string
          customer_name?: string | null
          due_date?: string | null
          first_due_date?: string | null
          first_paid?: boolean
          id?: string
          ml_sold: number
          order_id?: string | null
          payment_method?: string
          payment_status?: string
          product_id: string
          sale_price?: number
          user_id: string
        }
        Update: {
          amount_due?: number
          amount_paid?: number
          cost_price?: number
          created_at?: string
          customer_name?: string | null
          due_date?: string | null
          first_due_date?: string | null
          first_paid?: boolean
          id?: string
          ml_sold?: number
          order_id?: string | null
          payment_method?: string
          payment_status?: string
          product_id?: string
          sale_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_v2: {
        Row: {
          created_at: string
          created_by: string
          customer_id: string | null
          id: string
          location_id: string
          note: string | null
          owner_id: string
          reversed_at: string | null
          reversed_by: string | null
          reversed_reason: string | null
          seller_id: string | null
          status: Database["public"]["Enums"]["sale_status"]
          total_amount: number
          total_commission: number
          total_cost: number
        }
        Insert: {
          created_at?: string
          created_by?: string
          customer_id?: string | null
          id?: string
          location_id: string
          note?: string | null
          owner_id: string
          reversed_at?: string | null
          reversed_by?: string | null
          reversed_reason?: string | null
          seller_id?: string | null
          status?: Database["public"]["Enums"]["sale_status"]
          total_amount?: number
          total_commission?: number
          total_cost?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          customer_id?: string | null
          id?: string
          location_id?: string
          note?: string | null
          owner_id?: string
          reversed_at?: string | null
          reversed_by?: string | null
          reversed_reason?: string | null
          seller_id?: string | null
          status?: Database["public"]["Enums"]["sale_status"]
          total_amount?: number
          total_commission?: number
          total_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_v2_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_v2_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_v2_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_v2_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "v_seller_commission"
            referencedColumns: ["seller_id"]
          },
        ]
      }
      sellers_v2: {
        Row: {
          active: boolean
          address: string | null
          commission_kind: Database["public"]["Enums"]["commission_kind"]
          commission_value: number
          created_at: string
          email: string | null
          establishment_name: string | null
          id: string
          name: string
          owner_id: string
          phone: string | null
          updated_at: string
          user_id: string | null
          whatsapp: string | null
          zip: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          commission_kind?: Database["public"]["Enums"]["commission_kind"]
          commission_value?: number
          created_at?: string
          email?: string | null
          establishment_name?: string | null
          id?: string
          name: string
          owner_id: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp?: string | null
          zip?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          commission_kind?: Database["public"]["Enums"]["commission_kind"]
          commission_value?: number
          created_at?: string
          email?: string | null
          establishment_name?: string | null
          id?: string
          name?: string
          owner_id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      settlement_allocations: {
        Row: {
          amount: number
          id: string
          sale_item_id: string
          settlement_id: string
        }
        Insert: {
          amount: number
          id?: string
          sale_item_id: string
          settlement_id: string
        }
        Update: {
          amount?: number
          id?: string
          sale_item_id?: string
          settlement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_allocations_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "sale_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_allocations_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          id: string
          method: string | null
          note: string | null
          owner_id: string
          reversed_at: string | null
          reversed_by: string | null
          reversed_reason: string | null
          seller_id: string
          status: Database["public"]["Enums"]["settlement_status"]
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string
          id?: string
          method?: string | null
          note?: string | null
          owner_id: string
          reversed_at?: string | null
          reversed_by?: string | null
          reversed_reason?: string | null
          seller_id: string
          status?: Database["public"]["Enums"]["settlement_status"]
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          id?: string
          method?: string | null
          note?: string | null
          owner_id?: string
          reversed_at?: string | null
          reversed_by?: string | null
          reversed_reason?: string | null
          seller_id?: string
          status?: Database["public"]["Enums"]["settlement_status"]
        }
        Relationships: [
          {
            foreignKeyName: "settlements_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "v_seller_commission"
            referencedColumns: ["seller_id"]
          },
        ]
      }
      stock_locations: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["location_kind"]
          name: string
          owner_id: string
          seller_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["location_kind"]
          name: string
          owner_id: string
          seller_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["location_kind"]
          name?: string
          owner_id?: string
          seller_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_locations_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: true
            referencedRelation: "sellers_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_locations_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: true
            referencedRelation: "v_seller_commission"
            referencedColumns: ["seller_id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          id: string
          ml_after: number
          ml_change: number
          note: string | null
          product_id: string
          sale_id: string | null
          type: Database["public"]["Enums"]["movement_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ml_after: number
          ml_change: number
          note?: string | null
          product_id: string
          sale_id?: string | null
          type: Database["public"]["Enums"]["movement_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ml_after?: number
          ml_change?: number
          note?: string | null
          product_id?: string
          sale_id?: string | null
          type?: Database["public"]["Enums"]["movement_type"]
          user_id?: string
        }
        Relationships: []
      }
      transfer_items: {
        Row: {
          id: string
          quantity: number
          received_quantity: number | null
          transfer_id: string
          variant_id: string
        }
        Insert: {
          id?: string
          quantity: number
          received_quantity?: number | null
          transfer_id: string
          variant_id: string
        }
        Update: {
          id?: string
          quantity?: number
          received_quantity?: number | null
          transfer_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v_variant_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      transfers: {
        Row: {
          cancelled_at: string | null
          created_at: string
          created_by: string
          from_location: string
          id: string
          note: string | null
          owner_id: string
          received_at: string | null
          status: Database["public"]["Enums"]["transfer_status"]
          to_location: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          created_by?: string
          from_location: string
          id?: string
          note?: string | null
          owner_id: string
          received_at?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          to_location: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          created_by?: string
          from_location?: string
          id?: string
          note?: string | null
          owner_id?: string
          received_at?: string | null
          status?: Database["public"]["Enums"]["transfer_status"]
          to_location?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfers_from_location_fkey"
            columns: ["from_location"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfers_to_location_fkey"
            columns: ["to_location"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      catalog_products: {
        Row: {
          brand: string | null
          concentration: string | null
          current_ml: number | null
          description: string | null
          fragrance_notes: Json | null
          gender: string | null
          id: string | null
          image_url: string | null
          longevity: string | null
          name: string | null
          occasions: string[] | null
          olfactory_family: string | null
          sale_price_per_ml: number | null
          sillage: string | null
          total_ml: number | null
        }
        Insert: {
          brand?: string | null
          concentration?: string | null
          current_ml?: number | null
          description?: string | null
          fragrance_notes?: Json | null
          gender?: string | null
          id?: string | null
          image_url?: string | null
          longevity?: string | null
          name?: string | null
          occasions?: string[] | null
          olfactory_family?: string | null
          sale_price_per_ml?: number | null
          sillage?: string | null
          total_ml?: number | null
        }
        Update: {
          brand?: string | null
          concentration?: string | null
          current_ml?: number | null
          description?: string | null
          fragrance_notes?: Json | null
          gender?: string | null
          id?: string | null
          image_url?: string | null
          longevity?: string | null
          name?: string | null
          occasions?: string[] | null
          olfactory_family?: string | null
          sale_price_per_ml?: number | null
          sillage?: string | null
          total_ml?: number | null
        }
        Relationships: []
      }
      v_available_stock: {
        Row: {
          available: number | null
          balance: number | null
          location_id: string | null
          owner_id: string | null
          reserved: number | null
          variant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v_variant_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      v_seller_commission: {
        Row: {
          owner_id: string | null
          seller_id: string | null
          total_due: number | null
          total_earned: number | null
          total_paid: number | null
        }
        Relationships: []
      }
      v_stock_balances: {
        Row: {
          balance: number | null
          location_id: string | null
          owner_id: string | null
          variant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "v_variant_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      v_variant_catalog: {
        Row: {
          active: boolean | null
          barcode: string | null
          brand: string | null
          id: string | null
          is_default: boolean | null
          owner_id: string | null
          product_id: string | null
          product_name: string | null
          sku: string | null
          unit_cost: number | null
          unit_price: number | null
          volume_ml: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "catalog_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      deduct_stock: {
        Args: { p_ml: number; p_product_id: string }
        Returns: Json
      }
      rpc_actor_context: {
        Args: never
        Returns: {
          owner_id: string
          role: Database["public"]["Enums"]["app_role"]
          seller_id: string
        }[]
      }
      rpc_adjust_stock: {
        Args: {
          p_kind: Database["public"]["Enums"]["movement_kind"]
          p_location: string
          p_note: string
          p_quantity: number
          p_variant: string
        }
        Returns: undefined
      }
      rpc_cancel_transfer: {
        Args: { p_reason: string; p_transfer: string }
        Returns: undefined
      }
      rpc_create_transfer: {
        Args: { p_from: string; p_items: Json; p_note?: string; p_to: string }
        Returns: string
      }
      rpc_receive_transfer: {
        Args: { p_received?: Json; p_transfer: string }
        Returns: undefined
      }
      rpc_register_sale: {
        Args: {
          p_customer: string
          p_items: Json
          p_location: string
          p_note?: string
          p_seller: string
        }
        Returns: string
      }
      rpc_reverse_sale: {
        Args: { p_reason: string; p_sale: string }
        Returns: undefined
      }
      rpc_reverse_settlement: {
        Args: { p_reason: string; p_settlement: string }
        Returns: undefined
      }
      rpc_save_customer: {
        Args: {
          p_email: string
          p_id: string
          p_name: string
          p_note: string
          p_phone: string
          p_seller?: string
        }
        Returns: string
      }
      rpc_settle: {
        Args: {
          p_amount: number
          p_method: string
          p_note: string
          p_seller: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "seller"
      commission_kind: "fixed_per_unit" | "profit_percentage"
      location_kind: "warehouse" | "seller" | "virtual"
      movement_kind:
        | "initial"
        | "restock"
        | "transfer_out"
        | "transfer_in"
        | "sale"
        | "return"
        | "loss"
        | "adjustment"
        | "reversal"
      movement_type:
        | "initial"
        | "restock"
        | "sale"
        | "sale_reversal"
        | "adjustment"
      sale_status: "confirmed" | "reversed"
      settlement_status: "confirmed" | "reversed"
      transfer_status: "in_transit" | "received" | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "seller"],
      commission_kind: ["fixed_per_unit", "profit_percentage"],
      location_kind: ["warehouse", "seller", "virtual"],
      movement_kind: [
        "initial",
        "restock",
        "transfer_out",
        "transfer_in",
        "sale",
        "return",
        "loss",
        "adjustment",
        "reversal",
      ],
      movement_type: [
        "initial",
        "restock",
        "sale",
        "sale_reversal",
        "adjustment",
      ],
      sale_status: ["confirmed", "reversed"],
      settlement_status: ["confirmed", "reversed"],
      transfer_status: ["in_transit", "received", "cancelled"],
    },
  },
} as const
