# CardDesk

Trading-card scanner prototype (Pokémon, Yu-Gi-Oh, baseball, basketball, football).

- `index.html` — the whole app. Open it in a browser.
- `source/parts/` — Grade-tab pieces: `algo.js` (outline detection, straightening, centering, PSA/BGS/CGC ceilings), `grade.css`, `grade.html`, `grade-ui.js`.
- `source/test/` — Node test for the algorithms and a Playwright browser test.
- `server/` — pricing backend (Node/Express) for TCGplayer and eBay. Not yet tested against the live APIs.

Grader numbers are centering ceilings, not predicted grades. BGS tolerances are unofficial.
