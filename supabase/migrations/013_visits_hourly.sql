-- Visitors: the same device counts again when it comes back at least 1 hour after its last counted visit
-- (was: once per day). The server decides; the old one-per-day rule is removed.
alter table public.complex_visits drop constraint if exists complex_visits_complex_id_visitor_id_day_key;

create index if not exists complex_visits_device_idx
  on public.complex_visits (complex_id, visitor_id, created_at desc);
