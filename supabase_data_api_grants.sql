-- Book Value Library: explicit Data API grants for the current schema.
-- Run in the Supabase SQL Editor for the same project as this site.
-- Public users may read catalog/market evidence only. RLS remains responsible for
-- restricting writes to admins. No anon write grants are added.
--
-- For every future CREATE TABLE in public, add table-specific GRANT statements in that
-- same migration. Do not rely on Supabase's former automatic grants for new tables.

grant usage on schema public to anon, authenticated, service_role;

grant select on table
  public.books,
  public.marketplace_snapshots,
  public.sales_comparables,
  public.valuations
to anon, authenticated;

grant insert, update, delete on table
  public.books,
  public.marketplace_snapshots,
  public.sales_comparables,
  public.valuations,
  public.research_events
to authenticated;

grant select, insert, update, delete on table
  public.books,
  public.marketplace_snapshots,
  public.sales_comparables,
  public.valuations,
  public.research_events
to service_role;

-- Research events remain admin-only through the existing RLS policies.
alter table public.books enable row level security;
alter table public.marketplace_snapshots enable row level security;
alter table public.sales_comparables enable row level security;
alter table public.valuations enable row level security;
alter table public.research_events enable row level security;

notify pgrst, 'reload schema';
