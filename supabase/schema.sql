-- Execute uma única vez no SQL Editor do Supabase.
create extension if not exists pgcrypto;

create table if not exists public.weddings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  bride text not null default '',
  groom text not null default '',
  event_date date,
  event_time time,
  location text not null default '',
  address text not null default '',
  primary_color text not null default '#8f5f64',
  secondary_color text not null default '#c8d2bd',
  title_font text not null default 'Playfair Display',
  background_url text not null default '',
  dress_code text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists weddings_owner_id_key on public.weddings(owner_id);

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  name text not null,
  head_name text not null,
  pin_code text not null check (pin_code ~ '^[0-9]{4}$'),
  people_count integer not null default 1 check (people_count > 0),
  origin text not null default '',
  phone text not null default '',
  rsvp_status text not null default 'pending' check (rsvp_status in ('pending', 'confirmed', 'declined')),
  created_at timestamptz not null default now(),
  unique (wedding_id, pin_code)
);

create table if not exists public.gifts (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  name text not null,
  description text not null default '',
  price numeric(12, 2) not null default 0,
  icon text not null default '🎁',
  store_link_1 text not null default '',
  store_link_2 text not null default '',
  status text not null default 'available' check (status in ('available', 'reserved')),
  created_at timestamptz not null default now()
);

create table if not exists public.budget_items (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  name text not null,
  supplier text not null default '',
  category text not null default '',
  amount numeric(12, 2) not null default 0,
  amount_paid numeric(12, 2) not null default 0,
  due_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings(id) on delete cascade,
  kind text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.rsvp_challenges (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.weddings enable row level security;
alter table public.families enable row level security;
alter table public.gifts enable row level security;
alter table public.budget_items enable row level security;
alter table public.activity_log enable row level security;
alter table public.rsvp_challenges enable row level security;

create policy "owner manages wedding" on public.weddings for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "owner manages families" on public.families for all
  using (exists (select 1 from public.weddings w where w.id = wedding_id and w.owner_id = auth.uid()))
  with check (exists (select 1 from public.weddings w where w.id = wedding_id and w.owner_id = auth.uid()));

create policy "owner manages gifts" on public.gifts for all
  using (exists (select 1 from public.weddings w where w.id = wedding_id and w.owner_id = auth.uid()))
  with check (exists (select 1 from public.weddings w where w.id = wedding_id and w.owner_id = auth.uid()));

create policy "owner manages budget" on public.budget_items for all
  using (exists (select 1 from public.weddings w where w.id = wedding_id and w.owner_id = auth.uid()))
  with check (exists (select 1 from public.weddings w where w.id = wedding_id and w.owner_id = auth.uid()));

create policy "owner sees activity" on public.activity_log for select
  using (exists (select 1 from public.weddings w where w.id = wedding_id and w.owner_id = auth.uid()));
create policy "owner records activity" on public.activity_log for insert
  with check (exists (select 1 from public.weddings w where w.id = wedding_id and w.owner_id = auth.uid()));

create policy "public reads wedding" on public.weddings for select using (true);
create policy "public reads gifts" on public.gifts for select using (true);
-- Não crie políticas públicas para famílias, orçamento, histórico ou desafios.
