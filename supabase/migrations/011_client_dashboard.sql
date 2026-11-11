-- Client dashboard ("My Projects"): visitor counts, "new since last look", profile photo, card info.

-- Card text entered by admin
alter table public.complexes add column if not exists description text;
alter table public.complexes add column if not exists city text;

-- Profile photo the client uploads from the dashboard
alter table public.profiles add column if not exists avatar_url text;

-- When this client last opened the project from the dashboard (resets the red badge and "+N new")
alter table public.complex_members add column if not exists last_seen_at timestamptz;

-- One row per device per day that opened the public tour.
create table if not exists public.complex_visits (
  id bigint generated always as identity primary key,
  complex_id uuid not null references public.complexes (id) on delete cascade,
  visitor_id text not null,
  day date not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now(),
  unique (complex_id, visitor_id, day)
);

create index if not exists complex_visits_complex_created_idx on public.complex_visits (complex_id, created_at);

-- Written and read only by the server (service role).
alter table public.complex_visits enable row level security;
