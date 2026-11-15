// Tests the choice shown after tapping Find on the Scan tab:
// "Find it on eBay" (opens an eBay search) or "Add a card" (searches the card database).
const { chromium } = require('playwright');
const path = require('path');

const APP = 'file://' + path.resolve(__dirname, '../../index.html');
let fail = 0;
const check = (label, ok, extra) => { if(!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', label, extra || ''); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(APP);
  await page.click('#enterBtn');
  await page.waitForTimeout(600);

  // empty search: no choice
  await page.click('#searchBtn');
  check('Find with empty text shows no choice', !(await page.isVisible('#findChoice')));

  // baseball: choice appears, nothing searched yet
  await page.click('.tab[data-game="baseball"]');
  await page.fill('#queryInput', 'Mickey Mantle');
  await page.click('#searchBtn');
  check('Find shows the choice', await page.isVisible('#findChoice'));
  check('choice names the search text (sports: no set field)', (await page.textContent('#findChoiceText')) === '"Mickey Mantle"');
  check('no database search yet', !(await page.isVisible('#results')));
  const href = await page.getAttribute('#findEbayLink', 'href');
  check('eBay link searches the card text', href === 'https://www.ebay.com/sch/i.html?_nkw=' + encodeURIComponent('Mickey Mantle'), href);
  check('eBay link opens in a new tab', (await page.getAttribute('#findEbayLink', 'target')) === '_blank');

  // eBay: opens a new tab and closes the choice
  const [popup] = await Promise.all([
    ctx.waitForEvent('page', { timeout: 5000 }).catch(() => null),
    page.click('#findEbayLink'),
  ]);
  check('Find it on eBay opens a new tab', !!popup, popup ? popup.url() : '');
  if(popup) await popup.close();
  check('choice closes after eBay', !(await page.isVisible('#findChoice')));

  // Add a card: runs the normal search with + buttons
  await page.click('#searchBtn');
  await page.click('#findAddBtn');
  await page.waitForFunction(() => document.getElementById('results').style.display === 'block' && !/Searching/.test(document.getElementById('resultsTitle').textContent), null, { timeout: 15000 });
  check('Add a card runs the search', /Mantle/.test(await page.textContent('#resultsList')));
  check('results have add buttons', (await page.$$('#resultsList .add-btn, #resultsList [data-add], #resultsList button')).length > 0);
  check('choice closes after Add a card', !(await page.isVisible('#findChoice')));

  // Pokémon tag + Cancel + typing hides it
  await page.click('.tab[data-game="pokemon"]');
  await page.fill('#queryInput', 'Charizard');
  await page.fill('#refineInput', 'Base Set');
  await page.click('#searchBtn');
  const pk = await page.getAttribute('#findEbayLink', 'href');
  check('Pokémon eBay search adds "Pokemon" and the set', pk.endsWith(encodeURIComponent('Charizard Pokemon Base Set')), pk);
  await page.click('#findChoiceCancel');
  check('Cancel hides the choice', !(await page.isVisible('#findChoice')));
  await page.click('#searchBtn');
  await page.type('#queryInput', 'x');
  check('typing hides the choice', !(await page.isVisible('#findChoice')));

  // Enter key behaves like Find
  await page.press('#queryInput', 'Enter');
  check('Enter shows the choice', await page.isVisible('#findChoice'));

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})();
