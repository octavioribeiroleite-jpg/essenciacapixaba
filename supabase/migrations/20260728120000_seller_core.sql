-- Essência Capixaba: núcleo seguro de consignação.
-- Aplicada ao banco de produção em 2026-07-28.
-- O modelo legado (products, sales e stock_movements) permanece intacto.

create extension if not exists pgcrypto;
create extension if not exists citext;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

do $$ begin
  create type public.app_role as enum ('admin', 'seller');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.commission_kind as enum ('fixed_per_unit', 'profit_percentage');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.location_kind as enum ('warehouse', 'seller', 'virtual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.movement_kind as enum (
    'initial', 'restock', 'transfer_out', 'transfer_in',
    'sale', 'return', 'loss', 'adjustment', 'reversal'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.transfer_status as enum ('in_transit', 'received', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sale_status as enum ('confirmed', 'reversed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.settlement_status as enum ('confirmed', 'reversed');
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
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create table if not exists public.sellers_v2 (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  user_id uuid unique references auth.users(id) on delete set null,
  name text not null check (char_length(trim(name)) between 2 and 120),
  email citext,
  phone text,
  active boolean not null default true,
  commission_kind public.commission_kind not null default 'fixed_per_unit',
  commission_value numeric(12,4) not null default 0
    check (
      commission_value >= 0
      and (commission_kind <> 'profit_percentage' or commission_value <= 100)
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, email)
);
create index if not exists sellers_v2_owner_idx on public.sellers_v2(owner_id);
create index if not exists sellers_v2_user_idx on public.sellers_v2(user_id);

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  volume_ml numeric(10,2) not null check (volume_ml > 0),
  sku text,
  barcode text,
  unit_cost numeric(12,4) not null default 0 check (unit_cost >= 0),
  unit_price numeric(12,4) not null default 0 check (unit_price >= 0),
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, volume_ml),
  unique (owner_id, sku),
  unique (owner_id, barcode)
);
create index if not exists product_variants_owner_idx on public.product_variants(owner_id);
create index if not exists product_variants_product_idx on public.product_variants(product_id);

create table if not exists public.stock_locations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 2 and 120),
  kind public.location_kind not null,
  seller_id uuid references public.sellers_v2(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (
    (kind = 'seller' and seller_id is not null)
    or (kind <> 'seller' and seller_id is null)
  ),
  unique (owner_id, name),
  unique (seller_id)
);
create index if not exists stock_locations_owner_idx on public.stock_locations(owner_id);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  location_id uuid not null references public.stock_locations(id) on delete restrict,
  kind public.movement_kind not null,
  quantity numeric(12,3) not null check (quantity <> 0),
  ref_table text,
  ref_id uuid,
  note text,
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists inv_mov_owner_idx on public.inventory_movements(owner_id);
create index if not exists inv_mov_variant_loc_idx
  on public.inventory_movements(variant_id, location_id);
create index if not exists inv_mov_reference_idx
  on public.inventory_movements(ref_table, ref_id);

create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  from_location uuid not null references public.stock_locations(id) on delete restrict,
  to_location uuid not null references public.stock_locations(id) on delete restrict,
  status public.transfer_status not null default 'in_transit',
  note text,
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  received_at timestamptz,
  cancelled_at timestamptz,
  check (from_location <> to_location)
);
create index if not exists transfers_owner_status_idx on public.transfers(owner_id, status);
create index if not exists transfers_destination_idx on public.transfers(to_location, status);

create table if not exists public.transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.transfers(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  quantity numeric(12,3) not null check (quantity > 0),
  received_quantity numeric(12,3) check (
    received_quantity is null or (received_quantity >= 0 and received_quantity <= quantity)
  ),
  unique (transfer_id, variant_id)
);
create index if not exists transfer_items_transfer_idx on public.transfer_items(transfer_id);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  seller_id uuid references public.sellers_v2(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 2 and 120),
  phone text,
  email citext,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, phone)
);
create index if not exists customers_owner_idx on public.customers(owner_id);
create index if not exists customers_seller_idx on public.customers(seller_id);

create table if not exists public.sales_v2 (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  seller_id uuid references public.sellers_v2(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  location_id uuid not null references public.stock_locations(id) on delete restrict,
  status public.sale_status not null default 'confirmed',
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  total_cost numeric(12,2) not null default 0 check (total_cost >= 0),
  total_commission numeric(12,2) not null default 0 check (total_commission >= 0),
  note text,
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id) on delete restrict,
  reversed_reason text
);
create index if not exists sales_v2_owner_idx on public.sales_v2(owner_id, created_at desc);
create index if not exists sales_v2_seller_idx on public.sales_v2(seller_id, created_at desc);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales_v2(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price numeric(12,4) not null check (unit_price >= 0),
  unit_cost numeric(12,4) not null check (unit_cost >= 0),
  commission_kind public.commission_kind not null,
  commission_value numeric(12,4) not null check (commission_value >= 0),
  commission_amount numeric(12,2) not null default 0 check (commission_amount >= 0),
  unique (sale_id, variant_id)
);
create index if not exists sale_items_sale_idx on public.sale_items(sale_id);

