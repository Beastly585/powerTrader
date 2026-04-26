-- ============================================================
-- Market Research Journal — Supabase setup
-- Run this ENTIRE file in Supabase → SQL Editor → New query
-- WARNING: This DROPS existing tables and all data. Fresh start.
-- ============================================================

-- ---------- 1. EXTENSIONS ----------
create extension if not exists "pgcrypto";

-- ---------- 2. DROP EXISTING ----------
-- Skip bucket drop (will use ON CONFLICT in insert below)

-- Drop tables (CASCADE removes dependent policies automatically)
drop table if exists public.daily_logs cascade;
drop table if exists public.notes cascade;
drop table if exists public.strategies cascade;

-- ---------- 3. CREATE TABLES ----------

-- Daily logs table
-- Columns: id, entry_date, title, blocks, created_at
create table public.daily_logs (
  id          uuid primary key default gen_random_uuid(),
  entry_date  date not null default current_date,
  title       text not null,
  blocks      jsonb not null default '[]'::jsonb,
  tags        jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

-- Notes table
-- Columns: id, title, body, created_at
create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text not null,
  created_at  timestamptz not null default now()
);

-- Strategies table
-- Columns: id, kind, title, body, period_start, period_end, created_at
create table public.strategies (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('strategy','weekly','monthly')),
  title       text not null,
  body        text not null,
  period_start date,
  period_end   date,
  created_at  timestamptz not null default now()
);

-- ---------- 4. CREATE INDEXES ----------
create index daily_logs_entry_date_idx on public.daily_logs (entry_date desc);
create index daily_logs_created_at_idx on public.daily_logs (created_at desc);
create index notes_created_at_idx on public.notes (created_at desc);
create index strategies_kind_created_idx on public.strategies (kind, created_at desc);

-- ---------- 5. ROW LEVEL SECURITY ----------
alter table public.daily_logs enable row level security;
alter table public.notes      enable row level security;
alter table public.strategies enable row level security;

-- Public read policies (anyone can read)
create policy "public_read_daily_logs"   on public.daily_logs  for select using (true);
create policy "public_read_notes"        on public.notes       for select using (true);
create policy "public_read_strategies"   on public.strategies  for select using (true);

-- Anonymous write policies (no auth required for insert/update/delete)
create policy "anon_insert_daily_logs"   on public.daily_logs  for insert to anon with check (true);
create policy "anon_update_daily_logs"   on public.daily_logs  for update to anon using (true) with check (true);
create policy "anon_delete_daily_logs"   on public.daily_logs  for delete to anon using (true);

create policy "anon_insert_notes"        on public.notes       for insert to anon with check (true);
create policy "anon_update_notes"        on public.notes       for update to anon using (true) with check (true);
create policy "anon_delete_notes"        on public.notes       for delete to anon using (true);

create policy "anon_insert_strategies"   on public.strategies  for insert to anon with check (true);
create policy "anon_update_strategies"   on public.strategies  for update to anon using (true) with check (true);
create policy "anon_delete_strategies"   on public.strategies  for delete to anon using (true);

-- ---------- 6. STORAGE (image uploads) ----------
-- Create public bucket for images
insert into storage.buckets (id, name, public) 
values ('log-images', 'log-images', true)
on conflict (id) do nothing;

-- Storage policies for anonymous access
drop policy if exists "storage_read_log_images"   on storage.objects;
drop policy if exists "storage_insert_log_images" on storage.objects;
drop policy if exists "storage_delete_log_images" on storage.objects;

create policy "storage_read_log_images"
  on storage.objects for select
  using (bucket_id = 'log-images');

create policy "storage_insert_log_images"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'log-images');

create policy "storage_delete_log_images"
  on storage.objects for delete
  to anon
  using (bucket_id = 'log-images');

-- Done.
