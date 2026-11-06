# CardDesk — Session Log (2026-11-06)

A readable record of what was built and decided in this chat. For the full current state, read `PROJECT-NOTES.md` first, then `index.html`.

## What was done, in order
1. **Grade tab rebuilt**: draggable border lines, card outline detection + straightening with draggable corners, photo-quality warnings, grader centering thresholds, back-of-card centering, save to My Desk.
   - Decision: show per-grader **centering ceilings** (PSA / BGS / CGC), not a made-up predicted grade.
2. **Backup set up**: GitHub repo `handsomlystew72/carddesk` (private), pushed through GitHub Desktop (the Claude GitHub connector can't write, 403). Added `PROJECT-NOTES.md` so progress can be restored in a new chat.
3. **Desk redesign**: card picture, price, and possible-grade panel; tap picture to enlarge. Test cards were kept plain (no picture/grade panel) so people don't get confused.
4. **Desk sort** (newest, oldest, value high/low, name, best centering) remembered between visits.
5. **Calibration mode**: log the grade PSA/BGS/CGC really gave and compare to the centering ceiling. Never changes numbers on its own.
6. **Sports card pricing research**: best fit is the SportsCardsPro API (paid, terms/price unverified); eBay official APIs only give active listings.
7. **eBay sold links** (interim, no API) on every result and Desk card for all five categories, plus "PSA N sold" on graded Desk cards.

## How to restore in a new chat
Attach `index.html` and `PROJECT-NOTES.md` (and this file), and say: "Continue building CardDesk from these files."

## Open items
- Test the Grade tab on real phone photos and tune thresholds.
- Log ~10+ real graded cards before trusting calibration.
- Confirm SportsCardsPro price/terms, add backend route, show value-at-grade.
- Host the site (and the pricing backend) and test on iPhone/Android.
- Edit a saved card; batch scanning.
