create extension if not exists pgcrypto;

create table if not exists public.sellers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 100),
  phone text,
  active boolean not null default true,
  commission_per_unit numeric(12,2) not null default 0 check (commission_per_unit >= 0),
  access_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.seller_inventory (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references public.sellers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity_delivered integer not null check (quantity_delivered > 0),
  quantity_sold integer not null default 0 check (quantity_sold >= 0 and quantity_sold <= quantity_delivered),
  unit_price numeric(12,2) not null check (unit_price > 0),
  commission_per_unit numeric(12,2) not null default 0 check (commission_per_unit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.seller_sales (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references public.sellers(id) on delete cascade,
  inventory_id uuid not null references public.seller_inventory(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  sale_id uuid references public.sales(id) on delete set null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price > 0),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  commission_amount numeric(12,2) not null default 0 check (commission_amount >= 0),
  amount_due_owner numeric(12,2) not null default 0 check (amount_due_owner >= 0),
  customer_name text,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists sellers_owner_id_idx on public.sellers(owner_id);
create index if not exists seller_inventory_owner_id_idx on public.seller_inventory(owner_id);
create index if not exists seller_inventory_seller_id_idx on public.seller_inventory(seller_id);
create index if not exists seller_sales_owner_id_idx on public.seller_sales(owner_id);
create index if not exists seller_sales_seller_id_idx on public.seller_sales(seller_id);
create index if not exists seller_sales_settled_at_idx on public.seller_sales(settled_at);

alter table public.sellers enable row level security;
alter table public.seller_inventory enable row level security;
alter table public.seller_sales enable row level security;

drop policy if exists "Owners manage their sellers" on public.sellers;
create policy "Owners manage their sellers"
on public.sellers for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Owners manage seller inventory" on public.seller_inventory;
create policy "Owners manage seller inventory"
on public.seller_inventory for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Owners manage seller sales" on public.seller_sales;
create policy "Owners manage seller sales"
on public.seller_sales for all
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

grant select, insert, update, delete on public.sellers to authenticated;
grant select, insert, update, delete on public.seller_inventory to authenticated;
grant select, insert, update, delete on public.seller_sales to authenticated;

create or replace function public.assign_seller_inventory(
  p_seller_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_unit_price numeric,
  p_commission_per_unit numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_seller public.sellers%rowtype;
  v_product public.products%rowtype;
  v_ml numeric;
  v_new_ml numeric;
  v_inventory_id uuid;
begin
  if v_owner_id is null then
    return jsonb_build_object('ok', false, 'error', 'Não autenticado');
  end if;
  if p_quantity is null or p_quantity < 1 then
    return jsonb_build_object('ok', false, 'error', 'Quantidade inválida');
  end if;
  if p_unit_price is null or p_unit_price <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Preço inválido');
  end if;
  if p_commission_per_unit is null or p_commission_per_unit < 0 or p_commission_per_unit >= p_unit_price then
    return jsonb_build_object('ok', false, 'error', 'Comissão inválida');
  end if;

  select * into v_seller
  from public.sellers
  where id = p_seller_id and owner_id = v_owner_id and active = true;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Vendedor não encontrado');
  end if;

  select * into v_product
  from public.products
  where id = p_product_id and user_id = v_owner_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Produto não encontrado');
  end if;

  v_ml := p_quantity * 100;
  if v_product.current_ml < v_ml then
    return jsonb_build_object('ok', false, 'error', 'Estoque insuficiente');
  end if;
  v_new_ml := v_product.current_ml - v_ml;

  update public.products
  set current_ml = v_new_ml, updated_at = now()
  where id = p_product_id;

  insert into public.seller_inventory (
    owner_id,
    seller_id,
    product_id,
    quantity_delivered,
    unit_price,
    commission_per_unit
  ) values (
    v_owner_id,
    p_seller_id,
    p_product_id,
    p_quantity,
    p_unit_price,
    p_commission_per_unit
  ) returning id into v_inventory_id;

  insert into public.stock_movements (
    user_id,
    product_id,
    type,
    ml_change,
    ml_after,
    note
  ) values (
    v_owner_id,
    p_product_id,
    'adjustment',
    -v_ml,
    v_new_ml,
    'Mercadoria entregue ao vendedor ' || v_seller.name || ': ' || p_quantity || ' frasco(s)'
  );

  return jsonb_build_object(
    'ok', true,
    'inventory_id', v_inventory_id,
    'new_ml', v_new_ml
  );
exception
  when others then
    raise log 'assign_seller_inventory error: %', sqlerrm;
    return jsonb_build_object('ok', false, 'error', 'Não foi possível registrar a entrega');
end;
$$;

create or replace function public.get_seller_portal(p_access_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller public.sellers%rowtype;
  v_inventory jsonb;
  v_available integer;
  v_sold integer;
  v_due numeric;
begin
  select * into v_seller
  from public.sellers
  where access_token::text = p_access_token and active = true;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Acesso inválido');
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'inventory_id', si.id,
        'product_id', p.id,
        'name', p.name,
        'brand', p.brand,
        'image_url', p.image_url,
        'quantity_delivered', si.quantity_delivered,
        'quantity_sold', si.quantity_sold,
        'quantity_available', si.quantity_delivered - si.quantity_sold,
        'unit_price', si.unit_price,
        'commission_per_unit', si.commission_per_unit
      ) order by si.created_at desc
    ),
    '[]'::jsonb
  ) into v_inventory
  from public.seller_inventory si
  join public.products p on p.id = si.product_id
  where si.seller_id = v_seller.id
    and si.quantity_delivered > si.quantity_sold;

  select coalesce(sum(quantity_delivered - quantity_sold), 0)
  into v_available
  from public.seller_inventory
  where seller_id = v_seller.id;

  select coalesce(sum(quantity), 0),
         coalesce(sum(amount_due_owner) filter (where settled_at is null), 0)
  into v_sold, v_due
  from public.seller_sales
  where seller_id = v_seller.id;

  return jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'seller', jsonb_build_object('id', v_seller.id, 'name', v_seller.name),
      'inventory', v_inventory,
      'totals', jsonb_build_object(
        'quantity_available', v_available,
        'quantity_sold', v_sold,
        'amount_due_owner', v_due
      )
    )
  );
