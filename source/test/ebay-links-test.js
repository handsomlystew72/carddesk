const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '../index.html')); await page.click('#enterBtn');
  let fail = 0; const check = (label, ok, extra) => { if(!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', label, extra || ''); };

  // sports search
  await page.click('.tab[data-game="baseball"]');
  await page.fill('#queryInput', 'Mantle'); await page.click('#searchBtn');
  await page.waitForSelector('.card-result', { timeout: 15000 });
  const href = await page.getAttribute('.card-result .sold-link', 'href');
  const u = new URL(href);
  console.log('URL:', decodeURIComponent(href));
  check('result has eBay sold link', u.hostname === 'www.ebay.com' && u.pathname === '/sch/i.html');
  check('query has player + year/set + number', /Mickey Mantle 1952 Topps #311/.test(u.searchParams.get('_nkw')), u.searchParams.get('_nkw'));
  check('sold + completed filters set', u.searchParams.get('LH_Sold') === '1' && u.searchParams.get('LH_Complete') === '1');
  check('demo wording stripped from query', !/icon|sample|demo/i.test(u.searchParams.get('_nkw')));
  check('opens in new tab safely', (await page.getAttribute('.card-result .sold-link', 'target')) === '_blank' && /noopener/.test(await page.getAttribute('.card-result .sold-link', 'rel')));
  check('source note says demo + points to sold link', /Demo estimates/.test(await page.textContent('#sourceNote')) && /Sold on eBay/.test(await page.textContent('#sourceNote')));
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'shot-ebay-results.png', clip: { x: 0, y: 640, width: 430, height: 200 } });

  // non-sports result: no link
  await page.evaluate(() => { state.game = 'pokemon'; renderResults([{ name: 'Charizard', meta: 'Base Set', price: '300.00', source: 'TCGPLAYER', demo: false }], 1, false); });
  const q = (h) => new URL(h).searchParams.get('_nkw');
  const pokeHref = await page.getAttribute('.card-result .sold-link', 'href');
  check('Pokémon result links: name + Pokemon + set', q(pokeHref) === 'Charizard Pokemon Base Set', q(pokeHref));
  await page.evaluate(() => { state.game = 'yugioh'; renderResults([{ name: 'Dark Magician', meta: 'Normal Monster · Spellcaster · DARK', price: '48.00', source: 'TCGPLAYER', demo: false }], 1, false); });
  const ygoHref = await page.getAttribute('.card-result .sold-link', 'href');
  check('Yu-Gi-Oh result links: name + Yu-Gi-Oh only (no type text)', q(ygoHref) === 'Dark Magician Yu-Gi-Oh', q(ygoHref));

  // desk
  await page.evaluate(() => {
    const now = Date.now();
    state.collection = [
      { id: 'a', game: 'baseball', name: 'Mickey Mantle (Test)', meta: '1952 Topps · #311 · Sample entry', price: '38,000 – 5.2M', demo: true, addedAt: now, grading: { savedAt: 1, front: { lr: [52, 48], tb: [55, 45], worst: 55 }, back: null, frontOnly: true, ceilings: { psa: '10', bgs: '9.5', cgc: '10' } } },
      { id: 'b', game: 'basketball', name: 'Jordan', meta: '1986 Fleer', price: '9,000', demo: true, addedAt: now - 1 },
      { id: 'c', game: 'pokemon', name: 'Charizard', meta: 'Base Set', price: '312.50', source: 'TCGPLAYER', demo: false, addedAt: now - 2, grading: { savedAt: 1, front: { lr: [50, 50], tb: [50, 50], worst: 50 }, back: null, frontOnly: true, ceilings: { psa: '10', bgs: '10', cgc: '10' } } },
    ]; saveCollection(); updateCollectionBadge();
  });
  await page.click('#navCollectionBtn'); await page.waitForTimeout(200);
  const counts = await page.$$eval('.collection-item', els => els.map(e => ({ name: e.querySelector('.card-name').textContent, links: [...e.querySelectorAll('.sold-link')].map(a => a.textContent.trim()) })));
  console.log(JSON.stringify(counts));
  check('graded sports card: 2 links incl. PSA 10', JSON.stringify(counts[0].links) === JSON.stringify(['Sold on eBay ↗', 'PSA 10 sold ↗']));
  check('ungraded sports card: 1 link', counts[1].links.length === 1);
  check('graded Pokémon desk card: 2 links', JSON.stringify(counts[2].links) === JSON.stringify(['Sold on eBay ↗', 'PSA 10 sold ↗']));
  const psaHref = await page.getAttribute('.collection-item:has-text("Mantle") .sold-link >> nth=1', 'href');
  check('PSA link query includes grade', /PSA 10/.test(decodeURIComponent(psaHref)), decodeURIComponent(psaHref));
  await page.screenshot({ path: 'shot-ebay-desk.png' });
  console.log(fail ? fail + ' FAILED' : 'ALL PASSED', '| errors:', errors.length ? errors : 'none');
  await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e.message); process.exit(1); });
