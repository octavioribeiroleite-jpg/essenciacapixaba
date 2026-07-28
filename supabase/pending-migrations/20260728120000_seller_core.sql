-- Seller core migration — NÃO aplicada ainda. Cobre profiles/papéis,
-- variantes, locais de estoque, movimentos imutáveis, transferências,
-- clientes, vendas com snapshots, comissões, repasses parciais e auditoria.
-- Segurança: RLS específica TO authenticated, sem TO public, funções
-- SECURITY DEFINER apenas quando necessário, com search_path fixo.

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ============================================================
-- Papéis e perfis
-- ============================================================
do $$ begin
  create type public.app_role as enum ('admin','seller');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique(user_id, role)
);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
revoke all on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;

-- ============================================================
-- Vendedores (vinculáveis a auth por email)
-- ============================================================
do $$ begin
  create type public.commission_kind as enum ('fixed_per_unit','profit_percentage');
exception when duplicate_object then null; end $$;

create table if not exists public.sellers_v2 (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null check (char_length(trim(name)) between 2 and 120),
  email citext,
  phone text,
  active boolean not null default true,
  commission_kind public.commission_kind not null default 'fixed_per_unit',
  commission_value numeric(12,4) not null default 0 check (commission_value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, email)
);
create index if not exists sellers_v2_owner_idx on public.sellers_v2(owner_id);
create index if not exists sellers_v2_user_idx on public.sellers_v2(user_id);

-- ============================================================
-- Variantes e locais
-- ============================================================
create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  volume_ml numeric(10,2) not null check (volume_ml > 0),
  sku text, barcode text,
  unit_cost numeric(12,4) not null default 0 check (unit_cost >= 0),
  unit_price numeric(12,4) not null default 0 check (unit_price >= 0),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, sku),
  unique(owner_id, barcode)
);
create index if not exists product_variants_product_idx on public.product_variants(product_id);

create table if not exists public.stock_locations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('warehouse','seller','customer','virtual')),
  seller_id uuid references public.sellers_v2(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists stock_locations_owner_idx on public.stock_locations(owner_id);
create index if not exists stock_locations_seller_idx on public.stock_locations(seller_id);

-- ============================================================
-- Movimentos imutáveis
-- ============================================================
do $$ begin
  create type public.movement_kind as enum (
    'initial','restock','transfer_out','transfer_in','sale','return','loss','adjustment','reversal'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  location_id uuid not null references public.stock_locations(id) on delete restrict,
  kind public.movement_kind not null,
  quantity numeric(12,3) not null,
  ref_table text, ref_id uuid, note text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists inv_mov_owner_idx on public.inventory_movements(owner_id);
create index if not exists inv_mov_variant_loc_idx on public.inventory_movements(variant_id, location_id);

create or replace function public.forbid_mutations() returns trigger
language plpgsql as $$ begin raise exception 'inventory_movements é imutável'; end $$;
drop trigger if exists inv_mov_no_update on public.inventory_movements;
create trigger inv_mov_no_update before update or delete on public.inventory_movements
  for each row execute function public.forbid_mutations();

-- ============================================================
-- Transferências
-- ============================================================
do $$ begin
  create type public.transfer_status as enum ('draft','in_transit','received','cancelled');
exception when duplicate_object then null; end $$;

create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  from_location uuid not null references public.stock_locations(id),
  to_location uuid not null references public.stock_locations(id),
  status public.transfer_status not null default 'draft',
  note text,
  created_at timestamptz not null default now(),
  shipped_at timestamptz, received_at timestamptz
);
create table if not exists public.transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.transfers(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  quantity numeric(12,3) not null check (quantity > 0),
  received_quantity numeric(12,3)
);

-- ============================================================
-- Clientes / vendas / itens
-- ============================================================
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null, phone text, email text, note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, phone)
);