create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  seller_id uuid not null references public.sellers_v2(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  status public.settlement_status not null default 'confirmed',
  method text,
  note text,
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id) on delete restrict,
  reversed_reason text
);
create index if not exists settlements_seller_idx
  on public.settlements(seller_id, status, created_at);

create table if not exists public.settlement_allocations (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.settlements(id) on delete restrict,
  sale_item_id uuid not null references public.sale_items(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  unique (settlement_id, sale_item_id)
);
create index if not exists settlement_alloc_sale_item_idx
  on public.settlement_allocations(sale_item_id);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict default auth.uid(),
  action text not null,
  entity text not null,
  entity_id uuid,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_owner_created_idx
  on public.audit_events(owner_id, created_at desc);

-- Usuários existentes são administradores. Usuários criados depois desta migration
-- não recebem papel automaticamente; contas de vendedores são ligadas pelo e-mail.
insert into public.profiles(id, full_name)
select id, coalesce(raw_user_meta_data ->> 'full_name', split_part(email, '@', 1))
from auth.users
on conflict (id) do nothing;

insert into public.user_roles(user_id, role)
select id, 'admin'::public.app_role from auth.users
on conflict (user_id, role) do nothing;

create or replace function private.is_admin(p_user uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = p_user and role = 'admin'
  )
$$;

create or replace function private.actor_seller()
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select id from public.sellers_v2 where user_id = auth.uid() and active limit 1
$$;

create or replace function private.actor_owner()
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select case
    when private.is_admin(auth.uid()) then auth.uid()
    else (select owner_id from public.sellers_v2 where user_id = auth.uid() and active limit 1)
  end
$$;

revoke all on function private.is_admin(uuid) from public, anon;
revoke all on function private.actor_seller() from public, anon;
revoke all on function private.actor_owner() from public, anon;
grant execute on function private.is_admin(uuid) to authenticated;
grant execute on function private.actor_seller() to authenticated;
grant execute on function private.actor_owner() to authenticated;

create or replace function private.link_auth_user()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles(id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    updated_at = now();

  update public.sellers_v2
  set user_id = new.id, updated_at = now()
  where email is not null
    and lower(email::text) = lower(new.email)
    and (user_id is null or user_id = new.id);

  insert into public.user_roles(user_id, role)
  select new.id, 'seller'::public.app_role
  where exists (select 1 from public.sellers_v2 where user_id = new.id)
  on conflict (user_id, role) do nothing;
  return new;
end
$$;
revoke all on function private.link_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_link_seller on auth.users;
create trigger on_auth_user_link_seller
after insert or update of email on auth.users
for each row execute function private.link_auth_user();

create or replace function private.prepare_seller_link()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.email is null then
    new.user_id := null;
  else
    select id into new.user_id
    from auth.users
    where lower(email) = lower(new.email::text)
    limit 1;
  end if;
  return new;
end
$$;

create or replace function private.finish_seller_link()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.user_id is not null then
    insert into public.user_roles(user_id, role)
    values (new.user_id, 'seller')
    on conflict (user_id, role) do nothing;
  end if;
  return new;
end
$$;
revoke all on function private.prepare_seller_link() from public, anon, authenticated;
revoke all on function private.finish_seller_link() from public, anon, authenticated;

drop trigger if exists sellers_prepare_auth_link on public.sellers_v2;
create trigger sellers_prepare_auth_link
before insert or update of email on public.sellers_v2
for each row execute function private.prepare_seller_link();

drop trigger if exists sellers_finish_auth_link on public.sellers_v2;
create trigger sellers_finish_auth_link
after insert or update of email on public.sellers_v2
for each row execute function private.finish_seller_link();

create or replace function private.ensure_seller_location()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.stock_locations(owner_id, name, kind, seller_id, active)
  values (new.owner_id, 'Estoque · ' || new.name, 'seller', new.id, new.active)
  on conflict (seller_id) do update set
    name = excluded.name,
    active = excluded.active;
  return new;
end
$$;
revoke all on function private.ensure_seller_location() from public, anon, authenticated;

drop trigger if exists sellers_ensure_location on public.sellers_v2;
create trigger sellers_ensure_location
after insert or update of name, active on public.sellers_v2
for each row execute function private.ensure_seller_location();

-- Liga vendedores já cadastrados caso a conta Auth já exista.
update public.sellers_v2 s
set user_id = u.id, updated_at = now()
from auth.users u
where s.email is not null
  and lower(s.email::text) = lower(u.email)
  and s.user_id is null;

insert into public.user_roles(user_id, role)
select distinct user_id, 'seller'::public.app_role
from public.sellers_v2 where user_id is not null
on conflict (user_id, role) do nothing;

create or replace function private.forbid_change()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception '% é imutável; use uma operação compensatória', tg_table_name;
end
$$;

drop trigger if exists inventory_movements_immutable on public.inventory_movements;
create trigger inventory_movements_immutable
before update or delete on public.inventory_movements
for each row execute function private.forbid_change();

drop trigger if exists sale_items_immutable on public.sale_items;
create trigger sale_items_immutable
before update or delete on public.sale_items
for each row execute function private.forbid_change();

drop trigger if exists settlement_allocations_immutable on public.settlement_allocations;
create trigger settlement_allocations_immutable
before update or delete on public.settlement_allocations
for each row execute function private.forbid_change();

drop trigger if exists audit_events_immutable on public.audit_events;
create trigger audit_events_immutable
before update or delete on public.audit_events
for each row execute function private.forbid_change();

-- Backfill somente de catálogo/variantes. O estoque legado em ml não é convertido
-- automaticamente em unidades, pois frações de frasco seriam ambíguas.
insert into public.product_variants(
  owner_id, product_id, volume_ml, unit_cost, unit_price, is_default
)
select
  p.user_id, p.id, p.total_ml,
  p.cost_per_ml * p.total_ml,
  p.sale_price_per_ml * p.total_ml,
  true
from public.products p
where p.total_ml > 0
on conflict (product_id, volume_ml) do update set
  unit_cost = excluded.unit_cost,
  unit_price = excluded.unit_price,
  is_default = true,
  updated_at = now();

insert into public.stock_locations(owner_id, name, kind)
select distinct p.user_id, 'Estoque principal', 'warehouse'::public.location_kind
from public.products p
on conflict (owner_id, name) do nothing;

-- RLS
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

create policy profiles_self_read on public.profiles for select to authenticated
using (id = auth.uid());
create policy profiles_self_update on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

create policy roles_self_read on public.user_roles for select to authenticated
using (user_id = auth.uid());

create policy sellers_admin_all on public.sellers_v2 for all to authenticated
using (owner_id = auth.uid() and private.is_admin(auth.uid()))
with check (owner_id = auth.uid() and private.is_admin(auth.uid()));
create policy sellers_self_read on public.sellers_v2 for select to authenticated
using (user_id = auth.uid());

create policy variants_actor_read on public.product_variants for select to authenticated
using (owner_id = private.actor_owner());
create policy variants_admin_write on public.product_variants for all to authenticated
using (owner_id = auth.uid() and private.is_admin(auth.uid()))
with check (owner_id = auth.uid() and private.is_admin(auth.uid()));

-- Leitura do catálogo legado para o vendedor ligado ao proprietário.
create policy products_seller_core_read on public.products for select to authenticated
using (user_id = private.actor_owner());

create policy locations_admin_all on public.stock_locations for all to authenticated
using (owner_id = auth.uid() and private.is_admin(auth.uid()))
with check (owner_id = auth.uid() and private.is_admin(auth.uid()));
create policy locations_seller_read on public.stock_locations for select to authenticated
using (seller_id = private.actor_seller());

create policy movements_admin_read on public.inventory_movements for select to authenticated
using (owner_id = auth.uid() and private.is_admin(auth.uid()));
create policy movements_seller_read on public.inventory_movements for select to authenticated
using (
  location_id in (
    select id from public.stock_locations where seller_id = private.actor_seller()
  )
);

create policy transfers_admin_read on public.transfers for select to authenticated
using (owner_id = auth.uid() and private.is_admin(auth.uid()));
create policy transfers_seller_read on public.transfers for select to authenticated
using (
  to_location in (
    select id from public.stock_locations where seller_id = private.actor_seller()
  )
);
create policy transfer_items_actor_read on public.transfer_items for select to authenticated
using (
  exists (
    select 1 from public.transfers t
    where t.id = transfer_id
      and (
        (t.owner_id = auth.uid() and private.is_admin(auth.uid()))
        or t.to_location in (
          select id from public.stock_locations where seller_id = private.actor_seller()
        )
      )
  )
);

create policy customers_admin_all on public.customers for all to authenticated
using (owner_id = auth.uid() and private.is_admin(auth.uid()))
with check (owner_id = auth.uid() and private.is_admin(auth.uid()));
create policy customers_seller_read on public.customers for select to authenticated
using (seller_id = private.actor_seller());

create policy sales_admin_read on public.sales_v2 for select to authenticated
using (owner_id = auth.uid() and private.is_admin(auth.uid()));
create policy sales_seller_read on public.sales_v2 for select to authenticated
using (seller_id = private.actor_seller());

create policy sale_items_actor_read on public.sale_items for select to authenticated
using (
  exists (
    select 1 from public.sales_v2 s
    where s.id = sale_id
      and (
        (s.owner_id = auth.uid() and private.is_admin(auth.uid()))
        or s.seller_id = private.actor_seller()
      )
  )
);

create policy settlements_admin_read on public.settlements for select to authenticated
using (owner_id = auth.uid() and private.is_admin(auth.uid()));
create policy settlements_seller_read on public.settlements for select to authenticated
using (seller_id = private.actor_seller());

create policy allocations_actor_read on public.settlement_allocations for select to authenticated
using (
  exists (
    select 1 from public.settlements st
    where st.id = settlement_id
      and (
        (st.owner_id = auth.uid() and private.is_admin(auth.uid()))
        or st.seller_id = private.actor_seller()
      )
  )
);

create policy audit_admin_read on public.audit_events for select to authenticated
using (owner_id = auth.uid() and private.is_admin(auth.uid()));

-- Views usam as políticas das tabelas-base.
create or replace view public.v_stock_balances
with (security_invoker = true)
as
select
  m.owner_id, m.variant_id, m.location_id,
  sum(m.quantity)::numeric(12,3) as balance
from public.inventory_movements m
group by m.owner_id, m.variant_id, m.location_id;

create or replace view public.v_available_stock
with (security_invoker = true)
as
select
  b.owner_id, b.variant_id, b.location_id, b.balance,
  coalesce(r.reserved, 0)::numeric(12,3) as reserved,
  (b.balance - coalesce(r.reserved, 0))::numeric(12,3) as available
from public.v_stock_balances b
left join (
  select t.owner_id, ti.variant_id, t.from_location as location_id,
         sum(ti.quantity)::numeric(12,3) as reserved
  from public.transfers t
  join public.transfer_items ti on ti.transfer_id = t.id
  where t.status = 'in_transit'
  group by t.owner_id, ti.variant_id, t.from_location
) r using (owner_id, variant_id, location_id);

create or replace view public.v_seller_commission
with (security_invoker = true)
as
select
  se.owner_id,
  se.id as seller_id,
  coalesce(e.total_earned, 0)::numeric(12,2) as total_earned,
  coalesce(p.total_paid, 0)::numeric(12,2) as total_paid,
  (coalesce(e.total_earned, 0) - coalesce(p.total_paid, 0))::numeric(12,2) as total_due
from public.sellers_v2 se
left join (
  select s.seller_id, sum(si.commission_amount) as total_earned
  from public.sales_v2 s
  join public.sale_items si on si.sale_id = s.id
  where s.status = 'confirmed'
  group by s.seller_id
) e on e.seller_id = se.id
left join (
  select seller_id, sum(amount) as total_paid
  from public.settlements
  where status = 'confirmed'
  group by seller_id
) p on p.seller_id = se.id;

create or replace view public.v_variant_catalog
with (security_invoker = true)
as
select
  pv.id, pv.owner_id, pv.product_id, p.name as product_name, p.brand,
  pv.volume_ml, pv.sku, pv.barcode, pv.unit_cost, pv.unit_price,
  pv.is_default, pv.active
from public.product_variants pv
join public.products p on p.id = pv.product_id;

grant select on public.v_stock_balances, public.v_available_stock,
  public.v_seller_commission, public.v_variant_catalog to authenticated;

-- Contexto do usuário para a UI.
create or replace function public.rpc_actor_context()
returns table(role public.app_role, owner_id uuid, seller_id uuid)
language plpgsql security definer
set search_path = public, private, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória'; end if;
  if private.is_admin(auth.uid()) then
    return query select 'admin'::public.app_role, auth.uid(), null::uuid;
  end if;
  return query
  select 'seller'::public.app_role, s.owner_id, s.id
  from public.sellers_v2 s
  where s.user_id = auth.uid() and s.active
  limit 1;
  if not found then raise exception 'Usuário sem papel ativo'; end if;
end
$$;

-- Cadastra/edita cliente com owner/seller determinados pelo servidor.
create or replace function public.rpc_save_customer(
  p_id uuid, p_name text, p_phone text, p_email text, p_note text, p_seller uuid default null
) returns uuid
language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := private.actor_owner();
  v_seller uuid := private.actor_seller();
  v_id uuid;
begin
  if auth.uid() is null or v_owner is null then raise exception 'Sem autorização'; end if;
  if private.is_admin(auth.uid()) then
    v_seller := p_seller;
    if v_seller is not null and not exists (
      select 1 from public.sellers_v2 where id = v_seller and owner_id = v_owner
    ) then raise exception 'Vendedor inválido'; end if;
  end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Nome inválido'; end if;

  if p_id is null then
    insert into public.customers(owner_id, seller_id, name, phone, email, note)
    values (v_owner, v_seller, trim(p_name), nullif(p_phone, ''), nullif(p_email, ''), p_note)
    returning id into v_id;
  else
    update public.customers
    set name = trim(p_name), phone = nullif(p_phone, ''),
        email = nullif(p_email, ''), note = p_note, updated_at = now()
    where id = p_id and owner_id = v_owner
      and (private.is_admin(auth.uid()) or seller_id = v_seller)
    returning id into v_id;
    if v_id is null then raise exception 'Cliente não encontrado'; end if;
  end if;
  return v_id;
end
$$;

create or replace function public.rpc_create_transfer(
  p_from uuid, p_to uuid, p_items jsonb, p_note text default null
) returns uuid
language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_transfer uuid;
  v_item jsonb;
  v_variant uuid;
  v_qty numeric;
  v_available numeric;
begin
  if auth.uid() is null or not private.is_admin(auth.uid()) then raise exception 'Apenas administrador'; end if;
  if p_from = p_to then raise exception 'Origem e destino devem ser diferentes'; end if;
  if not exists (select 1 from public.stock_locations where id = p_from and owner_id = v_owner and active)
     or not exists (select 1 from public.stock_locations where id = p_to and owner_id = v_owner and active)
  then raise exception 'Local inválido'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0
  then raise exception 'Informe ao menos um item'; end if;

  insert into public.transfers(owner_id, from_location, to_location, note)
  values (v_owner, p_from, p_to, p_note)
  returning id into v_transfer;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_variant := (v_item ->> 'variant_id')::uuid;
    v_qty := (v_item ->> 'quantity')::numeric;
    if v_qty <= 0 then raise exception 'Quantidade inválida'; end if;
    if not exists (
      select 1 from public.product_variants
      where id = v_variant and owner_id = v_owner and active
    ) then raise exception 'Variante inválida'; end if;

    perform pg_advisory_xact_lock(hashtextextended(p_from::text || v_variant::text, 0));
    select coalesce(sum(m.quantity), 0)
      - coalesce((
        select sum(ti.quantity)
        from public.transfers t
        join public.transfer_items ti on ti.transfer_id = t.id
        where t.status = 'in_transit'
          and t.from_location = p_from
          and ti.variant_id = v_variant
      ), 0)
    into v_available
    from public.inventory_movements m
    where m.owner_id = v_owner and m.location_id = p_from and m.variant_id = v_variant;

    if v_available < v_qty then raise exception 'Estoque disponível insuficiente'; end if;
    insert into public.transfer_items(transfer_id, variant_id, quantity)
    values (v_transfer, v_variant, v_qty);
  end loop;

  insert into public.audit_events(owner_id, action, entity, entity_id, payload)
  values (v_owner, 'transfer.create', 'transfers', v_transfer,
          jsonb_build_object('from', p_from, 'to', p_to, 'items', p_items));
  return v_transfer;
end
$$;

create or replace function public.rpc_cancel_transfer(p_transfer uuid, p_reason text)
returns void
language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare v_owner uuid;
begin
  if auth.uid() is null or not private.is_admin(auth.uid()) then raise exception 'Apenas administrador'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Justificativa obrigatória'; end if;
  select owner_id into v_owner from public.transfers
  where id = p_transfer and status = 'in_transit' for update;
  if v_owner is null or v_owner <> auth.uid() then raise exception 'Transferência não disponível'; end if;
  update public.transfers set status = 'cancelled', cancelled_at = now() where id = p_transfer;
  insert into public.audit_events(owner_id, action, entity, entity_id, payload)
  values (v_owner, 'transfer.cancel', 'transfers', p_transfer,
          jsonb_build_object('reason', p_reason));
end
$$;

create or replace function public.rpc_receive_transfer(
  p_transfer uuid, p_received jsonb default null
) returns void
language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid;
  v_from uuid;
  v_to uuid;
  v_dest_seller uuid;
  v_qty numeric;
  r record;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória'; end if;
  select t.owner_id, t.from_location, t.to_location, l.seller_id
  into v_owner, v_from, v_to, v_dest_seller
  from public.transfers t
  join public.stock_locations l on l.id = t.to_location
  where t.id = p_transfer and t.status = 'in_transit'
  for update of t;
  if v_owner is null then raise exception 'Transferência já finalizada ou inexistente'; end if;
  if not (
    (private.is_admin(auth.uid()) and v_owner = auth.uid())
    or v_dest_seller = private.actor_seller()
  ) then raise exception 'Sem autorização para receber'; end if;

  for r in select * from public.transfer_items where transfer_id = p_transfer loop
    v_qty := r.quantity;
    if p_received is not null then
      v_qty := coalesce((
        select (x ->> 'quantity')::numeric
        from jsonb_array_elements(p_received) x
        where (x ->> 'item_id')::uuid = r.id
      ), 0);
    end if;
    if v_qty < 0 or v_qty > r.quantity then raise exception 'Quantidade recebida inválida'; end if;
    update public.transfer_items set received_quantity = v_qty where id = r.id;
    if v_qty > 0 then
      insert into public.inventory_movements(
        owner_id, variant_id, location_id, kind, quantity, ref_table, ref_id
      ) values
        (v_owner, r.variant_id, v_from, 'transfer_out', -v_qty, 'transfers', p_transfer),
        (v_owner, r.variant_id, v_to, 'transfer_in', v_qty, 'transfers', p_transfer);
    end if;
  end loop;
  update public.transfers set status = 'received', received_at = now() where id = p_transfer;
  insert into public.audit_events(owner_id, action, entity, entity_id, payload)
  values (v_owner, 'transfer.receive', 'transfers', p_transfer,
          jsonb_build_object('received', p_received));
end
$$;

create or replace function public.rpc_register_sale(
  p_location uuid, p_customer uuid, p_seller uuid, p_items jsonb, p_note text default null
) returns uuid
language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := private.actor_owner();
  v_actor_seller uuid := private.actor_seller();
  v_seller uuid;
  v_sale uuid;
  v_item jsonb;
  v_variant uuid;
  v_qty numeric;
  v_price numeric;
  v_cost numeric;
  v_default_price numeric;
  v_kind public.commission_kind := 'fixed_per_unit';
  v_value numeric := 0;
  v_commission numeric;
  v_available numeric;
begin
  if auth.uid() is null or v_owner is null then raise exception 'Sem autorização'; end if;
  v_seller := case when private.is_admin(auth.uid()) then p_seller else v_actor_seller end;

  if not exists (
    select 1 from public.stock_locations l
    where l.id = p_location and l.owner_id = v_owner and l.active
      and (
        private.is_admin(auth.uid())
        or (l.kind = 'seller' and l.seller_id = v_actor_seller)
      )
  ) then raise exception 'Local de estoque inválido'; end if;

  if v_seller is not null then
    select commission_kind, commission_value into v_kind, v_value
    from public.sellers_v2
    where id = v_seller and owner_id = v_owner and active;
    if not found then raise exception 'Vendedor inválido'; end if;
  end if;

  if p_customer is not null and not exists (
    select 1 from public.customers
    where id = p_customer and owner_id = v_owner
      and (private.is_admin(auth.uid()) or seller_id = v_actor_seller)
  ) then raise exception 'Cliente inválido'; end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0
  then raise exception 'Informe ao menos um item'; end if;

  insert into public.sales_v2(owner_id, seller_id, customer_id, location_id, note)
  values (v_owner, v_seller, p_customer, p_location, p_note)
  returning id into v_sale;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_variant := (v_item ->> 'variant_id')::uuid;
    v_qty := (v_item ->> 'quantity')::numeric;
    select unit_cost, unit_price into v_cost, v_default_price
    from public.product_variants
    where id = v_variant and owner_id = v_owner and active;
    if not found then raise exception 'Variante inválida'; end if;
    if v_qty <= 0 then raise exception 'Quantidade inválida'; end if;
    v_price := coalesce(nullif(v_item ->> 'unit_price', '')::numeric, v_default_price);
    if v_price < 0 then raise exception 'Preço inválido'; end if;

    perform pg_advisory_xact_lock(hashtextextended(p_location::text || v_variant::text, 0));
    select coalesce(sum(m.quantity), 0)
      - coalesce((
        select sum(ti.quantity)
        from public.transfers t
        join public.transfer_items ti on ti.transfer_id = t.id
        where t.status = 'in_transit'
          and t.from_location = p_location
          and ti.variant_id = v_variant
      ), 0)
    into v_available
    from public.inventory_movements m
    where m.owner_id = v_owner and m.location_id = p_location and m.variant_id = v_variant;
    if v_available < v_qty then raise exception 'Estoque disponível insuficiente'; end if;

    v_commission := case
      when v_kind = 'fixed_per_unit' then v_value * v_qty
      else greatest(0, v_price - v_cost) * v_qty * (v_value / 100)
    end;

    insert into public.sale_items(
      sale_id, variant_id, quantity, unit_price, unit_cost,
      commission_kind, commission_value, commission_amount
    ) values (
      v_sale, v_variant, v_qty, v_price, v_cost,
      v_kind, v_value, round(v_commission, 2)
    );
    insert into public.inventory_movements(
      owner_id, variant_id, location_id, kind, quantity, ref_table, ref_id
    ) values (
      v_owner, v_variant, p_location, 'sale', -v_qty, 'sales_v2', v_sale
    );
  end loop;

  update public.sales_v2 s set
    total_amount = x.amount,
    total_cost = x.cost,
    total_commission = x.commission
  from (
    select sale_id,
      round(sum(quantity * unit_price), 2) as amount,
      round(sum(quantity * unit_cost), 2) as cost,
      round(sum(commission_amount), 2) as commission
    from public.sale_items where sale_id = v_sale group by sale_id
  ) x
  where s.id = x.sale_id;

  insert into public.audit_events(owner_id, action, entity, entity_id, payload)
  values (v_owner, 'sale.register', 'sales_v2', v_sale,
          jsonb_build_object('location', p_location, 'seller', v_seller));
  return v_sale;
end
$$;

create or replace function public.rpc_reverse_sale(p_sale uuid, p_reason text)
returns void
language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid;
  v_seller uuid;
  v_location uuid;
  r record;
begin
  if auth.uid() is null then raise exception 'Autenticação obrigatória'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Justificativa obrigatória'; end if;
  select owner_id, seller_id, location_id into v_owner, v_seller, v_location
  from public.sales_v2
  where id = p_sale and status = 'confirmed'
  for update;
  if v_owner is null then raise exception 'Venda já estornada ou inexistente'; end if;
  if not (
    (private.is_admin(auth.uid()) and v_owner = auth.uid())
    or v_seller = private.actor_seller()
  ) then raise exception 'Sem autorização'; end if;
  if exists (
    select 1
    from public.sale_items si
    join public.settlement_allocations sa on sa.sale_item_id = si.id
    join public.settlements st on st.id = sa.settlement_id
    where si.sale_id = p_sale and st.status = 'confirmed'
  ) then raise exception 'Estorne primeiro o repasse que inclui esta venda'; end if;

  for r in select variant_id, quantity from public.sale_items where sale_id = p_sale loop
    insert into public.inventory_movements(
      owner_id, variant_id, location_id, kind, quantity, ref_table, ref_id, note
    ) values (
      v_owner, r.variant_id, v_location, 'reversal', r.quantity,
      'sales_v2', p_sale, p_reason
    );
  end loop;
  update public.sales_v2 set
    status = 'reversed', reversed_at = now(),
    reversed_by = auth.uid(), reversed_reason = trim(p_reason)
  where id = p_sale;
  insert into public.audit_events(owner_id, action, entity, entity_id, payload)
  values (v_owner, 'sale.reverse', 'sales_v2', p_sale,
          jsonb_build_object('reason', p_reason));
end
$$;

create or replace function public.rpc_adjust_stock(
  p_variant uuid, p_location uuid, p_kind public.movement_kind,
  p_quantity numeric, p_note text
) returns void
language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare v_owner uuid := auth.uid();
begin
  if auth.uid() is null or not private.is_admin(auth.uid()) then raise exception 'Apenas administrador'; end if;
  if p_kind not in ('initial', 'restock', 'return', 'loss', 'adjustment')
  then raise exception 'Tipo de ajuste inválido'; end if;
  if (p_kind in ('initial', 'restock', 'return') and p_quantity <= 0)
     or (p_kind = 'loss' and p_quantity >= 0)
     or (p_kind = 'adjustment' and p_quantity = 0)
  then raise exception 'Sinal da quantidade incompatível com o tipo'; end if;
  if not exists (select 1 from public.product_variants where id = p_variant and owner_id = v_owner)
     or not exists (select 1 from public.stock_locations where id = p_location and owner_id = v_owner)
  then raise exception 'Variante ou local inválido'; end if;
  insert into public.inventory_movements(
    owner_id, variant_id, location_id, kind, quantity, note
  ) values (v_owner, p_variant, p_location, p_kind, p_quantity, p_note);
  insert into public.audit_events(owner_id, action, entity, entity_id, payload)
  values (v_owner, 'stock.adjust', 'product_variants', p_variant,
          jsonb_build_object('location', p_location, 'kind', p_kind, 'quantity', p_quantity));
end
$$;

create or replace function public.rpc_settle(
  p_seller uuid, p_amount numeric, p_method text, p_note text
) returns uuid
language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_id uuid;
  v_due numeric;
  v_remaining numeric := round(p_amount, 2);
  v_take numeric;
  r record;
begin
  if auth.uid() is null or not private.is_admin(auth.uid()) then raise exception 'Apenas administrador'; end if;
  if p_amount <= 0 then raise exception 'Valor inválido'; end if;
  if not exists (select 1 from public.sellers_v2 where id = p_seller and owner_id = v_owner)
  then raise exception 'Vendedor inválido'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_seller::text, 1));

  select coalesce(sum(si.commission_amount), 0)
    - coalesce((
      select sum(sa.amount)
      from public.settlement_allocations sa
      join public.settlements st on st.id = sa.settlement_id
      join public.sale_items si2 on si2.id = sa.sale_item_id
      join public.sales_v2 s2 on s2.id = si2.sale_id
      where st.status = 'confirmed' and s2.seller_id = p_seller
    ), 0)
  into v_due
  from public.sales_v2 s
  join public.sale_items si on si.sale_id = s.id
  where s.owner_id = v_owner and s.seller_id = p_seller and s.status = 'confirmed';

  if round(p_amount, 2) > round(v_due, 2)
  then raise exception 'Repasse excede o saldo devido'; end if;

  insert into public.settlements(owner_id, seller_id, amount, method, note)
  values (v_owner, p_seller, round(p_amount, 2), p_method, p_note)
  returning id into v_id;

  for r in
    select si.id,
      si.commission_amount - coalesce((
        select sum(sa.amount)
        from public.settlement_allocations sa
        join public.settlements st on st.id = sa.settlement_id
        where sa.sale_item_id = si.id and st.status = 'confirmed'
      ), 0) as due
    from public.sales_v2 s
    join public.sale_items si on si.sale_id = s.id
    where s.owner_id = v_owner and s.seller_id = p_seller and s.status = 'confirmed'
    order by s.created_at, si.id
  loop
    exit when v_remaining <= 0;
    continue when r.due <= 0;
    v_take := least(v_remaining, r.due);
    insert into public.settlement_allocations(settlement_id, sale_item_id, amount)
    values (v_id, r.id, v_take);
    v_remaining := round(v_remaining - v_take, 2);
  end loop;

  if v_remaining <> 0 then raise exception 'Falha na alocação do repasse'; end if;
  insert into public.audit_events(owner_id, action, entity, entity_id, payload)
  values (v_owner, 'settlement.create', 'settlements', v_id,
          jsonb_build_object('seller', p_seller, 'amount', p_amount));
  return v_id;
