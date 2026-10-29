create extension if not exists pgcrypto;

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  currency text not null default 'RWF' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Africa/Kigali',
  created_at timestamptz not null default now()
);

create table public.business_memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'manager', 'cashier', 'stock_clerk')),
  status text not null default 'active' check (status in ('active', 'invited', 'suspended')),
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create index memberships_user_status_idx on public.business_memberships (user_id, status);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, name)
);

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, name)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  category_id uuid,
  name text not null check (length(trim(name)) between 1 and 160),
  sku text not null check (length(trim(sku)) between 1 and 80),
  description text not null default '',
  status text not null default 'active' check (status in ('active', 'archived', 'discontinued')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, sku),
  foreign key (category_id, business_id)
    references public.product_categories(id, business_id)
);

create index products_business_name_idx on public.products (business_id, name);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null,
  sku text not null check (length(trim(sku)) between 1 and 80),
  barcode text,
  size text,
  color text,
  price numeric(14,2) not null check (price > 0),
  cost_price numeric(14,2) not null default 0 check (cost_price >= 0),
  reorder_threshold integer not null default 5 check (reorder_threshold >= 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, sku),
  foreign key (product_id, business_id) references public.products(id, business_id),
  check (size is null or length(size) <= 60),
  check (color is null or length(color) <= 60)
);

create index product_variants_product_idx on public.product_variants (business_id, product_id);
create unique index product_variants_attribute_combo_uq
  on public.product_variants (business_id, product_id, coalesce(size, ''), coalesce(color, ''));
create unique index product_variants_barcode_uq on public.product_variants (business_id, barcode)
  where barcode is not null;

create table public.inventory_balances (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid not null,
  variant_id uuid not null,
  quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0),
  average_cost numeric(14,2) not null default 0 check (average_cost >= 0),
  updated_at timestamptz not null default now(),
  unique (business_id, location_id, variant_id),
  foreign key (location_id, business_id) references public.locations(id, business_id),
  foreign key (variant_id, business_id) references public.product_variants(id, business_id)
);

create index inventory_balances_variant_idx on public.inventory_balances (business_id, variant_id);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid not null,
  cashier_id uuid not null references auth.users(id),
  sale_number text not null,
  status text not null default 'completed' check (status in ('completed', 'voided', 'partially_refunded', 'refunded')),
  subtotal numeric(14,2) not null check (subtotal >= 0),
  discount_total numeric(14,2) not null default 0 check (discount_total >= 0),
  tax_total numeric(14,2) not null default 0 check (tax_total >= 0),
  total numeric(14,2) not null check (total >= 0),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique (business_id, idempotency_key),
  unique (business_id, sale_number),
  unique (id, business_id),
  foreign key (location_id, business_id) references public.locations(id, business_id)
);

