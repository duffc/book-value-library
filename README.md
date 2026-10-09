# Book Value Library

Responsive Cloudflare Pages catalog backed by Supabase/PostgreSQL.

## Current website files
- `index.html`: catalog and admin UI
- `assets/styles.css`: responsive layout
- `assets/app.js`: catalog search, sorting, Supabase queries, admin research saves
- `config.js`: Supabase project URL and publishable key (safe for browser only when RLS is correctly configured)
- `supabase_schema.sql`: database tables, indexes, RLS policies
- `supabase_seed.sql`: idempotent seed for 230 LibraryThing catalog records
- `_headers`, `_redirects`: Cloudflare Pages support

## Supabase setup
1. In the Supabase SQL Editor, run `supabase_schema.sql`.
2. Then run `supabase_seed.sql`.
3. Confirm the Books table has 230 records and public SELECT works.
4. Create an admin user in Authentication. Assign `app_metadata.role = admin` using a trusted administrative method; never put service-role/secret keys in browser code.
5. Test admin sign-in and saving a snapshot. RLS must remain enabled.

## Cloudflare Pages
Connect this repository to Cloudflare Pages via GitHub. Framework preset: None; build command: `exit 0`; output directory: `.`. Every push to `main` triggers a deployment.

## Research-data integrity
Marketplace prices and listing counts are time-stamped snapshots. Completed sales are stored separately from asking prices. Valuations are separate records. Missing data is unknown, not zero. Confirm edition/ISBN and condition before treating a comparable sale as evidence of value.

## Limitations
The current frontend has basic admin sign-in and research-entry forms. It does not automatically scrape marketplaces; price data must be entered from verified sources. Do not assume a blank count means no listings.
