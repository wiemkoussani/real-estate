create table if not exists public.complex_members (
  complex_id uuid not null references public.complexes (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (complex_id, profile_id)
);

create index if not exists complex_members_profile_idx on public.complex_members (profile_id);

insert into public.complex_members (complex_id, profile_id)
select id, owner_id from public.complexes
where owner_id is not null
on conflict do nothing;

create or replace function public.owns_complex(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.complex_members m
    where m.complex_id = cid and m.profile_id = auth.uid()
  );
$$;

grant execute on function public.owns_complex(uuid) to anon, authenticated;

alter table public.complex_members enable row level security;

drop policy if exists "members self read" on public.complex_members;
create policy "members self read" on public.complex_members
  for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

drop policy if exists "members admin write" on public.complex_members;
create policy "members admin write" on public.complex_members
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "complexes public read published" on public.complexes;
create policy "complexes public read published" on public.complexes
  for select to anon, authenticated
  using (published = true or public.is_admin() or public.owns_complex(id));

drop policy if exists "complexes client update own" on public.complexes;
create policy "complexes client update own" on public.complexes
  for update to authenticated
  using (public.owns_complex(id))
  with check (public.owns_complex(id));

drop policy if exists "units public read" on public.units;
create policy "units public read" on public.units
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.complexes c
      where c.id = complex_id and (c.published or public.is_admin() or public.owns_complex(c.id))
    )
  );

drop policy if exists "assets public read" on public.assets;
create policy "assets public read" on public.assets
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.complexes c
      where c.id = complex_id and (c.published or public.is_admin() or public.owns_complex(c.id))
    )
  );

drop policy if exists "leads admin read" on public.leads;
create policy "leads admin read" on public.leads
  for select to authenticated
  using (
    public.is_admin()
    or public.owns_complex(complex_id)
    or exists (
      select 1 from public.complexes c
      where c.slug = leads.complex_slug and public.owns_complex(c.id)
    )
  );

drop policy if exists "private owner read" on storage.objects;
create policy "private owner read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'private'
    and exists (
      select 1 from public.complexes c
      where public.owns_complex(c.id)
        and (storage.objects.name like c.slug || '/%')
    )
  );
