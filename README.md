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

## Free market research (October 2026)

The admin workspace now includes **Research the collection**, backed by the public PangoBooks research API. It needs no paid API key and is limited to 10 anonymous requests per minute. It is split into two resumable passes:

1. **Completed-sale research** requests exact-ISBN market comps, records returned recent sale comparables with dates/prices/conditions, and appends a dated valuation based on the reported median only when the API reports at least 3 historical sales. Confidence is scaled by sample size. Existing sale rows are deduplicated on book, date, price, marketplace, and condition.
2. **Current PangoBooks offers** requests active book listings by ISBN and stores the lowest offer plus the number of exact-ISBN offers returned on the first API page (up to 10). This count is the number observed in that API response, not necessarily total inventory. These records are tagged `pango_active_isbn_search`.

Both passes persist progress in browser local storage after each book. You can pause after the current request and resume in the same browser/profile. Run only one browser tab at once. A full 230-book pass takes roughly 30 minutes at the free rate limit; ISBNs with no exact data remain blank rather than being guessed.

PangoBooks is a separate marketplace source. Its offer prices and sales are **not** Amazon or eBay data. Those fields remain blank unless separately verified. Source: https://pangobooks.com/public-api and https://pangobooks.com/openapi.json.


## Valuation policy (October 2026)
- Collection totals, median, average, and per-book estimated value include only valuations supported by qualifying sold-comparable evidence.
- Current asking prices are displayed separately and never used alone to calculate a resale estimate.
- A valuation from the PangoBooks research workflow qualifies only when it is an exact-ISBN sold median/average and at least three historical sales are reported (or at least three individual sold-comparable records are stored).
- Older proxy, LibraryThing, asking-price, and undocumented estimates remain in valuation history but are excluded from market-value metrics and shown as excluded until supported by qualifying sold evidence.
- If no qualifying evidence exists, the catalog displays no dollar estimate rather than presenting a false precision.
- Admins can reset each browser-side scan and re-run the full catalog. Rescans preserve existing database history; sold-price lookups are paced to respect the free public API limit (about 30 minutes for 230 ISBNs per pass).
- Active offers are evidence for market context only; they do not create a sold-price valuation.
