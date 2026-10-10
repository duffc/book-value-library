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


## Recent-sale valuation correction (October 2026)

The pricing workflow must not treat PangoBooks' lifetime sales count or all-history aggregate median as if it were a recent transaction sample. New valuations use the median of individually returned, dated PangoBooks sale records within the last 365 days, and require at least three such records. The note on each valuation records the sample size, median, average, range, source URL, and date checked. Three to nine recent sales produce low confidence; ten or more produce medium confidence. This is still a single-market estimate and is not represented as cross-market verified.

The scan progress keys were versioned so the revised pricing pass starts with a clean browser-side progress state. A full pass takes about 30 minutes at the free rate limit. Existing historical valuations are retained, but only new valuations using the recent-sample method qualify for the current dashboard totals. A book without three dated recent sales remains unvalued rather than receiving an estimate from a lifetime aggregate.

## Stricter valuation and cross-market checks (October 2026)
- PangoBooks-derived catalog valuations require an exact-ISBN median and at least 10 reported historical sales. The research workflow still stores individual recent sales when fewer than 10 historical sales are reported, but does not publish a valuation from that small sample.
- Existing PangoBooks estimates with fewer than 10 reported historical sales are excluded from dashboard market-value totals even though their history is preserved.
- The catalog can show recorded eBay sold-comparable evidence separately. An eBay median is shown only after at least three recorded eBay sale prices for that book; a gap greater than 50% from a qualifying PangoBooks median is flagged for human review.
- eBay's generally available Browse API is for active listings, not arbitrary completed sales; sold-history API access is restricted. Therefore the site does not pretend that an active asking price is a verified sale. eBay sold comps need verified manual entry or an approved sold-data provider.


## Design refresh (October 2026)
The collection uses an editorial, cover-first visual system with responsive book cards, persistent light/dark mode (system preference by default), a sticky catalog toolbar on desktop, and a dedicated `auth.html` sign-in route. Cover lookup tries Open Library by ISBN, then Google Books by ISBN and title/author; when no official cover is found, the card retains a designed typographic fallback. The private research workspace stays behind Supabase authentication and Row Level Security.