create index sales_business_created_idx on public.sales (business_id, created_at desc);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  sale_id uuid not null,
  variant_id uuid not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  unit_cost_snapshot numeric(14,2) not null check (unit_cost_snapshot >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  created_at timestamptz not null default now(),
  foreign key (sale_id, business_id) references public.sales(id, business_id),
  foreign key (variant_id, business_id) references public.product_variants(id, business_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  sale_id uuid not null,
  method text not null check (method in ('cash', 'mobile_money', 'bank_transfer', 'card', 'other')),
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'succeeded' check (status in ('pending', 'succeeded', 'failed', 'refunded')),
  reference text,
  created_at timestamptz not null default now(),
  foreign key (sale_id, business_id) references public.sales(id, business_id)
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  location_id uuid not null,
  variant_id uuid not null,
  movement_type text not null check (movement_type in ('receipt', 'sale', 'return', 'adjustment', 'supplier_return', 'opening_balance')),
  quantity_change integer not null check (quantity_change <> 0),
  quantity_before integer not null check (quantity_before >= 0),
  quantity_after integer not null check (quantity_after >= 0),
  reference_id uuid,
  reason text,
  actor_id uuid not null references auth.users(id),
  idempotency_key uuid,
  created_at timestamptz not null default now(),
  check (quantity_after = quantity_before + quantity_change),
  foreign key (location_id, business_id) references public.locations(id, business_id),
  foreign key (variant_id, business_id) references public.product_variants(id, business_id),
  unique (business_id, idempotency_key)
);

create index inventory_movements_business_created_idx on public.inventory_movements (business_id, created_at desc);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  phone text,
  email text,
  address text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  unique (id, business_id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text not null,
  category text not null,
  amount numeric(14,2) not null check (amount > 0),
  description text,
  status text not null default 'posted' check (status in ('posted', 'voided')),
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  actor_id uuid references auth.users(id),
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_business_created_idx on public.audit_logs (business_id, created_at desc);

create table public.idempotency_records (
  business_id uuid not null references public.businesses(id) on delete cascade,
  operation text not null,
  idempotency_key uuid not null,
  request_hash text not null,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (business_id, operation, idempotency_key)
);

create or replace function public.current_business_role(p_business_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select bm.role
  from public.business_memberships bm
  where bm.business_id = p_business_id
    and bm.user_id = (select auth.uid())
    and bm.status = 'active'
  limit 1
$$;

create or replace function public.has_business_role(p_business_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_business_role(p_business_id) = any(p_roles), false)
$$;

revoke all on function public.current_business_role(uuid) from public;
revoke all on function public.has_business_role(uuid, text[]) from public;
grant execute on function public.current_business_role(uuid) to authenticated;
grant execute on function public.has_business_role(uuid, text[]) to authenticated;

alter table public.user_profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_memberships enable row level security;
alter table public.locations enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.payments enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.suppliers enable row level security;
alter table public.expenses enable row level security;
alter table public.audit_logs enable row level security;
alter table public.idempotency_records enable row level security;

create policy "Profiles are self-managed" on public.user_profiles
  for all to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "Members can read their businesses" on public.businesses
  for select to authenticated using (public.current_business_role(id) is not null);
create policy "Members can read their memberships" on public.business_memberships
  for select to authenticated using (public.current_business_role(business_id) is not null);
create policy "Owners manage memberships" on public.business_memberships
  for all to authenticated using (public.has_business_role(business_id, array['owner']))
  with check (public.has_business_role(business_id, array['owner']));
create policy "Members can read locations" on public.locations
  for select to authenticated using (public.current_business_role(business_id) is not null);
create policy "Managers manage locations" on public.locations
  for all to authenticated using (public.has_business_role(business_id, array['owner', 'admin', 'manager']))
  with check (public.has_business_role(business_id, array['owner', 'admin', 'manager']));
create policy "Members can read categories" on public.product_categories
  for select to authenticated using (public.current_business_role(business_id) is not null);
create policy "Managers manage categories" on public.product_categories
  for all to authenticated using (public.has_business_role(business_id, array['owner', 'admin', 'manager']))
  with check (public.has_business_role(business_id, array['owner', 'admin', 'manager']));
create policy "Members can read products" on public.products
  for select to authenticated using (public.current_business_role(business_id) is not null);
create policy "Managers manage products" on public.products
  for all to authenticated using (public.has_business_role(business_id, array['owner', 'admin', 'manager']))
  with check (public.has_business_role(business_id, array['owner', 'admin', 'manager']));
create policy "Managers manage product variants" on public.product_variants
  for all to authenticated using (public.has_business_role(business_id, array['owner', 'admin', 'manager']))
  with check (public.has_business_role(business_id, array['owner', 'admin', 'manager']));
create policy "Managers and stock clerks read inventory" on public.inventory_balances
  for select to authenticated using (public.has_business_role(business_id, array['owner', 'admin', 'manager', 'stock_clerk']));
create policy "Managers read sales; cashiers read own" on public.sales
  for select to authenticated using (
    public.has_business_role(business_id, array['owner', 'admin', 'manager', 'stock_clerk'])
    or (public.current_business_role(business_id) = 'cashier' and cashier_id = (select auth.uid()))
  );
create policy "Authorized members read sale items" on public.sale_items
  for select to authenticated using (
    public.has_business_role(business_id, array['owner', 'admin', 'manager', 'stock_clerk'])
    or exists (select 1 from public.sales s where s.id = sale_id and s.cashier_id = (select auth.uid())
      and public.current_business_role(business_id) = 'cashier')
  );
create policy "Authorized members read payments" on public.payments
  for select to authenticated using (
    public.has_business_role(business_id, array['owner', 'admin', 'manager'])
    or exists (select 1 from public.sales s where s.id = sale_id and s.cashier_id = (select auth.uid())
      and public.current_business_role(business_id) = 'cashier')
  );
create policy "Managers and stock clerks read movements" on public.inventory_movements
  for select to authenticated using (public.has_business_role(business_id, array['owner', 'admin', 'manager', 'stock_clerk']));
create policy "Managers manage suppliers" on public.suppliers
  for all to authenticated using (public.has_business_role(business_id, array['owner', 'admin', 'manager']))
  with check (public.has_business_role(business_id, array['owner', 'admin', 'manager']));
create policy "Managers manage expenses" on public.expenses
  for all to authenticated using (public.has_business_role(business_id, array['owner', 'admin', 'manager']))
  with check (public.has_business_role(business_id, array['owner', 'admin', 'manager']));
create policy "Owners read audit logs" on public.audit_logs
  for select to authenticated using (public.has_business_role(business_id, array['owner', 'admin']));

grant select on public.user_profiles, public.businesses, public.business_memberships,
  public.locations, public.product_categories, public.products, public.product_variants,
  public.inventory_balances, public.sales, public.sale_items, public.payments,
  public.inventory_movements, public.suppliers, public.expenses, public.audit_logs
  to authenticated;

create or replace function public.create_business(
  p_name text,
  p_currency text default 'RWF',
  p_timezone text default 'Africa/Kigali',
  p_location_name text default 'Main boutique'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 120 then raise exception 'Business name is required'; end if;
  if p_currency !~ '^[A-Z]{3}$' then raise exception 'Currency must be a three-letter ISO code'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'Choose a supported timezone';
  end if;
  if length(trim(coalesce(p_location_name, ''))) not between 1 and 100 then raise exception 'Location name is required'; end if;

  insert into public.businesses(name, currency, timezone)
  values (trim(p_name), p_currency, coalesce(nullif(trim(p_timezone), ''), 'Africa/Kigali'))
  returning id into v_business_id;
  insert into public.business_memberships(business_id, user_id, role, status)
  values (v_business_id, auth.uid(), 'owner', 'active');
  insert into public.locations(business_id, name) values (v_business_id, trim(p_location_name));
  insert into public.product_categories(business_id, name) values (v_business_id, 'Uncategorised');
  insert into public.audit_logs(business_id, actor_id, event_type, entity_type, entity_id)
  values (v_business_id, auth.uid(), 'business.created', 'business', v_business_id);
  return v_business_id;
end
$$;

create or replace function public.create_product(
  p_business_id uuid,
  p_name text,
  p_sku text,
  p_description text,
  p_variants jsonb,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_id uuid;
  v_category_id uuid;
  v_variant jsonb;
  v_variant_sku text;
  v_seen_skus text[] := array[]::text[];
  v_old_idem public.idempotency_records%rowtype;
  v_hash text;
  v_currency text;
begin
  if not public.has_business_role(p_business_id, array['owner', 'admin', 'manager']) then
    raise exception 'You are not allowed to create products';
  end if;
  select b.currency into v_currency from public.businesses b where b.id = p_business_id;
  if length(trim(coalesce(p_name, ''))) not between 1 and 160 then raise exception 'Product name is required'; end if;
  if length(trim(coalesce(p_sku, ''))) not between 1 and 80 then raise exception 'Product SKU is required'; end if;
  if jsonb_typeof(p_variants) <> 'array' or jsonb_array_length(p_variants) = 0 then raise exception 'Add at least one product variant'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key is required'; end if;

  v_hash := md5(jsonb_build_object('name', trim(p_name), 'sku', trim(p_sku),
    'description', coalesce(p_description, ''), 'variants', p_variants)::text);
  insert into public.idempotency_records(business_id, operation, idempotency_key, request_hash)
  values (p_business_id, 'create_product', p_idempotency_key, v_hash)
  on conflict do nothing;
  select * into v_old_idem from public.idempotency_records
  where business_id = p_business_id and operation = 'create_product' and idempotency_key = p_idempotency_key
  for update;
  if v_old_idem.request_hash <> v_hash then raise exception 'Idempotency key was already used for a different product'; end if;
  if v_old_idem.response is not null then return (v_old_idem.response->>'product_id')::uuid; end if;

  select id into v_category_id from public.product_categories
  where business_id = p_business_id and name = 'Uncategorised' limit 1;
  if v_category_id is null then
    insert into public.product_categories(business_id, name) values (p_business_id, 'Uncategorised')
    returning id into v_category_id;
  end if;
  insert into public.products(business_id, category_id, name, sku, description)
  values (p_business_id, v_category_id, trim(p_name), trim(p_sku), coalesce(p_description, ''))
  returning id into v_product_id;

  for v_variant in select value from jsonb_array_elements(p_variants) loop
    v_variant_sku := trim(coalesce(v_variant->>'sku', ''));
    if length(v_variant_sku) not between 1 and 80 then raise exception 'Each variant needs a SKU'; end if;
    if v_variant_sku = any(v_seen_skus) then raise exception 'Variant SKUs must be unique'; end if;
    v_seen_skus := array_append(v_seen_skus, v_variant_sku);
    if coalesce((v_variant->>'price')::numeric, 0) <= 0
      or coalesce((v_variant->>'cost_price')::numeric, -1) < 0 then
      raise exception 'Prices must be positive and cost cannot be negative';
    end if;
    if v_currency = 'RWF' and (
      (v_variant->>'price')::numeric <> trunc((v_variant->>'price')::numeric)
      or (v_variant->>'cost_price')::numeric <> trunc((v_variant->>'cost_price')::numeric)
    ) then raise exception 'RWF prices must use whole francs'; end if;
    if coalesce((v_variant->>'reorder_threshold')::integer, 5) < 0 then
      raise exception 'Reorder threshold cannot be negative';
    end if;
    insert into public.product_variants(business_id, product_id, sku, size, color, cost_price, price, reorder_threshold)
    values (p_business_id, v_product_id, v_variant_sku,
      nullif(trim(v_variant->>'size'), ''), nullif(trim(v_variant->>'color'), ''),
      (v_variant->>'cost_price')::numeric, (v_variant->>'price')::numeric,
      coalesce((v_variant->>'reorder_threshold')::integer, 5));
  end loop;

  insert into public.audit_logs(business_id, actor_id, event_type, entity_type, entity_id, details)
  values (p_business_id, auth.uid(), 'product.created', 'product', v_product_id,
    jsonb_build_object('sku', trim(p_sku), 'variant_count', jsonb_array_length(p_variants)));
  update public.idempotency_records set response = jsonb_build_object('product_id', v_product_id)
  where business_id = p_business_id and operation = 'create_product' and idempotency_key = p_idempotency_key;
  return v_product_id;
end
$$;

create or replace function public.get_catalog(p_business_id uuid, p_limit integer default 500, p_offset integer default 0)
returns table (
  product_id uuid,
  product_name text,
  product_sku text,
  category_name text,
  product_status text,
  variant_id uuid,
  variant_sku text,
  variant_size text,
  variant_color text,
  selling_price numeric,
  cost_price numeric,
  reorder_threshold integer,
  quantity_on_hand integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  v_role := public.current_business_role(p_business_id);
  if v_role is null then raise exception 'You do not have access to this business'; end if;
  if p_limit not between 1 and 500 or p_offset < 0 then raise exception 'Invalid catalog page request'; end if;
  return query
    select p.id, p.name, p.sku, c.name, p.status, v.id, v.sku, v.size, v.color, v.price,
      case when v_role in ('owner', 'admin', 'manager') then v.cost_price else 0::numeric end,
      v.reorder_threshold,
      coalesce(b.quantity_on_hand, 0)
    from public.products p
    left join public.product_categories c on c.id = p.category_id and c.business_id = p.business_id
    join public.product_variants v on v.product_id = p.id and v.business_id = p.business_id
    left join public.inventory_balances b on b.variant_id = v.id and b.business_id = v.business_id
      and b.location_id = (select l.id from public.locations l where l.business_id = p_business_id and l.is_active order by l.created_at limit 1)
    where p.business_id = p_business_id and p.status = 'active' and v.status = 'active'
    order by p.name, v.sku
    limit p_limit offset p_offset;
end
$$;

create or replace function public.get_inventory_valuation(p_business_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_business_role(p_business_id, array['owner', 'admin', 'manager']) then
    raise exception 'You are not allowed to view inventory valuation';
  end if;
  return coalesce((
    select sum(b.quantity_on_hand * b.average_cost)
    from public.inventory_balances b
    where b.business_id = p_business_id
  ), 0);
end
$$;

create or replace function public.receive_stock(
  p_business_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_unit_cost numeric,
  p_reason text,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_location_id uuid;
  v_balance public.inventory_balances%rowtype;
  v_old_idem public.idempotency_records%rowtype;
  v_hash text;
  v_movement_id uuid;
  v_new_quantity integer;
  v_currency text;
begin
  if not public.has_business_role(p_business_id, array['owner', 'admin', 'manager', 'stock_clerk']) then
    raise exception 'You are not allowed to receive stock';
  end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Received quantity must be greater than zero'; end if;
  if p_unit_cost is null or p_unit_cost < 0 then raise exception 'Unit cost cannot be negative'; end if;
  select b.currency into v_currency from public.businesses b where b.id = p_business_id;
  if v_currency = 'RWF' and p_unit_cost <> trunc(p_unit_cost) then raise exception 'RWF costs must use whole francs'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key is required'; end if;

  v_hash := md5(jsonb_build_object('variant_id', p_variant_id, 'quantity', p_quantity, 'unit_cost', p_unit_cost, 'reason', p_reason)::text);
  insert into public.idempotency_records(business_id, operation, idempotency_key, request_hash)
  values (p_business_id, 'receive_stock', p_idempotency_key, v_hash)
  on conflict do nothing;
  select * into v_old_idem from public.idempotency_records
  where business_id = p_business_id and operation = 'receive_stock' and idempotency_key = p_idempotency_key
  for update;
  if v_old_idem.request_hash <> v_hash then raise exception 'Idempotency key was already used for a different receipt'; end if;
  if v_old_idem.response is not null then return (v_old_idem.response->>'movement_id')::uuid; end if;

  select id into v_location_id from public.locations
  where business_id = p_business_id and is_active order by created_at limit 1;
  if v_location_id is null then raise exception 'No active stock location is configured'; end if;
  if not exists (select 1 from public.product_variants where id = p_variant_id and business_id = p_business_id and status = 'active') then
    raise exception 'Product variant was not found or is inactive';
  end if;
  insert into public.inventory_balances(business_id, location_id, variant_id)
  values (p_business_id, v_location_id, p_variant_id)
  on conflict (business_id, location_id, variant_id) do nothing;
  select * into v_balance from public.inventory_balances
  where business_id = p_business_id and location_id = v_location_id and variant_id = p_variant_id
  for update;
  v_new_quantity := v_balance.quantity_on_hand + p_quantity;
  update public.inventory_balances set
    average_cost = case when v_new_quantity = 0 then 0
      else round(((v_balance.quantity_on_hand * v_balance.average_cost) + (p_quantity * p_unit_cost)) / v_new_quantity, 2) end,
    quantity_on_hand = v_new_quantity, updated_at = now()
  where id = v_balance.id;
  update public.product_variants set cost_price = case when v_new_quantity = 0 then 0
      else round(((v_balance.quantity_on_hand * v_balance.average_cost) + (p_quantity * p_unit_cost)) / v_new_quantity, 2) end
  where id = p_variant_id and business_id = p_business_id;
  insert into public.inventory_movements(business_id, location_id, variant_id, movement_type,
    quantity_change, quantity_before, quantity_after, reason, actor_id, idempotency_key)
  values (p_business_id, v_location_id, p_variant_id, 'receipt', p_quantity,
    v_balance.quantity_on_hand, v_new_quantity, left(coalesce(p_reason, 'Stock receipt'), 200),
    auth.uid(), p_idempotency_key)
  returning id into v_movement_id;
  insert into public.audit_logs(business_id, actor_id, event_type, entity_type, entity_id, details)
  values (p_business_id, auth.uid(), 'stock.received', 'inventory_movement', v_movement_id,
    jsonb_build_object('variant_id', p_variant_id, 'quantity', p_quantity, 'unit_cost', p_unit_cost));
  update public.idempotency_records set response = jsonb_build_object('movement_id', v_movement_id)
  where business_id = p_business_id and operation = 'receive_stock' and idempotency_key = p_idempotency_key;
  return v_movement_id;
end
$$;

create or replace function public.complete_sale(
  p_business_id uuid,
  p_items jsonb,
  p_payments jsonb,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_location_id uuid;
  v_variant record;
  v_item jsonb;
  v_payment jsonb;
  v_old_idem public.idempotency_records%rowtype;
  v_sale_id uuid;
  v_sale_number text;
  v_quantity integer;
  v_total numeric(14,2) := 0;
  v_payment_total numeric(14,2) := 0;
  v_hash text;
  v_currency text;
begin
  if not public.has_business_role(p_business_id, array['owner', 'admin', 'manager', 'cashier']) then
    raise exception 'You are not allowed to complete sales';
  end if;
  select b.currency into v_currency from public.businesses b where b.id = p_business_id;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one item'; end if;
  if jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then raise exception 'Add a payment'; end if;
  if p_idempotency_key is null then raise exception 'Idempotency key is required'; end if;

  v_hash := md5(jsonb_build_object('items', p_items, 'payments', p_payments)::text);
  insert into public.idempotency_records(business_id, operation, idempotency_key, request_hash)
  values (p_business_id, 'complete_sale', p_idempotency_key, v_hash)
  on conflict do nothing;
  select * into v_old_idem from public.idempotency_records
  where business_id = p_business_id and operation = 'complete_sale' and idempotency_key = p_idempotency_key
  for update;
  if v_old_idem.request_hash <> v_hash then raise exception 'Idempotency key was already used for a different sale'; end if;
  if v_old_idem.response is not null then return (v_old_idem.response->>'sale_id')::uuid; end if;

  select id into v_location_id from public.locations
  where business_id = p_business_id and is_active order by created_at limit 1;
  if v_location_id is null then raise exception 'No active stock location is configured'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce((v_item->>'quantity')::integer, 0) <= 0 then raise exception 'Sale quantities must be positive whole numbers'; end if;
    select v.*, b.quantity_on_hand, b.average_cost
    into v_variant
    from public.product_variants v
    join public.inventory_balances b on b.variant_id = v.id and b.business_id = p_business_id
      and b.location_id = v_location_id
    where v.id = (v_item->>'variant_id')::uuid and v.business_id = p_business_id and v.status = 'active'
    for update of b;
    if not found then raise exception 'A selected variant is not available at this location'; end if;
    v_quantity := (v_item->>'quantity')::integer;
    if v_variant.quantity_on_hand < v_quantity then raise exception 'Insufficient stock for variant %', v_variant.sku; end if;
    if v_currency = 'RWF' and v_variant.price <> trunc(v_variant.price) then raise exception 'RWF sale prices must use whole francs'; end if;
    v_total := v_total + (v_variant.price * v_quantity);
  end loop;

  for v_payment in select value from jsonb_array_elements(p_payments) loop
    if coalesce((v_payment->>'amount')::numeric, 0) <= 0 then raise exception 'Payment amount must be positive'; end if;
    if v_currency = 'RWF' and (v_payment->>'amount')::numeric <> trunc((v_payment->>'amount')::numeric) then
      raise exception 'RWF payment amounts must use whole francs';
    end if;
    if coalesce(v_payment->>'method', '') not in ('cash', 'mobile_money', 'bank_transfer', 'card', 'other') then
      raise exception 'Unsupported payment method';
    end if;
    v_payment_total := v_payment_total + (v_payment->>'amount')::numeric;
  end loop;
  if v_payment_total <> v_total then raise exception 'Payment total must exactly match sale total'; end if;

  v_sale_number := 'S-' || to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDDHH24MISSMS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));
  insert into public.sales(business_id, location_id, cashier_id, sale_number, subtotal, total, idempotency_key)
  values (p_business_id, v_location_id, auth.uid(), v_sale_number, v_total, v_total, p_idempotency_key)
  returning id into v_sale_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select v.*, b.quantity_on_hand, b.average_cost
    into v_variant
    from public.product_variants v
    join public.inventory_balances b on b.variant_id = v.id and b.business_id = p_business_id
      and b.location_id = v_location_id
    where v.id = (v_item->>'variant_id')::uuid and v.business_id = p_business_id
    for update of b;
    v_quantity := (v_item->>'quantity')::integer;
    insert into public.sale_items(business_id, sale_id, variant_id, quantity, unit_price, unit_cost_snapshot, line_total)
    values (p_business_id, v_sale_id, v_variant.id, v_quantity, v_variant.price, v_variant.average_cost, v_variant.price * v_quantity);
    update public.inventory_balances set quantity_on_hand = quantity_on_hand - v_quantity, updated_at = now()
    where business_id = p_business_id and location_id = v_location_id and variant_id = v_variant.id;
    insert into public.inventory_movements(business_id, location_id, variant_id, movement_type,
      quantity_change, quantity_before, quantity_after, reference_id, reason, actor_id)
    values (p_business_id, v_location_id, v_variant.id, 'sale', -v_quantity,
      v_variant.quantity_on_hand, v_variant.quantity_on_hand - v_quantity, v_sale_id, 'Point-of-sale transaction', auth.uid());
  end loop;
  for v_payment in select value from jsonb_array_elements(p_payments) loop
    insert into public.payments(business_id, sale_id, method, amount, reference)
    values (p_business_id, v_sale_id, v_payment->>'method', (v_payment->>'amount')::numeric, nullif(v_payment->>'reference', ''));
  end loop;
  insert into public.audit_logs(business_id, actor_id, event_type, entity_type, entity_id, details)
  values (p_business_id, auth.uid(), 'sale.completed', 'sale', v_sale_id,
    jsonb_build_object('sale_number', v_sale_number, 'total', v_total));
  update public.idempotency_records set response = jsonb_build_object('sale_id', v_sale_id)
  where business_id = p_business_id and operation = 'complete_sale' and idempotency_key = p_idempotency_key;
  return v_sale_id;
end
$$;

revoke all on function public.create_business(text, text, text, text) from public;
revoke all on function public.create_product(uuid, text, text, text, jsonb, uuid) from public;
revoke all on function public.get_catalog(uuid, integer, integer) from public;
revoke all on function public.get_inventory_valuation(uuid) from public;
revoke all on function public.receive_stock(uuid, uuid, integer, numeric, text, uuid) from public;
revoke all on function public.complete_sale(uuid, jsonb, jsonb, uuid) from public;
grant execute on function public.create_business(text, text, text, text) to authenticated;
grant execute on function public.create_product(uuid, text, text, text, jsonb, uuid) to authenticated;
grant execute on function public.get_catalog(uuid, integer, integer) to authenticated;
grant execute on function public.get_inventory_valuation(uuid) to authenticated;
grant execute on function public.receive_stock(uuid, uuid, integer, numeric, text, uuid) to authenticated;
grant execute on function public.complete_sale(uuid, jsonb, jsonb, uuid) to authenticated;

revoke select on public.inventory_balances from authenticated;
grant select (id, business_id, location_id, variant_id, quantity_on_hand, updated_at)
  on public.inventory_balances to authenticated;
revoke select on public.sale_items from authenticated;
grant select (id, business_id, sale_id, variant_id, quantity, unit_price, line_total, created_at)
  on public.sale_items to authenticated;