create table if not exists public.sales_v2 (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid references public.sellers_v2(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  location_id uuid not null references public.stock_locations(id),
  status text not null default 'confirmed' check (status in ('confirmed','reversed')),
  total_amount numeric(12,2) not null default 0,
  total_cost numeric(12,2) not null default 0,
  total_commission numeric(12,2) not null default 0,
  note text,
  created_at timestamptz not null default now(),
  reversed_at timestamptz, reversed_reason text
);
create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales_v2(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id),
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price numeric(12,4) not null,
  unit_cost  numeric(12,4) not null,
  commission_kind public.commission_kind not null,
  commission_value numeric(12,4) not null,
  commission_amount numeric(12,2) not null default 0
);
create index if not exists sale_items_sale_idx on public.sale_items(sale_id);

-- ============================================================
-- Repasses
-- ============================================================
create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references public.sellers_v2(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  method text, note text,
  created_at timestamptz not null default now()
);
create table if not exists public.settlement_allocations (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.settlements(id) on delete cascade,
  sale_item_id uuid not null references public.sale_items(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0)
);
create index if not exists settlement_alloc_sale_item_idx on public.settlement_allocations(sale_item_id);

-- ============================================================
-- Auditoria
-- ============================================================
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid not null default auth.uid(),
  action text not null, entity text not null, entity_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- GRANTS (specifically to authenticated / service_role)
-- ============================================================
grant select, insert, update, delete on
  public.profiles, public.user_roles, public.sellers_v2, public.product_variants,
  public.stock_locations, public.inventory_movements, public.transfers,
  public.transfer_items, public.customers, public.sales_v2, public.sale_items,
  public.settlements, public.settlement_allocations, public.audit_events
  to authenticated;
grant all on
  public.profiles, public.user_roles, public.sellers_v2, public.product_variants,
  public.stock_locations, public.inventory_movements, public.transfers,
  public.transfer_items, public.customers, public.sales_v2, public.sale_items,
  public.settlements, public.settlement_allocations, public.audit_events
  to service_role;

-- ============================================================
-- RLS (todas TO authenticated; nada TO public)
-- ============================================================
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.sellers_v2 enable row level security;
alter table public.product_variants enable row level security;
alter table public.stock_locations enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.transfers enable row level security;
alter table public.transfer_items enable row level security;
alter table public.customers enable row level security;
alter table public.sales_v2 enable row level security;
alter table public.sale_items enable row level security;
alter table public.settlements enable row level security;
alter table public.settlement_allocations enable row level security;
alter table public.audit_events enable row level security;

create policy "profiles_self" on public.profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "user_roles_self_read" on public.user_roles for select to authenticated
  using (user_id = auth.uid());

create policy "sellers_v2_owner_all" on public.sellers_v2 for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "sellers_v2_self_read" on public.sellers_v2 for select to authenticated
  using (user_id = auth.uid());

create policy "product_variants_owner_all" on public.product_variants for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "stock_locations_owner_all" on public.stock_locations for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "stock_locations_seller_read" on public.stock_locations for select to authenticated
  using (exists(select 1 from public.sellers_v2 s where s.id = seller_id and s.user_id = auth.uid()));

create policy "inv_mov_owner_all" on public.inventory_movements for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "inv_mov_seller_read" on public.inventory_movements for select to authenticated
  using (exists(
    select 1 from public.stock_locations l join public.sellers_v2 s on s.id = l.seller_id
    where l.id = location_id and s.user_id = auth.uid()
  ));

create policy "transfers_owner_all" on public.transfers for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "transfer_items_owner_all" on public.transfer_items for all to authenticated
  using (exists(select 1 from public.transfers t where t.id = transfer_id and t.owner_id = auth.uid()))
  with check (exists(select 1 from public.transfers t where t.id = transfer_id and t.owner_id = auth.uid()));

create policy "customers_owner_all" on public.customers for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "sales_v2_owner_all" on public.sales_v2 for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "sales_v2_seller_read" on public.sales_v2 for select to authenticated
  using (exists(select 1 from public.sellers_v2 s where s.id = seller_id and s.user_id = auth.uid()));

