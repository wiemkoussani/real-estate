-- Analytics: what each tour visit looked like, and which villas visitors looked at / liked.
-- No IP address is stored: only the city/country the hosting provider resolves.

alter table public.complex_visits add column if not exists source text;      -- direct | qr | facebook | instagram | whatsapp | google | other
alter table public.complex_visits add column if not exists device text;      -- mobile | desktop | tablet
alter table public.complex_visits add column if not exists os text;          -- iOS | Android | Windows | macOS | Linux | Other
alter table public.complex_visits add column if not exists country text;
alter table public.complex_visits add column if not exists city text;
alter table public.complex_visits add column if not exists duration_s integer not null default 0;  -- visible time on the tour

create index if not exists complex_visits_complex_created_idx2 on public.complex_visits (complex_id, created_at desc);

-- One row each time a visitor opens a villa (with how long) or likes one.
create table if not exists public.unit_events (
  id bigint generated always as identity primary key,
  complex_id uuid not null references public.complexes (id) on delete cascade,
  visit_id bigint references public.complex_visits (id) on delete set null,
  visitor_id text not null,
  unit_display_id text not null,
  kind text not null check (kind in ('view', 'favorite')),
  duration_s integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists unit_events_complex_created_idx on public.unit_events (complex_id, created_at desc);

-- Written and read only by the server (service role).
alter table public.unit_events enable row level security;
