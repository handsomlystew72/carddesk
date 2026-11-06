# CardDesk — Project Notes

Last updated: 2026-11-06 (Desk sort, calibration, sports pricing research, eBay sold links). Read this first, then `index.html`.

## What it is
A mobile-first trading-card scanner web app: identify a card, show pricing, check condition/centering, and save cards to "My Desk." Categories: Pokémon, Yu-Gi-Oh, baseball, basketball, football.

Single-file vanilla HTML/CSS/JS (`index.html`). No build step. Fonts: Oswald, Inter, IBM Plex Mono (Google Fonts). OCR: Tesseract.js from a CDN.

## What's built
- **Cover page** with "Enter" button, then the main app.
- **Scan tab:** photo upload or live camera (front/back switch, permission-aware error messages), rotate control, OCR-based identification, manual search, set/number refinement to avoid reprint mix-ups, "+" button to add a result to My Desk.
- **Grade tab (rebuilt 2026-11-06):**
  - Front/Back toggle, each with its own photo.
  - Photo-quality checks: sharpness, glare, resolution, tilt, card size, outline confidence, inner-border detection.
  - Auto card outline detection, perspective straightening, draggable corner handles with a magnifier, "Use whole photo" and "Re-detect" buttons.
  - Draggable inner-border lines with live centering; orange lines = low confidence.
  - Per-grader **centering ceilings** for PSA, BGS and CGC (not predicted grades).
  - Heuristic corner/edge wear check and close-up crops.
  - Save result to My Desk (new entry or attach to an existing card), with thumbnail and chips.
