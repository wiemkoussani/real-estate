-- Contacts page: the client follows each lead (New → In Progress → Sold).
alter table public.leads add column if not exists status text not null default 'new';

do $$ begin
  alter table public.leads add constraint leads_status_ok check (status in ('new', 'in_progress', 'sold'));
exception when duplicate_object then null;
end $$;
