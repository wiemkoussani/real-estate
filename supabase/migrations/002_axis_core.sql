create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('admin', 'client');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.unit_status as enum ('available', 'reserved', 'sold');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.asset_kind as enum (
    'frame_low', 'frame_high', 'villa_360', 'plan', 'gallery', 'branding', 'glb', 'other'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null default 'client',
  full_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.complexes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  location_query text,
  owner_id uuid references public.profiles (id) on delete set null,
  published boolean not null default false,
  asset_base text,
  glb_path text,
  logo_path text,
  total_frames int not null default 90,
  villa_frames int not null default 60,
  render_w int not null default 13000,
  render_h int not null default 7312,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint complexes_slug_ok check (slug ~ '^[a-z0-9-]+$')
);

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  complex_id uuid not null references public.complexes (id) on delete cascade,
  mesh_id text not null,
  display_id text not null,
  type int not null default 1,
  status public.unit_status not null default 'available',
  surface int not null default 0,
  rooms int not null default 0,
  floor int not null default 0,
  plan_path text,
  created_at timestamptz not null default now(),
  unique (complex_id, mesh_id)
);

create index if not exists units_complex_idx on public.units (complex_id);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  complex_id uuid not null references public.complexes (id) on delete cascade,
  kind public.asset_kind not null,
  path text not null,
  sort_index int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists assets_complex_idx on public.assets (complex_id, kind);

alter table public.leads add column if not exists complex_id uuid references public.complexes (id) on delete set null;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.owns_complex(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.complexes c
    where c.id = cid and c.owner_id = auth.uid()
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    'client',
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.complexes enable row level security;
alter table public.units enable row level security;
alter table public.assets enable row level security;
alter table public.leads enable row level security;

drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles admin update" on public.profiles;
create policy "profiles admin update" on public.profiles
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "complexes public read published" on public.complexes;
create policy "complexes public read published" on public.complexes
  for select to anon, authenticated
  using (published = true or public.is_admin() or owner_id = auth.uid());

drop policy if exists "complexes admin write" on public.complexes;
create policy "complexes admin write" on public.complexes
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "complexes client update own" on public.complexes;
create policy "complexes client update own" on public.complexes
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "units public read" on public.units;
create policy "units public read" on public.units
  for select to anon, authenticated
  using (
    exists (select 1 from public.complexes c where c.id = complex_id and (c.published or public.is_admin() or c.owner_id = auth.uid()))
  );

drop policy if exists "units admin write" on public.units;
create policy "units admin write" on public.units
  for all to authenticated
  using (public.is_admin() or public.owns_complex(complex_id))
  with check (public.is_admin() or public.owns_complex(complex_id));

drop policy if exists "assets public read" on public.assets;
create policy "assets public read" on public.assets
  for select to anon, authenticated
  using (
    exists (select 1 from public.complexes c where c.id = complex_id and (c.published or public.is_admin() or c.owner_id = auth.uid()))
  );

drop policy if exists "assets admin write" on public.assets;
create policy "assets admin write" on public.assets
  for all to authenticated
  using (public.is_admin() or public.owns_complex(complex_id))
  with check (public.is_admin() or public.owns_complex(complex_id));

drop policy if exists "leads admin read" on public.leads;
create policy "leads admin read" on public.leads
  for select to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.complexes c where c.id = leads.complex_id and c.owner_id = auth.uid())
    or exists (select 1 from public.complexes c where c.slug = leads.complex_slug and c.owner_id = auth.uid())
  );

drop policy if exists "no public read" on public.leads;
create policy "no public read" on public.leads
  for select to anon
  using (false);

drop policy if exists "service inserts leads" on public.leads;
create policy "service inserts leads" on public.leads
  for insert
  to service_role
  with check (true);

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;

drop policy if exists "media public read" on storage.objects;
create policy "media public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'media');

drop policy if exists "media admin write" on storage.objects;
create policy "media admin write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and public.is_admin());

drop policy if exists "media admin update" on storage.objects;
create policy "media admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and public.is_admin());

drop policy if exists "media admin delete" on storage.objects;
create policy "media admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and public.is_admin());

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.owns_complex(uuid) to anon, authenticated;

insert into public.complexes (slug, name, location_query, published, asset_base, glb_path, logo_path)
values (
  'villas-ajyad',
  'Villas Ajyad',
  'Villas Ajyad',
  true,
  '/complexes/villas-ajyad',
  '/complexes/villas-ajyad/models/building.glb',
  '/complexes/villas-ajyad/logo.png'
)
on conflict (slug) do nothing;