- **My Desk tab:** saved cards in localStorage (`carddesk_collection_v1`), category filter tabs, combined value estimate. Each card shows a large picture (tap to enlarge), the price, and a "Possible grade" panel (PSA / BGS / CGC centering ceilings plus front/back centering numbers). Cards with no grade check show a "Check condition" button that jumps to the Grade tab. Inline "Are you sure?" delete, "+ Test Card" button for testing. (The grade panel is a centering ceiling, not a predicted grade. No graded-price lookup exists, so the Desk can't show value-at-grade.) **Sort** dropdown (newest, oldest, value high/low, name A–Z, best centering first) that is remembered between visits and works with the category tabs; value sorting uses the first number in the price (the low end of a demo range). The combined total counts live prices only (demo ranges are excluded and the summary says so). **Calibration mode:** on any graded card, "+ Log real grade" records what PSA/BGS/CGC actually gave; the Calibration panel on the Desk compares those to the centering ceilings (at / below / between tiers / above, with centering points over the limit), and never changes any numbers by itself. For BGS, log the centering sub-grade, not the overall.
- **Bottom nav:** Scan / Grade / Desk with a count badge.

## Data sources
- **Pokémon:** Pokémon TCG API (api.pokemontcg.io), live, TCGplayer/Cardmarket prices.
- **Yu-Gi-Oh:** YGOPRODeck, live.
- **Baseball / basketball / football:** a small labeled demo dataset (`localDecks`) unless `PRICING_BACKEND_URL` is set in `index.html`.

## Pricing backend (`server/`)
Node/Express service with TCGplayer and eBay Browse API clients, caching and rate limiting.
- **Not yet tested against live APIs** (the build sandbox blocked those hosts).
- **TCGplayer:** not issuing new API keys, so this is a dead end for now.
- **eBay:** applied for keys, no reply; Jordan doesn't expect one. eBay results would be active listing asking prices only, not sold prices.
- **TAG:** skipped for now.
- See "Sports card pricing — research" below for the current recommendation.
- Keys go in `server/.env` (never commit it; `.gitignore` already excludes it). `.env.example` is a template.
- To connect the front end, host the backend and set `PRICING_BACKEND_URL` in `index.html`.

## Sports card pricing — research (2026-11-06)
Goal: prices for baseball / basketball / football cards. Currently those tabs show a labeled demo dataset.

**Dead ends**
- TCGplayer: not issuing new API keys.
- eBay official API: the Browse API returns **active listings only** (asking prices, not sold). Sold data lives in the Marketplace Insights API (about 90 days), a limited release that eBay approves case by case with no open application. The old Finding API (completed items) was shut down on 2025-02-05. Production access to many Buy APIs is for eBay partners and goes through the eBay Partner Network (reply expected within ~10 business days, approval not guaranteed). The existing `server/` eBay client therefore only gives asking prices, and even that is unconfirmed for a new key.

**Best fit: SportsCardsPro API** (same API as PriceCharting; docs at sportscardspro.com/api-documentation)
- Paid: "API's are a premium tool." Plan names and prices were not on the pages I could read, so check the subscription page before committing. CSV download is limited to the top plan.
- Token-based (`t` parameter, 40 characters, must be kept private) so it has to be called from the backend, never from `index.html`.
- `/api/product` (by `id` or text query `q`, best match) and `/api/products` (up to 20 matches).
- Prices come back in pennies. Fields: `loose-price` (ungraded), `cib-price` (grade 7/7.5), `new-price` (8/8.5), `graded-price` (9), `box-only-price` (9.5), `manual-only-price` (PSA 10), `bgs-10-price`, `condition-17-price` (CGC 10), `condition-18-price` (SGC 10), `sales-volume` (units sold per year).
- No image field is documented, no rate limit is documented, and nothing is said about displaying the data in an app. Ask them about terms before publishing the site.
- Why it fits: graded prices per grade would let the Desk show **value at the possible grade**, not just a centering ceiling.

**Free, manual (no documented API)**
- 130point: free; aggregates eBay sold listings (filter by grade, year, sport).
- Card Ladder: free tier, premium about $9.99/month; indices and charts.
- Scraping these sites or using paid third-party scrapers is a terms-of-service and reliability risk; not recommended.
- Card Hedge: could not verify access or pricing.

**Suggested plan**
1. Check SportsCardsPro subscription price and API terms; subscribe if acceptable.
2. Add a `sportscardspro` route to `server/` and call it from the sports tabs (needs the token and a hosted backend).
3. Use graded prices to show value-at-grade on Desk cards.
4. **Done (interim, no API):** "Sold on eBay ↗" button on every result and every Desk card (all five categories) opens eBay's sold + completed listings, newest first. Search text: sports = player + year/set + number; Pokémon = name + "Pokemon" + set/number/rarity; Yu-Gi-Oh = name + "Yu-Gi-Oh" only (its details are card-type text, too noisy to search on). Graded Desk cards also get a "PSA N sold ↗" link at the best PSA grade the centering allows. No eBay category filter is set (`EBAY_CATEGORY_IDS` is still null). The sports tabs still show demo estimate ranges, labeled as such.
5. Keep eBay as an optional second source for active listings if keys ever arrive.

## Grading: how it works and its limits
- **Centering is a real measurement:** the card is found, straightened, and the inner border lines give left/right and top/bottom splits. On synthetic test photos error was at most about 1.7 points (usually under 1). Expect about ±2 on a clean, sharp real photo.
- **Grader ceilings** use the highest grade whose centering limit the measurement fits. There is a 2-point "borderline" tolerance for measurement error.
- **Thresholds (max % on the larger side), front / back:**
  - PSA: 10 = 55/75, 9 = 60/90, 8 = 65/90, 7 = 70/90, 6 = 80/90, 5 and 4 = 85/90, 3 and 2 = 90/90. PSA reportedly tightened its 10 to 55/45 in 2025.
  - BGS (centering sub-grade): 10 = 55/55, 9.5 = 55/60, 9 = 60/65, 8.5 = 65/70, 8 = 70/80, 7.5 = 75/85, 7 = 80/90. BGS does not officially publish these; commonly cited figures. Pristine 10 needs a true 50/50.
  - CGC: Pristine 10 = 50/55, 10 = 55/75, 9 = 60/90, 8 = 70/90, 7 = 75/90, 6 = 85/90. Lower tiers approximate.
  - Sources disagree in places. Re-check each company's current published standards before relying on these. They live in `GRADERS` in `source/parts/algo.js`.
- **Deliberately not done:** a single predicted grade. Corners, edges and surface can't be judged reliably from one phone photo, and they can only lower a grade from the centering ceiling.
- **Known weak spots:**
  - If the card fills the whole photo, or the table matches the card's border color, the outline can land on the artwork. The app warns and offers "Use whole photo."
  - Corner/edge wear check is a rough brightness heuristic and is inconclusive on light or white-bordered cards.
  - Sharpness cutoffs (0.22 warn, 0.12 bad) were set on synthetic photos and may need tuning on real ones.
  - Never tested on a real phone camera yet.

## Repo layout
- `index.html` — the full app (this is what to open and what to attach to a new chat).
- `source/parts/` — Grade-tab pieces that were spliced into `index.html`: `algo.js` (detection, warp, centering, grader ceilings, quality checks), `grade.css`, `grade.html`, `grade-ui.js`.
- `source/test/` — `algo-test.js` (Node, synthetic photos with known centering), `ui-test.js` (Playwright test of the Grade flow) and `desk-test.js` (Desk cards and enlarge view), `testcards-test.js` (plain test cards), `sort-cal-test.js` (sorting and calibration flow) and `calibration-test.js` (Node unit tests for calibration math) and `ebay-links-test.js` (sold-link URLs).
- `server/` — pricing backend.

Note: the Grade code in `index.html` is the source of truth. `source/parts/` is a copy of the pieces; if you edit `index.html` directly, the parts can drift.

## Workflow conventions
- After any change to `index.html`: extract the `<script>` to a file and run `node --check`, check `<div>` open/close counts balance, confirm element IDs referenced in JS exist, then test.
- Algorithm tests: `node source/test/algo-test.js` (reads `source/parts/algo.js`).

## Backup routine
1. Updated files get copied into `Documents\GitHub\carddesk` (inside OneDrive on Jordan's PC).
2. In GitHub Desktop: type a summary, Commit, Push origin.
3. Repo: github.com/handsomlystew72/carddesk (private). A one-time copy also exists in `Documents\CardDesk`.
4. The Claude GitHub connector could not write to the repo (403), so pushing goes through GitHub Desktop.

## Open items / ideas
- Test the Grade tab on real phone photos and tune thresholds.
- Calibration mode is built; the real work now is logging graded cards (about 10+) before reading anything into it.
- Edit a saved card; batch scanning.
- Host the site (GitHub Pages is the simplest option) and, separately, host the pricing backend.
- Get a working pricing source for sports cards (eBay keys, or another provider).
- Real-device camera testing on iPhone and Android.