end
$$;

create or replace function public.rpc_reverse_settlement(p_settlement uuid, p_reason text)
returns void
language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare v_owner uuid;
begin
  if auth.uid() is null or not private.is_admin(auth.uid()) then raise exception 'Apenas administrador'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'Justificativa obrigatória'; end if;
  select owner_id into v_owner from public.settlements
  where id = p_settlement and status = 'confirmed' for update;
  if v_owner is null or v_owner <> auth.uid() then raise exception 'Repasse já estornado ou inexistente'; end if;
  update public.settlements set
    status = 'reversed', reversed_at = now(),
    reversed_by = auth.uid(), reversed_reason = trim(p_reason)
  where id = p_settlement;
  insert into public.audit_events(owner_id, action, entity, entity_id, payload)
  values (v_owner, 'settlement.reverse', 'settlements', p_settlement,
          jsonb_build_object('reason', p_reason));
end
$$;

-- Privilégios mínimos: cadastros editáveis conforme RLS; livros apenas leitura.
-- Não altera privilégios das tabelas legadas nem do catálogo público.
revoke all on public.profiles, public.user_roles, public.sellers_v2,
  public.product_variants, public.stock_locations, public.inventory_movements,
  public.transfers, public.transfer_items, public.customers, public.sales_v2,
  public.sale_items, public.settlements, public.settlement_allocations,
  public.audit_events, public.v_stock_balances, public.v_available_stock,
  public.v_seller_commission, public.v_variant_catalog from anon;
