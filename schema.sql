-- Karthik Jewelry starter schema. Run in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  phone text,
  role text not null default 'customer' check (role in ('customer','admin')),
  created_at timestamptz not null default now()
);
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,email) values(new.id,new.email)
  on conflict(id) do update set email=excluded.email;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  category text not null,
  description text,
  price numeric(10,2) not null check(price>=0),
  compare_at_price numeric(10,2),
  image_url text,
  tag text,
  stock integer not null default 0 check(stock>=0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_category_idx on public.products(category);
create index if not exists products_active_created_idx on public.products(active,created_at desc);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text unique not null,
  user_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  phone text not null,
  email text not null,
  shipping_address jsonb not null,
  payment_method text not null check(payment_method in ('cod','online')),
  status text not null default 'placed',
  payment_status text not null default 'pending',
  subtotal numeric(10,2) not null,
  shipping_fee numeric(10,2) not null default 0,
  discount numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  tracking_number text,
  courier_name text,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_user_created_idx on public.orders(user_id,created_at desc);
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  unit_price numeric(10,2) not null,
  quantity integer not null check(quantity>0)
);
create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  created_at timestamptz not null default now()
);
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  discount_type text not null check(discount_type in ('percent','fixed')),
  discount_value numeric(10,2) not null,
  minimum_order numeric(10,2) not null default 0,
  active boolean not null default true,
  starts_at timestamptz,
  expires_at timestamptz,
  usage_limit integer,
  used_count integer not null default 0
);
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating integer not null check(rating between 1 and 5),
  review_text text,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  unique(product_id,user_id)
);

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.coupons enable row level security;
alter table public.reviews enable row level security;

create policy "Public can read active products" on public.products for select using(active=true);
create policy "Users can read own profile" on public.profiles for select using(auth.uid()=id);
create policy "Users can update own profile" on public.profiles for update using(auth.uid()=id) with check(auth.uid()=id);
create policy "Users can read own orders" on public.orders for select using(auth.uid()=user_id);
create policy "Users can read own order items" on public.order_items for select using(exists(select 1 from public.orders o where o.id=order_id and o.user_id=auth.uid()));
create policy "Public can read approved reviews" on public.reviews for select using(approved=true);
create policy "Users can submit own reviews" on public.reviews for insert with check(auth.uid()=user_id);
create policy "Public can add newsletter email" on public.newsletter_subscribers for insert with check(true);

-- Public product image bucket. Upload permissions should be restricted to admins in production.
insert into storage.buckets(id,name,public) values('product-images','product-images',true)
on conflict(id) do nothing;
create policy "Public can view product images" on storage.objects for select using(bucket_id='product-images');
-- Admin product writes are performed through the Render API using the service-role key.
