create extension if not exists pgcrypto;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nom text not null,
  prenom text not null,
  email text not null,
  tel text not null,
  unit_id text,
  unit_display_id text,
  complex_slug text not null
);

alter table public.leads enable row level security;

create policy "service inserts leads" on public.leads
  for insert
  to service_role
  with check (true);

create policy "no public read" on public.leads
  for select
  to anon
  using (false);