grant select, update on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select, insert, update, delete on public.sellers_v2, public.product_variants,
  public.stock_locations, public.customers to authenticated;
grant select on public.inventory_movements, public.transfers, public.transfer_items,
  public.sales_v2, public.sale_items, public.settlements,
  public.settlement_allocations, public.audit_events to authenticated;

revoke all on function public.rpc_actor_context() from public, anon;
revoke all on function public.rpc_save_customer(uuid,text,text,text,text,uuid) from public, anon;
revoke all on function public.rpc_create_transfer(uuid,uuid,jsonb,text) from public, anon;
revoke all on function public.rpc_cancel_transfer(uuid,text) from public, anon;
revoke all on function public.rpc_receive_transfer(uuid,jsonb) from public, anon;
revoke all on function public.rpc_register_sale(uuid,uuid,uuid,jsonb,text) from public, anon;
revoke all on function public.rpc_reverse_sale(uuid,text) from public, anon;
revoke all on function public.rpc_adjust_stock(uuid,uuid,public.movement_kind,numeric,text) from public, anon;
revoke all on function public.rpc_settle(uuid,numeric,text,text) from public, anon;
revoke all on function public.rpc_reverse_settlement(uuid,text) from public, anon;

grant execute on function public.rpc_actor_context() to authenticated;
grant execute on function public.rpc_save_customer(uuid,text,text,text,text,uuid) to authenticated;
grant execute on function public.rpc_create_transfer(uuid,uuid,jsonb,text) to authenticated;
grant execute on function public.rpc_cancel_transfer(uuid,text) to authenticated;
grant execute on function public.rpc_receive_transfer(uuid,jsonb) to authenticated;
grant execute on function public.rpc_register_sale(uuid,uuid,uuid,jsonb,text) to authenticated;
grant execute on function public.rpc_reverse_sale(uuid,text) to authenticated;
grant execute on function public.rpc_adjust_stock(uuid,uuid,public.movement_kind,numeric,text) to authenticated;
grant execute on function public.rpc_settle(uuid,numeric,text,text) to authenticated;
grant execute on function public.rpc_reverse_settlement(uuid,text) to authenticated;

-- Garante que a API REST consiga acessar apenas as tabelas concedidas acima.
grant usage on schema public to authenticated;
