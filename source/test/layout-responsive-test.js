// Tests the phone and computer layouts (2026-11-13).
// Phone (< 960px): bottom tab bar, one column. Computer (>= 960px): sidebar, two-column Scan and Check.
// Also checks that no screen scrolls sideways at common widths.
const { chromium } = require('playwright');
const path = require('path');

const APP = 'file://' + path.resolve(__dirname, '../../index.html');
let fail = 0;
const check = (label, ok, extra) => { if(!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', label, extra || ''); };

async function open(browser, width, height){
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.fulfill({ status: 404, body: '' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(APP + '?test');
  await page.click('#enterBtn');
  await page.waitForTimeout(550);
  return { page, errors, ctx };
}
const box = (page, sel) => page.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; });

(async () => {
  const browser = await chromium.launch();

  // ---- phone ----
  {
    const { page, errors, ctx } = await open(browser, 400, 860);
    const nav = await page.$eval('.bottom-nav', e => getComputedStyle(e).position);
    check('phone: tab bar fixed at the bottom', nav === 'fixed' && (await box(page, '.bottom-nav')).bottom > 800);
    const photo = await box(page, '#scanZone'), search = await box(page, '#queryInput');
    check('phone: search sits below the photo box', search.y > photo.bottom);
    await page.click('#navGradeBtn');
    check('phone: no empty placeholder on Check', !(await page.isVisible('.grade-empty')));
    check('phone: no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---- computer ----
  {
    const { page, errors, ctx } = await open(browser, 1440, 900);
    check('computer: app uses the two-area grid', (await page.$eval('#mainApp', e => getComputedStyle(e).display)) === 'grid');
    const nav = await box(page, '.bottom-nav'), desk = await box(page, '#scannerView .desk');
    check('computer: tabs are a sidebar on the left', nav.right <= desk.x && nav.y < 260 && nav.h < 400, JSON.stringify(nav));
    check('computer: sidebar buttons stack vertically', (await box(page, '#navGradeBtn')).y > (await box(page, '#navScanBtn')).y);
    const photo = await box(page, '#scanZone'), search = await box(page, '#queryInput');
    check('computer: Scan photo and search side by side', search.x > photo.right && Math.abs(search.y - photo.y) < 200);

    await page.click('#navGradeBtn');
    check('computer: Check shows a placeholder before any photo', await page.isVisible('.grade-empty'));
    // analyze one photo so the results column fills
    const img = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 1200; c.height = 900; const g = c.getContext('2d');
      g.fillStyle = '#5c4634'; g.fillRect(0, 0, 1200, 900); g.fillStyle = '#ecc43c'; g.fillRect(350, 100, 500, 700); g.fillStyle = '#1d4a7a'; g.fillRect(382, 142, 440, 616);
      return c.toDataURL('image/jpeg', .92); });
    await page.setInputFiles('#gradeFileInput', { name: 'f.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(img.split(',')[1], 'base64') });
    await page.click('#analyzeBtn');
    await page.waitForFunction(() => document.getElementById('gradeResults').style.display === 'block', null, { timeout: 30000 });
    check('computer: placeholder hidden once results show', !(await page.isVisible('.grade-empty')));
    const zone = await box(page, '#gradeZone'), card = await box(page, '#centerCard');
    check('computer: Check photo left, results right', card.x > zone.right, JSON.stringify({ zone: zone.right, card: card.x }));

    await page.click('#navCollectionBtn');
    for(let i = 0; i < 3; i++){ await page.click('#addTestCardBtn'); await page.waitForTimeout(60); }
    const cols = await page.$eval('.coll-grid', e => getComputedStyle(e).gridTemplateColumns.split(' ').length);
    check('computer: Collection grid has 4+ columns', cols >= 4, String(cols));
    const s = await box(page, '#collectionSearch'), f = await box(page, '#statusFilter');
    check('computer: search and filters on one row', f.x > s.right && Math.abs(f.y - s.y) < 30);
    check('computer: no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---- no sideways scrolling ----
  for(const w of [320, 360, 375, 400, 430, 768, 960, 1024, 1280, 1440, 1920]){
    const { page, ctx } = await open(browser, w, 800);
    const extra = [];
    for(const v of ['navScanBtn', 'navGradeBtn', 'navCollectionBtn']){
      await page.click('#' + v); await page.waitForTimeout(100);
      extra.push(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
    }
    check('no sideways scroll at ' + w + 'px (Scan / Check / Collection)', extra.every(x => x <= 0), extra.join(' / '));
    await ctx.close();
  }

  await browser.close();
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})();
