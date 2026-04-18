-- =========================================================================
-- Market Research Journal — Supabase setup
-- Run this entire file in: Supabase Dashboard -> SQL Editor -> New Query
-- =========================================================================

-- 1. Tables ---------------------------------------------------------------
create table if not exists public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  log_date date not null default current_date,
  title text not null,
  body text not null,
  price_points jsonb default '[]'::jsonb,   -- [{label, value}, ...]
  links jsonb default '[]'::jsonb,          -- [{label, url}, ...]
  custom_fields jsonb default '[]'::jsonb,  -- [{label, value}, ...]
  image_urls text[] default '{}',
  created_by uuid references auth.users(id) on delete set null,
  author_email text
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  body text not null,
  tags text[] default '{}',
  image_urls text[] default '{}',
  created_by uuid references auth.users(id) on delete set null,
  author_email text
);

create table if not exists public.strategies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('strategy','weekly','monthly')),
  period_start date,
  period_end date,
  title text not null,
  body text not null,
  image_urls text[] default '{}',
  created_by uuid references auth.users(id) on delete set null,
  author_email text
);

create index if not exists idx_daily_logs_date on public.daily_logs (log_date desc);
create index if not exists idx_notes_created on public.notes (created_at desc);
create index if not exists idx_strategies_kind on public.strategies (kind, created_at desc);

-- 2. Row Level Security ---------------------------------------------------
alter table public.daily_logs enable row level security;
alter table public.notes      enable row level security;
alter table public.strategies enable row level security;

-- Public read
drop policy if exists "public read logs"      on public.daily_logs;
drop policy if exists "public read notes"     on public.notes;
drop policy if exists "public read strategies" on public.strategies;
create policy "public read logs"       on public.daily_logs for select using (true);
create policy "public read notes"      on public.notes      for select using (true);
create policy "public read strategies" on public.strategies for select using (true);

-- Admin-only write (single hardcoded admin email)
-- IMPORTANT: change the email below if your admin changes.
drop policy if exists "admin write logs"       on public.daily_logs;
drop policy if exists "admin write notes"      on public.notes;
drop policy if exists "admin write strategies" on public.strategies;

create policy "admin write logs" on public.daily_logs
  for all to authenticated
  using (auth.jwt() ->> 'email' = '7withak@gmail.com')
  with check (auth.jwt() ->> 'email' = '7withak@gmail.com');

create policy "admin write notes" on public.notes
  for all to authenticated
  using (auth.jwt() ->> 'email' = '7withak@gmail.com')
  with check (auth.jwt() ->> 'email' = '7withak@gmail.com');

create policy "admin write strategies" on public.strategies
  for all to authenticated
  using (auth.jwt() ->> 'email' = '7withak@gmail.com')
  with check (auth.jwt() ->> 'email' = '7withak@gmail.com');

-- 3. Storage bucket for images -------------------------------------------
insert into storage.buckets (id, name, public)
  values ('log-images', 'log-images', true)
  on conflict (id) do nothing;

drop policy if exists "public read images"  on storage.objects;
drop policy if exists "admin upload images" on storage.objects;
drop policy if exists "admin update images" on storage.objects;
drop policy if exists "admin delete images" on storage.objects;

create policy "public read images" on storage.objects
  for select using (bucket_id = 'log-images');

create policy "admin upload images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'log-images' and auth.jwt() ->> 'email' = '7withak@gmail.com');

create policy "admin update images" on storage.objects
  for update to authenticated
  using (bucket_id = 'log-images' and auth.jwt() ->> 'email' = '7withak@gmail.com');

create policy "admin delete images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'log-images' and auth.jwt() ->> 'email' = '7withak@gmail.com');

-- 4. Done. In Supabase: Authentication -> Providers -> Email -> ensure
--    "Email" is enabled and "Confirm email" works for magic links.
