const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const url = 'file://' + path.resolve(__dirname, '../index.html');
  await page.goto(url); await page.click('#enterBtn');
  const G = (lr, tb, blr, btb, ce) => { const w = (a, b) => Math.max(a, 100 - a, b, 100 - b); return { savedAt: 1, front: { lr: [lr, 100 - lr], tb: [tb, 100 - tb], worst: w(lr, tb) }, back: blr == null ? null : { lr: [blr, 100 - blr], tb: [btb, 100 - btb], worst: w(blr, btb) }, ceilings: ce, frontOnly: blr == null }; };
  await page.evaluate((gs) => {
    const now = Date.now();
    state.collection = [
      { id: 'a', game: 'pokemon', name: 'Charizard', meta: '', img: null, price: '312.50', source: 'TCGPLAYER', demo: false, addedAt: now - 3000, grading: gs.a },
      { id: 'b', game: 'baseball', name: 'Mantle', meta: '', img: null, price: '38,000 – 5.2M', source: null, demo: true, addedAt: now - 2000, grading: gs.b },
      { id: 'c', game: 'yugioh', name: 'Blue-Eyes', meta: '', img: null, price: '1,048.00', source: 'CARDMARKET', demo: false, addedAt: now - 1000 },
      { id: 'd', game: 'pokemon', name: 'Abra', meta: '', img: null, price: null, source: null, demo: false, addedAt: now },
    ];
    saveCollection(); updateCollectionBadge();
  }, { a: G(52, 55, 60, 50, { psa: '10', bgs: '9.5', cgc: '10' }), b: G(62, 58, null, null, { psa: '7', bgs: '8', cgc: '8' }) });
  await page.click('#navCollectionBtn'); await page.waitForTimeout(150);
  const order = () => page.$$eval('.collection-item .card-name', e => e.map(x => x.textContent).join(' > '));
  const results = {};
  for(const mode of ['newest', 'oldest', 'value-high', 'value-low', 'name', 'centering']){
    await page.selectOption('#deskSort', mode); results[mode] = await order();
  }
  console.log(results);
  const want = { newest: 'Abra > Blue-Eyes > Mantle > Charizard', oldest: 'Charizard > Mantle > Blue-Eyes > Abra',
    'value-high': 'Mantle > Blue-Eyes > Charizard > Abra', 'value-low': 'Charizard > Blue-Eyes > Mantle > Abra',
    name: 'Abra > Blue-Eyes > Charizard > Mantle', centering: 'Charizard > Mantle > Abra > Blue-Eyes' };
  let ok = true; for(const k in want){ if(results[k] !== want[k]){ ok = false; console.log('SORT FAIL', k, '\n  got ', results[k], '\n  want', want[k]); } }
  console.log('sort orders:', ok ? 'PASS' : 'FAIL');
  console.log('summary:', await page.textContent('#collectionSummary'));

  // persistence
  await page.selectOption('#deskSort', 'value-high'); await page.reload(); await page.click('#enterBtn'); await page.click('#navCollectionBtn');
  console.log('sort after reload:', await page.inputValue('#deskSort'), '|', await order());

  // category filter + sort together
  await page.click('#collectionFilterTabs .tab[data-filter="pokemon"]'); console.log('pokemon only, value-high:', await order());
  await page.click('#collectionFilterTabs .tab[data-filter="all"]');

  // calibration: empty state
  await page.click('#calibrateBtn'); console.log('empty cal panel:', (await page.textContent('#calibrationPanel')).replace(/\s+/g, ' ').slice(0, 90));

  // log real grades: Charizard PSA 9 (ceiling 10 -> below), BGS 9.5 (at), CGC 10 Pristine (above ceiling 10);  Mantle PSA 8 (ceiling 7 -> above)
  const log = async (id, grader, grade) => {
    await page.click(`.log-open[data-id="${id}"]`);
    await page.selectOption(`.collection-item select[data-role="lg-grader"]`, grader);
    await page.selectOption(`.collection-item select[data-role="lg-grade"]`, grade);
    await page.click(`.log-save[data-id="${id}"]`);
  };
  await log('a', 'psa', '9'); await log('a', 'bgs', '9.5'); await log('a', 'cgc', '10 Pristine'); await log('b', 'psa', '8');
  const pills = await page.$$eval('.log-pill', e => e.map(x => x.textContent.replace('×', '').trim()));
  console.log('pills:', pills);
  console.log('calibration panel:', (await page.textContent('#calibrationPanel')).replace(/\s+/g, ' '));
  await page.screenshot({ path: 'shot-calibration.png' });
  // remove a logged grade
  await page.click('.log-pill button >> nth=0');
  console.log('pills after remove:', await page.$$eval('.log-pill', e => e.length));
  // BGS help text + non-graded card has no log button
  await page.click('.log-open[data-id="a"]'); await page.selectOption('.collection-item select[data-role="lg-grader"]', 'bgs');
  console.log('BGS help shown:', await page.isVisible('.log-help'), '| log button on ungraded card:', await page.locator('.collection-item:has-text("Blue-Eyes") .log-open').count());
  await page.click('.log-cancel');
  await page.selectOption('#deskSort', 'newest'); await page.screenshot({ path: 'shot-sort.png' });
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('CRASH', e.message); process.exit(1); });