end;
$$;

create or replace function public.record_seller_sale(
  p_access_token text,
  p_inventory_id uuid,
  p_quantity integer,
  p_customer_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller public.sellers%rowtype;
  v_inventory public.seller_inventory%rowtype;
  v_product public.products%rowtype;
  v_total numeric(12,2);
  v_commission numeric(12,2);
  v_due numeric(12,2);
  v_sale_id uuid;
  v_seller_sale_id uuid;
begin
  if p_quantity is null or p_quantity < 1 then
    return jsonb_build_object('ok', false, 'error', 'Quantidade inválida');
  end if;

  select * into v_seller
  from public.sellers
  where access_token::text = p_access_token and active = true;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Acesso inválido');
  end if;

  select * into v_inventory
  from public.seller_inventory
  where id = p_inventory_id and seller_id = v_seller.id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Mercadoria não encontrada');
  end if;

  if (v_inventory.quantity_delivered - v_inventory.quantity_sold) < p_quantity then
    return jsonb_build_object('ok', false, 'error', 'Quantidade maior que o estoque disponível');
  end if;

  select * into v_product from public.products where id = v_inventory.product_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Produto não encontrado');
  end if;

  v_total := round((p_quantity * v_inventory.unit_price)::numeric, 2);
  v_commission := round((p_quantity * v_inventory.commission_per_unit)::numeric, 2);
  v_due := greatest(0, v_total - v_commission);

  update public.seller_inventory
  set quantity_sold = quantity_sold + p_quantity, updated_at = now()
  where id = v_inventory.id;

  insert into public.sales (
    user_id,
    product_id,
    ml_sold,
    sale_price,
    cost_price,
    customer_name,
    payment_method,
    payment_status,
    amount_paid,
    amount_due,
    first_paid,
    order_id
  ) values (
    v_seller.owner_id,
    v_inventory.product_id,
    p_quantity * 100,
    v_total,
    p_quantity * 100 * v_product.cost_per_ml,
    nullif(trim(p_customer_name), ''),
    'reseller',
    'paid',
    v_total,
    0,
    true,
    gen_random_uuid()
  ) returning id into v_sale_id;

  insert into public.seller_sales (
    owner_id,
    seller_id,
    inventory_id,
    product_id,
    sale_id,
    quantity,
    unit_price,
    total_amount,
    commission_amount,
    amount_due_owner,
    customer_name
  ) values (
    v_seller.owner_id,
    v_seller.id,
    v_inventory.id,
    v_inventory.product_id,
    v_sale_id,
    p_quantity,
    v_inventory.unit_price,
    v_total,
    v_commission,
    v_due,
    nullif(trim(p_customer_name), '')
  ) returning id into v_seller_sale_id;

  return jsonb_build_object(
    'ok', true,
    'seller_sale_id', v_seller_sale_id,
    'total_amount', v_total,
    'commission_amount', v_commission,
    'amount_due_owner', v_due
  );
exception
  when others then
    raise log 'record_seller_sale error: %', sqlerrm;
    return jsonb_build_object('ok', false, 'error', 'Não foi possível registrar a venda');
end;
$$;

revoke all on function public.assign_seller_inventory(uuid, uuid, integer, numeric, numeric) from public;
revoke all on function public.get_seller_portal(text) from public;
revoke all on function public.record_seller_sale(text, uuid, integer, text) from public;

grant execute on function public.assign_seller_inventory(uuid, uuid, integer, numeric, numeric) to authenticated;
grant execute on function public.get_seller_portal(text) to anon, authenticated;
grant execute on function public.record_seller_sale(text, uuid, integer, text) to anon, authenticated;
