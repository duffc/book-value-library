-- LibraryThing Book Value site backend (Supabase/PostgreSQL)
-- Run in Supabase SQL Editor. Tables are normalized to preserve price history.
create extension if not exists pgcrypto;
create table if not exists public.books (
 id uuid primary key default gen_random_uuid(),
 catalog_key text not null unique,
 title text not null,
 author text,
 publication_edition text,
 publication_year integer,
 format text,
 pages integer,
 isbn13 text,
 isbn10 text,
 all_isbns text,
 librarything_value text,
 librarything_list_price text,
 librarything_purchase_price text,
 condition_note text,
 amazon_search_url text,
 ebay_active_search_url text,
 ebay_sold_search_url text,
 source_lookup_status text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists books_title_idx on public.books using gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(author,'')));
create index if not exists books_isbn13_idx on public.books(isbn13);
create index if not exists books_format_idx on public.books(format);
create table if not exists public.marketplace_snapshots (
 id uuid primary key default gen_random_uuid(),
 book_id uuid not null references public.books(id) on delete cascade,
 marketplace text not null check (marketplace in ('amazon','ebay','other')),
 observed_at timestamptz not null default now(),
 lowest_used_price numeric(10,2) check (lowest_used_price is null or lowest_used_price >= 0),
 active_listing_count integer check (active_listing_count is null or active_listing_count >= 0),
 currency char(3) not null default 'USD',
 search_url text,
 status text not null default 'not_checked',
 edition_match text,
 notes text,
 created_at timestamptz not null default now()
);
create index if not exists snapshots_book_market_time_idx on public.marketplace_snapshots(book_id, marketplace, observed_at desc);
create index if not exists snapshots_market_price_idx on public.marketplace_snapshots(marketplace, lowest_used_price);
create table if not exists public.sales_comparables (
 id uuid primary key default gen_random_uuid(),
 book_id uuid not null references public.books(id) on delete cascade,
 marketplace text not null check (marketplace in ('amazon','ebay','other')),
 sold_date date,
 sold_price numeric(10,2) check (sold_price is null or sold_price >= 0),
 currency char(3) not null default 'USD',
 listing_url text,
 edition_match text,
 condition text,
 shipping_price numeric(10,2) check (shipping_price is null or shipping_price >= 0),
 confidence text not null default 'unverified' check (confidence in ('unverified','low','medium','high')),
 notes text,
 recorded_at timestamptz not null default now()
);
create index if not exists sales_book_date_idx on public.sales_comparables(book_id, sold_date desc);
create index if not exists sales_price_idx on public.sales_comparables(sold_price);
create table if not exists public.valuations (
 id uuid primary key default gen_random_uuid(),
 book_id uuid not null references public.books(id) on delete cascade,
 estimated_value numeric(10,2) check (estimated_value is null or estimated_value >= 0),
 method text,
 confidence text not null default 'unverified' check (confidence in ('unverified','low','medium','high')),
 as_of_date date,
 notes text,
 created_at timestamptz not null default now()
);
create index if not exists valuations_book_date_idx on public.valuations(book_id, as_of_date desc);
create table if not exists public.research_events (
 id uuid primary key default gen_random_uuid(),
 book_id uuid not null references public.books(id) on delete cascade,
 event_type text not null,
 status text not null default 'open' check (status in ('open','in_progress','complete','blocked')),
 details text,
 created_at timestamptz not null default now(),
 completed_at timestamptz
);
-- Public site can read catalog and verified market data; anonymous writes are disabled.
alter table public.books enable row level security;
alter table public.marketplace_snapshots enable row level security;
alter table public.sales_comparables enable row level security;
alter table public.valuations enable row level security;
alter table public.research_events enable row level security;
drop policy if exists "Public can read books" on public.books;
create policy "Public can read books" on public.books for select to anon, authenticated using (true);
drop policy if exists "Public can read marketplace snapshots" on public.marketplace_snapshots;
create policy "Public can read marketplace snapshots" on public.marketplace_snapshots for select to anon, authenticated using (true);
drop policy if exists "Public can read sales comparables" on public.sales_comparables;
create policy "Public can read sales comparables" on public.sales_comparables for select to anon, authenticated using (true);
drop policy if exists "Public can read valuations" on public.valuations;
create policy "Public can read valuations" on public.valuations for select to anon, authenticated using (true);
-- Public browsing is read-only. Writes are restricted to authenticated users whose app_metadata.role is 'admin'.
revoke insert, update, delete on public.books, public.marketplace_snapshots, public.sales_comparables, public.valuations, public.research_events from anon, authenticated;
grant select on public.books, public.marketplace_snapshots, public.sales_comparables, public.valuations to anon, authenticated;
grant insert, update, delete on public.books, public.marketplace_snapshots, public.sales_comparables, public.valuations, public.research_events to authenticated;
drop policy if exists "Admin can write marketplace snapshots" on public.marketplace_snapshots;
create policy "Admin can write marketplace snapshots" on public.marketplace_snapshots for all to authenticated
 using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
 with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "Admin can write sales comparables" on public.sales_comparables;
create policy "Admin can write sales comparables" on public.sales_comparables for all to authenticated
 using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
 with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "Admin can write valuations" on public.valuations;
create policy "Admin can write valuations" on public.valuations for all to authenticated
 using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
 with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "Admin can write research events" on public.research_events;
create policy "Admin can write research events" on public.research_events for all to authenticated
 using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
 with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "Admin can update books" on public.books;
create policy "Admin can update books" on public.books for update to authenticated
 using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
 with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');