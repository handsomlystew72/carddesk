# CardDesk — Session Log (2026-11-06)

A readable record of what was built and decided in this chat. For the full current state, read `PROJECT-NOTES.md` first, then `index.html`.

## What was done, in order
1. **Grade tab rebuilt**: draggable border lines, card outline detection + straightening with draggable corners, photo-quality warnings, grader centering thresholds, back-of-card centering, save to My Desk.
   - Decision: show per-grader **centering ceilings** (PSA / BGS / CGC), not a made-up predicted grade.
2. **Backup set up**: GitHub repo `handsomlystew72/carddesk` (now public on purpose), pushed through GitHub Desktop (the Claude GitHub connector can't write, 403). Added `PROJECT-NOTES.md` so progress can be restored in a new chat.
3. **Desk redesign**: card picture, price, and possible-grade panel; tap picture to enlarge. Test cards were kept plain (no picture/grade panel) so people don't get confused.
4. **Desk sort** (newest, oldest, value high/low, name, best centering) remembered between visits.
5. **Calibration mode**: log the grade PSA/BGS/CGC really gave and compare to the centering ceiling. Never changes numbers on its own.
6. **Sports card pricing research**: best fit is the SportsCardsPro API (paid, terms/price unverified); eBay official APIs only give active listings.
7. **eBay sold links** (interim, no API) on every result and Desk card for all five categories, plus "PSA N sold" on graded Desk cards.
8. **Test path fix**: the five browser tests pointed at `source/index.html`; now `../../index.html`.
9. **One-button front & back** on the Grade tab: "Scan front & back" takes the front, then the back, then analyzes both. Falls back to uploads without a camera. New test: `source/test/both-sides-test.js`.
10. **Removed "Open Camera" from the Grade photo box**: "Scan front & back" (kept in its spot above the Front/Back switch) is now the only camera button there. Tapping the box still uploads a photo.
11. **2026-11-10, OPS-5 review**: product brief posted to Linear OPS-5; Miles recommended a small Pokémon pilot focused on centering, real-phone testing (20–30 cards, iPhone + Android), and export before testers build collections. Repo confirmed public on purpose.
12. **"Centering check" label**: grade results on the Grade tab and Desk now say "Centering check" with "Doesn't assess surface, corners, or edges" next to it.
13. **"+ Add card" on the Desk**: replaces "+ Test Card" for users; it opens the Scan tab's camera. The sample test-card button now only shows with `?test` in the address. New test: `source/test/add-card-test.js`.
14. **Find asks first**: tapping Find shows "Find it on eBay ↗" or "Add a card". New test: `source/test/find-choice-test.js`; `ebay-links-test.js` now taps Add a card after Find.
15. **Browse all cards by set** for Pokémon and Yu-Gi-Oh: set list with filter, then every card in the set in order with "+" to add. New test: `source/test/browse-sets-test.js`.
16. **Fixed invisible "+" on search results**: a general button padding rule squeezed the icon to 0 width; `.add-btn` now has `padding:0`.
17. **New look (step 1 of Richard's concept)**: red, white and blue light theme with foil accents, Barlow Condensed headings, new logo, cover tagline "Know your cards. Build your collection.", tabs renamed Scan / Check / Collection, "My Desk" wording changed to "collection". Step 2 (screen layouts: Check gauges, Collection grid with search/filters/export, Scan checklist) is next.
18. **Step 2 layouts from Richard's concept**: Scan heading, photo tips and Upload link; Check summary card (both pictures, gauges, centering-only note, Save / Retake); Collection grid with search, All/Checked/Unchecked, grid/list switch, Scan another card and CSV export. New test: `source/test/layout-step2-test.js`. The concept's "All cards / TCG / Sports" chips were not done (the five game tabs stay).
19. **Phone and computer layouts**: automatic by width (960px). Computer gets a left sidebar and two-column Scan and Check screens, a wider Collection grid. Fixed phone sideways-scroll from the Collection tabs and the search box. New test: `source/test/layout-responsive-test.js`.
20. **Saved to GitHub and hosted (2026-11-14)**: Claude wrote the files into the GitHub Desktop folder on Jordan's PC; Jordan committed and pushed ("Newwwww"). GitHub Pages turned on: https://handsomlystew72.github.io/carddesk/. The Pokémon TCG API was flaky on the live site (intermittent 500s), not a CardDesk bug.
21. **Camera view with a card guide** after Jordan's first phone test (hard to keep the card in the box): bigger camera box matching the camera's shape, card-shaped frame with dimmed surroundings and a tip.
22. **Check photo cropped to the card frame, and leftover buttons hidden (2026-11-14)**: the Check camera now saves only the part under the card frame (plus some space around it) and asks for a sharper 2560×1440 picture, so more of the photo's detail lands on the card. "Analyze / Re-analyze" and "Clear" only show for a single uploaded photo waiting to be measured; they're hidden during "Scan front & back" and once results show (Retake covers it). `both-sides-test.js` checks both.
23. **Sidebar stays put on the computer layout (2026-11-14)**: the sidebar now starts at the top next to the CardDesk header (`grid-template-areas: "nav head" "nav main"`), so it no longer slides up while scrolling or jumps when switching tabs. `layout-responsive-test.js` checks it.

## How to restore in a new chat
Attach `index.html` and `PROJECT-NOTES.md` (and this file), and say: "Continue building CardDesk from these files."

## Open items
- Test the Grade tab on real phone photos and tune thresholds.
- Log ~10+ real graded cards before trusting calibration.
- Confirm SportsCardsPro price/terms, add backend route, show value-at-grade.
- Host the site (and the pricing backend) and test on iPhone/Android.
- Edit a saved card; batch scanning.
