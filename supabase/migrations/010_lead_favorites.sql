-- Villas the visitor liked (heart) and chose to attach to their request.
alter table public.leads add column if not exists favorite_units text[];
