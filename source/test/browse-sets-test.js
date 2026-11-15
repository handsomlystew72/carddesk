// Tests "Browse all cards by set" for Pokémon and Yu-Gi-Oh.
// Both card databases are faked with Playwright routes, so this runs offline.
const { chromium } = require('playwright');
const path = require('path');

const APP = 'file://' + path.resolve(__dirname, '../../index.html');
let fail = 0;
const check = (label, ok, extra) => { if(!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', label, extra || ''); };

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

// --- fake Pokémon TCG API ---
const pkSets = [
  { id: 'sv9', name: 'Journey Together', series: 'Scarlet & Violet', total: 190, releaseDate: '2025/03/28', images: { symbol: 'https://img.test/sv9.png' } },
  { id: 'base1', name: 'Base Set', series: 'Base', total: 102, releaseDate: '1999/01/09', images: { symbol: 'https://img.test/base1.png' } },
];
// 260 cards in Base Set, returned out of order and over two pages, to test paging and number sorting
const baseCards = Array.from({ length: 260 }, (_, i) => ({
  id: 'base1-' + (i + 1), name: i === 3 ? 'Charizard' : 'Card ' + (i + 1), number: String(i + 1), rarity: i === 3 ? 'Rare Holo' : 'Common',
  set: { id: 'base1', name: 'Base Set' }, images: { small: 'https://img.test/c' + (i + 1) + '.png' },
  tcgplayer: { prices: { holofoil: { market: i === 3 ? 312.5 : 1 } } },
})).reverse();

// --- fake YGOPRODeck ---
const ygoSets = [
  { set_name: 'Legend of Blue Eyes White Dragon', set_code: 'LOB', num_of_cards: 3, tcg_date: '2002-03-08' },
  { set_name: 'Empty "Quoted" Set', set_code: 'EQS', num_of_cards: 0, tcg_date: '2020-01-01' },
  { set_name: 'Metal Raiders', set_code: 'MRD', num_of_cards: 2, tcg_date: '2002-06-26' },
];
const ygoCard = (name, code, rarity, price) => ({
  name, type: 'Normal Monster', race: 'Dragon', attribute: 'LIGHT',
  card_sets: [{ set_name: 'Legend of Blue Eyes White Dragon', set_code: code, set_rarity: rarity, set_price: price }, { set_name: 'Other', set_code: 'X-1', set_rarity: 'Common', set_price: '0' }],
  card_images: [{ image_url_small: 'https://img.test/' + code + '.png' }],
  card_prices: [{ tcgplayer_price: '1.00', cardmarket_price: '0.50' }],
});
const lobCards = [ygoCard('Dark Magician', 'LOB-005', 'Ultra Rare', '48.00'), ygoCard('Blue-Eyes White Dragon', 'LOB-001', 'Ultra Rare', '120.00'), ygoCard('Mystical Elf', 'LOB-002', 'Common', '0')];

let pkCardRequests = [];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  await ctx.route('**/*', async (route) => {
    const url = route.request().url();
    if(url.startsWith('file:')) return route.continue();
    if(url.startsWith('https://img.test/')) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    const u = new URL(url);
    if(u.host === 'api.pokemontcg.io' && u.pathname === '/v2/sets'){
      return route.fulfill({ json: { data: pkSets, totalCount: pkSets.length } });
    }
    if(u.host === 'api.pokemontcg.io' && u.pathname === '/v2/cards'){
      pkCardRequests.push(u.search);
      const page = parseInt(u.searchParams.get('page') || '1', 10), size = parseInt(u.searchParams.get('pageSize'), 10);
      const q = u.searchParams.get('q');
      const pool = q === 'set.id:base1' ? baseCards : [];
      return route.fulfill({ json: { data: pool.slice((page - 1) * size, page * size), totalCount: pool.length } });
    }
    if(u.host === 'db.ygoprodeck.com' && u.pathname.endsWith('/cardsets.php')) return route.fulfill({ json: ygoSets });
    if(u.host === 'db.ygoprodeck.com' && u.pathname.endsWith('/cardinfo.php')){
      if(u.searchParams.get('cardset') === 'Legend of Blue Eyes White Dragon') return route.fulfill({ json: { data: lobCards } });
      return route.fulfill({ status: 400, json: { error: 'No card matching your query was found in the database.' } });
    }
    return route.fulfill({ status: 404, body: '' });
  });

  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(APP + '?test');
  await page.click('#enterBtn');
  await page.waitForTimeout(600);

  // ---- Pokémon ----
  check('Browse button shows on Pokémon', await page.isVisible('#browseSetsBtn'));
  await page.click('#browseSetsBtn');
  await page.waitForSelector('.set-row');
  check('set picker titled "Pick a set"', (await page.textContent('#resultsTitle')) === 'Pick a set');
  const firstSet = await page.textContent('.set-row .set-name');
  check('newest set listed first', firstSet === 'Journey Together', firstSet);
  check('set row shows series, year and count', /Base · 1999 · 102 cards/.test(await page.textContent('#setList')));
  await page.fill('#setFilter', 'base');
  check('filter narrows the sets', (await page.$$('.set-row')).length === 1);

  await page.click('.set-row');
  await page.waitForFunction(() => document.getElementById('resultsTitle').textContent === 'Base Set', null, { timeout: 15000 });
  const rows = await page.$$('#resultsList .card-result');
  check('all 260 cards across two pages are listed', rows.length === 260, String(rows.length));
  check('two pages were requested', pkCardRequests.length === 2, pkCardRequests.join(' | '));
  const firstNames = await page.$$eval('#resultsList .card-name', els => els.slice(0, 4).map(e => e.textContent));
  check('cards are in set-number order', firstNames.join(',') === 'Card 1,Card 2,Card 3,Charizard', firstNames.join(','));
  check('back button visible', await page.isVisible('#browseBackBtn'));
  check('the + icon on each card is visible (not squeezed to 0 width)', (await page.$eval('#resultsList .add-btn svg', e => e.getBoundingClientRect().width)) > 10);
  check('Charizard shows its set, number and price', /Base Set · #4 · Rare Holo/.test(await page.textContent('#resultsList')) && /\$312\.50/.test(await page.textContent('#resultsList')));

  // add Charizard, title and back button survive the re-render
  await page.click('#resultsList .add-btn[data-idx="3"]');
  await page.waitForTimeout(150);
  check('Charizard added to My Desk', await page.evaluate(() => state.collection.some(c => c.name === 'Charizard' && c.meta === 'Base Set · #4 · Rare Holo')));
  check('title kept after adding', (await page.textContent('#resultsTitle')) === 'Base Set');
  check('back button kept after adding', await page.isVisible('#browseBackBtn'));

  await page.click('#browseBackBtn');
  await page.waitForSelector('.set-row');
  check('back returns to the set list with the filter kept', (await page.inputValue('#setFilter')) === 'base');
  check('back button hidden on the set list', !(await page.isVisible('#browseBackBtn')));

  // ---- Yu-Gi-Oh ----
  await page.click('.tab[data-game="yugioh"]');
  check('switching game clears the browse', !(await page.isVisible('#results')));
  await page.click('#browseSetsBtn');
  await page.waitForSelector('.set-row');
  const ygoSetNames = await page.$$eval('.set-name', els => els.map(e => e.textContent));
  check('Yu-Gi-Oh sets: empty sets hidden, newest first', ygoSetNames.join('|') === 'Metal Raiders|Legend of Blue Eyes White Dragon', ygoSetNames.join('|'));
  await page.fill('#setFilter', 'LOB');
  check('filter by set code works', (await page.$$('.set-row')).length === 1);
  await page.click('.set-row');
  await page.waitForFunction(() => document.getElementById('resultsTitle').textContent === 'Legend of Blue Eyes White Dragon', null, { timeout: 15000 });
  const ygoNames = await page.$$eval('#resultsList .card-name', els => els.map(e => e.textContent));
  check('Yu-Gi-Oh cards sorted by set code', ygoNames.join(',') === 'Blue-Eyes White Dragon,Mystical Elf,Dark Magician', ygoNames.join(','));
  const txt = await page.textContent('#resultsList');
  check('uses the set printing price', /\$120\.00/.test(txt) && /LOB-001 · Ultra Rare/.test(txt), txt.slice(0, 120));
  check('falls back to card price when set price is 0', /Mystical Elf[\s\S]*\$1\.00/.test(txt));

  // a set with no cards
  await page.click('#browseBackBtn');
  await page.waitForSelector('.set-row');
  await page.fill('#setFilter', 'Metal');
  await page.click('.set-row');
  await page.waitForFunction(() => /No cards were found/.test(document.getElementById('resultsList').textContent), null, { timeout: 15000 });
  check('empty set explains and keeps the back button', await page.isVisible('#browseBackBtn'));

  // sports: no browse button
  await page.click('.tab[data-game="baseball"]');
  check('Browse hidden on sports tabs', !(await page.isVisible('#browseSetsBtn')));

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})();