create policy "sale_items_owner_all" on public.sale_items for all to authenticated
  using (exists(select 1 from public.sales_v2 s where s.id = sale_id and s.owner_id = auth.uid()))
  with check (exists(select 1 from public.sales_v2 s where s.id = sale_id and s.owner_id = auth.uid()));
create policy "sale_items_seller_read" on public.sale_items for select to authenticated
  using (exists(
    select 1 from public.sales_v2 s join public.sellers_v2 se on se.id = s.seller_id
    where s.id = sale_id and se.user_id = auth.uid()
  ));

create policy "settlements_owner_all" on public.settlements for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "settlements_seller_read" on public.settlements for select to authenticated
  using (exists(select 1 from public.sellers_v2 s where s.id = seller_id and s.user_id = auth.uid()));

create policy "settlement_alloc_owner_all" on public.settlement_allocations for all to authenticated
  using (exists(select 1 from public.settlements st where st.id = settlement_id and st.owner_id = auth.uid()))
  with check (exists(select 1 from public.settlements st where st.id = settlement_id and st.owner_id = auth.uid()));

create policy "audit_owner_read" on public.audit_events for select to authenticated
  using (owner_id = auth.uid());
create policy "audit_owner_insert" on public.audit_events for insert to authenticated
  with check (owner_id = auth.uid());

-- ============================================================
-- Views (security_invoker)
-- ============================================================
create or replace view public.v_stock_balances with (security_invoker = true) as
select owner_id, variant_id, location_id, sum(quantity) as balance
from public.inventory_movements group by owner_id, variant_id, location_id;

create or replace view public.v_seller_commission with (security_invoker = true) as
select s.owner_id, s.seller_id,
       coalesce(sum(si.commission_amount) filter (where s.status = 'confirmed'), 0) as total_earned,
       coalesce((select sum(amount) from public.settlements st where st.seller_id = s.seller_id), 0) as total_paid
from public.sales_v2 s
left join public.sale_items si on si.sale_id = s.id
group by s.owner_id, s.seller_id;

grant select on public.v_stock_balances, public.v_seller_commission to authenticated;

