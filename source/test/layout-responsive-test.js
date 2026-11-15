// Tests the phone and computer layouts (2026-11-13).
// Phone (< 960px): bottom tab bar, one column. Computer (>= 960px): dropdown menu in the header, two-column Scan and Check.
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
// Switch screens the way a person would: bottom bar on a phone, header menu on a computer.
async function go(page, id){
  if(await page.isVisible('#menuBtn')) await page.click('#menuBtn');
  await page.click('#' + id);
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
    check('phone: no menu button (uses the bottom tab bar)', !(await page.isVisible('#menuBtn')));
    await page.click('#navGradeBtn');
    check('phone: no empty placeholder on Check', !(await page.isVisible('.grade-empty')));
    check('phone: no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---- computer ----
  {
    const { page, errors, ctx } = await open(browser, 1440, 900);
    check('computer: app uses the two-area grid', (await page.$eval('#mainApp', e => getComputedStyle(e).display)) === 'grid');
    check('computer: menu button in the header', await page.isVisible('#menuBtn') && /Scan/.test(await page.textContent('#menuBtn')));
    check('computer: menu closed at the start', !(await page.isVisible('#mainNav')));
    const head = await box(page, '#mainApp > header'), desk = await box(page, '#scannerView .desk');
    check('computer: content uses the full width under the header', Math.abs(desk.x - head.x) < 2 && Math.abs(desk.w - head.w) < 2, JSON.stringify({ head, desk }));
    await page.click('#menuBtn');
    const btn = await box(page, '#menuBtn'), nav = await box(page, '#mainNav');
    check('computer: menu opens just under the button', await page.isVisible('#mainNav') && nav.y > btn.bottom && nav.y - btn.bottom < 20 && Math.abs(nav.right - btn.right) < 2, JSON.stringify({ btn, nav }));
    check('computer: menu items stack vertically', (await box(page, '#navGradeBtn')).y > (await box(page, '#navScanBtn')).y);
    check('computer: menu button says it is open', (await page.getAttribute('#menuBtn', 'aria-expanded')) === 'true');
    await page.keyboard.press('Escape');
    check('computer: Escape closes the menu', !(await page.isVisible('#mainNav')));
    await page.click('#menuBtn');
    await page.mouse.click(30, 700);
    check('computer: clicking elsewhere closes the menu', !(await page.isVisible('#mainNav')));
    const photo = await box(page, '#scanZone'), search = await box(page, '#queryInput');
    check('computer: Scan photo and search side by side', search.x > photo.right && Math.abs(search.y - photo.y) < 200);

    await go(page, 'navGradeBtn');
    check('computer: picking Check switches screens and closes the menu', await page.evaluate(() => state.view === 'grade') && !(await page.isVisible('#mainNav')));
    check('computer: menu button shows the current screen', /Check/.test(await page.textContent('#menuBtn')));
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

    await go(page, 'navCollectionBtn');
    for(let i = 0; i < 3; i++){ await page.click('#addTestCardBtn'); await page.waitForTimeout(60); }
    const cols = await page.$eval('.coll-grid', e => getComputedStyle(e).gridTemplateColumns.split(' ').length);
    check('computer: Collection grid has 4+ columns', cols >= 4, String(cols));
    const s = await box(page, '#collectionSearch'), f = await box(page, '#statusFilter');
    check('computer: search and filters on one row', f.x > s.right && Math.abs(f.y - s.y) < 30);
    for(let i = 0; i < 10; i++){ await page.click('#addTestCardBtn'); }
    const tops = [];
    for(const id of ['navScanBtn', 'navGradeBtn', 'navCollectionBtn']){ await go(page, id); await page.waitForTimeout(80); await page.evaluate(() => window.scrollTo(0, 0)); tops.push(Math.round((await box(page, '#menuBtn')).y)); }
    check('computer: menu button in the same spot on every screen', tops.every(t => t === tops[0]), tops.join(', '));
    await page.evaluate(() => window.scrollTo(0, 99999));
    const scrolled = await page.evaluate(() => scrollY);
    const mb = await box(page, '#menuBtn');
    check('computer: header stays pinned at the top after scrolling down', scrolled > 200 && mb.y > 0 && mb.y < 60, JSON.stringify({ scrolled, y: mb.y }));
    await page.click('#menuBtn');
    const nav2 = await box(page, '#mainNav');
    check('computer: menu opens under the button when scrolled', nav2.y > mb.bottom && nav2.y - mb.bottom < 20, JSON.stringify({ btn: mb.bottom, nav: nav2.y }));
    await page.mouse.wheel(0, -300); await page.waitForTimeout(150);
    check('computer: scrolling closes the menu', !(await page.isVisible('#mainNav')));
    check('computer: no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---- tall computer screen: nothing moves between tabs ----
  {
    const { page, errors, ctx } = await open(browser, 1918, 1213);
    const views = { navScanBtn: '#scannerView', navGradeBtn: '#gradeView', navCollectionBtn: '#collectionView' };
    const spots = [];
    for(const [btn, view] of Object.entries(views)){
      await go(page, btn); await page.waitForTimeout(100);
      spots.push([(await box(page, '#mainApp > header')).y, (await box(page, '#menuBtn')).y, (await box(page, view)).y].map(Math.round).join('/'));
    }
    check('tall screen: header, menu button and content start at the same spot on every tab', spots.every(s => s === spots[0]), spots.join('  '));
    await go(page, 'navScanBtn'); await page.waitForTimeout(100);
    const gap = (await box(page, '#scannerView')).y - (await box(page, '#mainApp > header')).bottom;
    check('tall screen: no big empty gap under the header', gap < 40, String(Math.round(gap)));
    check('tall screen: no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---- no sideways scrolling ----
  for(const w of [320, 360, 375, 400, 430, 768, 960, 1024, 1280, 1440, 1920]){
    const { page, ctx } = await open(browser, w, 800);
    const extra = [];
    for(const v of ['navScanBtn', 'navGradeBtn', 'navCollectionBtn']){
      await go(page, v); await page.waitForTimeout(100);
      extra.push(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
    }
    check('no sideways scroll at ' + w + 'px (Scan / Check / Collection)', extra.every(x => x <= 0), extra.join(' / '));
    await ctx.close();
  }

  await browser.close();
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})();
