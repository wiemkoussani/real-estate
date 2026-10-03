alter table public.leads add column if not exists gender text;
alter table public.leads add column if not exists subject text;
alter table public.leads add column if not exists message text;
alter table public.leads add column if not exists to_favorites boolean default false;
