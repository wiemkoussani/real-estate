do $$ begin
  alter type public.asset_kind add value 'document';
exception when duplicate_object then null;
end $$;

insert into storage.buckets (id, name, public)
values ('private', 'private', false)
on conflict (id) do update set public = false;

drop policy if exists "private admin read" on storage.objects;
create policy "private admin read" on storage.objects
  for select to authenticated
  using (bucket_id = 'private' and public.is_admin());

drop policy if exists "private owner read" on storage.objects;
create policy "private owner read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'private'
    and exists (
      select 1 from public.complexes c
      where c.owner_id = auth.uid()
        and (storage.objects.name like c.slug || '/%')
    )
  );

drop policy if exists "private admin write" on storage.objects;
create policy "private admin write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'private' and public.is_admin());

drop policy if exists "private admin update" on storage.objects;
create policy "private admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'private' and public.is_admin());

drop policy if exists "private admin delete" on storage.objects;
create policy "private admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'private' and public.is_admin());