-- ============================================================
-- RPCs transacionais
-- ============================================================
create or replace function public.rpc_receive_transfer(p_transfer uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_from uuid; v_to uuid; r record;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  select owner_id, from_location, to_location into v_owner, v_from, v_to
    from public.transfers where id = p_transfer for update;
  if v_owner is null then raise exception 'transfer not found'; end if;
  if v_owner <> auth.uid() then raise exception 'forbidden'; end if;
  for r in select variant_id, coalesce(received_quantity, quantity) as qty
           from public.transfer_items where transfer_id = p_transfer loop
    insert into public.inventory_movements(owner_id, variant_id, location_id, kind, quantity, ref_table, ref_id)
      values (v_owner, r.variant_id, v_from, 'transfer_out', -r.qty, 'transfers', p_transfer),
             (v_owner, r.variant_id, v_to,   'transfer_in',   r.qty, 'transfers', p_transfer);
  end loop;
  update public.transfers set status='received', received_at=now() where id = p_transfer;
end $$;
revoke all on function public.rpc_receive_transfer(uuid) from public, anon;
grant execute on function public.rpc_receive_transfer(uuid) to authenticated;

create or replace function public.rpc_register_sale(p_sale jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_owner uuid := auth.uid(); v_sale uuid; v_seller uuid; v_loc uuid; v_cust uuid;
        it jsonb; v_kind commission_kind; v_val numeric; v_price numeric; v_cost numeric;
        v_qty numeric; v_variant uuid; v_commission numeric; v_bal numeric;
begin
  if v_owner is null then raise exception 'auth required'; end if;
  v_seller := nullif(p_sale->>'seller_id','')::uuid;
  v_loc := (p_sale->>'location_id')::uuid;
  v_cust := nullif(p_sale->>'customer_id','')::uuid;
  insert into public.sales_v2(owner_id, seller_id, customer_id, location_id, note)
    values (v_owner, v_seller, v_cust, v_loc, p_sale->>'note') returning id into v_sale;
  for it in select * from jsonb_array_elements(p_sale->'items') loop
    v_variant := (it->>'variant_id')::uuid;
    v_qty := (it->>'quantity')::numeric;
    v_price := (it->>'unit_price')::numeric;
    v_cost := coalesce((it->>'unit_cost')::numeric, 0);
    v_kind := coalesce(nullif(it->>'commission_kind',''), 'fixed_per_unit')::commission_kind;
    v_val := coalesce((it->>'commission_value')::numeric, 0);
    select coalesce(sum(quantity),0) into v_bal from public.inventory_movements
      where owner_id = v_owner and variant_id = v_variant and location_id = v_loc;
    if v_bal < v_qty then raise exception 'estoque insuficiente para variant %', v_variant; end if;
    if v_kind = 'fixed_per_unit' then v_commission := v_val * v_qty;
    else v_commission := greatest(0, (v_price - v_cost)) * v_qty * (v_val/100.0); end if;
    insert into public.sale_items(sale_id, variant_id, quantity, unit_price, unit_cost,
      commission_kind, commission_value, commission_amount)
    values (v_sale, v_variant, v_qty, v_price, v_cost, v_kind, v_val, v_commission);
    insert into public.inventory_movements(owner_id, variant_id, location_id, kind, quantity, ref_table, ref_id)
      values (v_owner, v_variant, v_loc, 'sale', -v_qty, 'sales_v2', v_sale);
  end loop;
  update public.sales_v2 s set
    total_amount = (select coalesce(sum(quantity*unit_price),0) from public.sale_items where sale_id=s.id),
    total_cost   = (select coalesce(sum(quantity*unit_cost),0)  from public.sale_items where sale_id=s.id),
    total_commission = (select coalesce(sum(commission_amount),0) from public.sale_items where sale_id=s.id)
  where s.id = v_sale;
  insert into public.audit_events(owner_id, action, entity, entity_id, payload)
    values (v_owner, 'sale.register', 'sales_v2', v_sale, p_sale);
  return v_sale;
end $$;
revoke all on function public.rpc_register_sale(jsonb) from public, anon;
grant execute on function public.rpc_register_sale(jsonb) to authenticated;

create or replace function public.rpc_reverse_sale(p_sale uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid; r record;
begin
  if auth.uid() is null then raise exception 'auth required'; end if;
  if p_reason is null or char_length(trim(p_reason)) < 3 then raise exception 'justificativa obrigatória'; end if;
  select owner_id into v_owner from public.sales_v2 where id = p_sale for update;
  if v_owner is null or v_owner <> auth.uid() then raise exception 'forbidden'; end if;
  for r in select si.variant_id, si.quantity, s.location_id
           from public.sale_items si join public.sales_v2 s on s.id = si.sale_id
           where si.sale_id = p_sale loop
    insert into public.inventory_movements(owner_id, variant_id, location_id, kind, quantity, ref_table, ref_id, note)
      values (v_owner, r.variant_id, r.location_id, 'reversal', r.quantity, 'sales_v2', p_sale, p_reason);
  end loop;
  update public.sales_v2 set status='reversed', reversed_at=now(), reversed_reason=p_reason where id=p_sale;
  insert into public.audit_events(owner_id, action, entity, entity_id, payload)
    values (v_owner, 'sale.reverse', 'sales_v2', p_sale, jsonb_build_object('reason', p_reason));
end $$;
revoke all on function public.rpc_reverse_sale(uuid, text) from public, anon;
grant execute on function public.rpc_reverse_sale(uuid, text) to authenticated;

create or replace function public.rpc_adjust_stock(
  p_variant uuid, p_location uuid, p_kind movement_kind, p_qty numeric, p_note text
) returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'auth required'; end if;
  if p_kind not in ('return','loss','adjustment','restock','initial') then
    raise exception 'kind inválido'; end if;
  insert into public.inventory_movements(owner_id, variant_id, location_id, kind, quantity, note)
    values (v_owner, p_variant, p_location, p_kind, p_qty, p_note);
end $$;
revoke all on function public.rpc_adjust_stock(uuid,uuid,movement_kind,numeric,text) from public, anon;
grant execute on function public.rpc_adjust_stock(uuid,uuid,movement_kind,numeric,text) to authenticated;

create or replace function public.rpc_settle(p_seller uuid, p_amount numeric, p_method text, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_owner uuid := auth.uid(); v_earned numeric; v_paid numeric; v_id uuid; remaining numeric := p_amount;
        r record; take numeric;
begin
  if v_owner is null then raise exception 'auth required'; end if;
  if p_amount <= 0 then raise exception 'amount inválido'; end if;
  if not exists(select 1 from public.sellers_v2 where id = p_seller and owner_id = v_owner) then
    raise exception 'seller inválido'; end if;
  select coalesce(sum(si.commission_amount),0) into v_earned
    from public.sales_v2 s join public.sale_items si on si.sale_id = s.id
    where s.seller_id = p_seller and s.status='confirmed' and s.owner_id = v_owner;
  select coalesce(sum(amount),0) into v_paid from public.settlements
    where seller_id = p_seller and owner_id = v_owner;
  if p_amount > (v_earned - v_paid) then
    raise exception 'repasse excede saldo devido (% > %)', p_amount, v_earned - v_paid;
  end if;
  insert into public.settlements(owner_id, seller_id, amount, method, note)
    values (v_owner, p_seller, p_amount, p_method, p_note) returning id into v_id;
  for r in
    select si.id, si.commission_amount - coalesce((
      select sum(sa.amount) from public.settlement_allocations sa where sa.sale_item_id = si.id
    ),0) as due
    from public.sales_v2 s join public.sale_items si on si.sale_id = s.id
    where s.seller_id = p_seller and s.status='confirmed' and s.owner_id = v_owner
    order by s.created_at asc
  loop
    if remaining <= 0 then exit; end if;
    if r.due <= 0 then continue; end if;
    take := least(remaining, r.due);
    insert into public.settlement_allocations(settlement_id, sale_item_id, amount) values (v_id, r.id, take);
    remaining := remaining - take;
  end loop;
  insert into public.audit_events(owner_id, action, entity, entity_id, payload)
    values (v_owner, 'settlement.create', 'settlements', v_id,
            jsonb_build_object('seller', p_seller, 'amount', p_amount, 'method', p_method));
  return v_id;
end $$;
revoke all on function public.rpc_settle(uuid,numeric,text,text) from public, anon;
grant execute on function public.rpc_settle(uuid,numeric,text,text) to authenticated;

-- ============================================================
-- Backfill de products -> product_variants (executa só quando aplicada)
-- ============================================================
do $$
declare r record; v_var uuid; v_loc uuid; v_units numeric;
begin
  for r in select * from public.products where total_ml > 0 loop
    insert into public.product_variants(owner_id, product_id, volume_ml, unit_cost, unit_price, is_default)
      values (r.user_id, r.id, r.total_ml, r.cost_per_ml * r.total_ml, r.sale_price_per_ml * r.total_ml, true)
      returning id into v_var;
    select id into v_loc from public.stock_locations
      where owner_id = r.user_id and kind='warehouse' order by created_at limit 1;
    if v_loc is null then
      insert into public.stock_locations(owner_id, name, kind)
        values (r.user_id, 'Estoque principal', 'warehouse') returning id into v_loc;
    end if;
    if r.current_ml > 0 and (r.current_ml::numeric % r.total_ml::numeric) = 0 then
      v_units := r.current_ml / r.total_ml;
      insert into public.inventory_movements(owner_id, variant_id, location_id, kind, quantity, note)
        values (r.user_id, v_var, v_loc, 'initial', v_units, 'migração automática');
    end if;
  end loop;
end $$;

-- FIM.
