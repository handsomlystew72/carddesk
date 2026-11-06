const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.click('#enterBtn'); await page.click('#navCollectionBtn');
  for(let i = 0; i < 5; i++) await page.click('#addTestCardBtn');
  await page.waitForTimeout(300);
  console.log(await page.$$eval('.collection-item', els => els.map(e => e.querySelector('.card-name').textContent + ' | ' + [...e.querySelectorAll('.gs-val')].map(x => x.textContent).join(' ') + ' | ' + (e.querySelector('.dg-detail')||{}).textContent)));
  await page.screenshot({ path: 'shot-testcards-top.png' });
  await page.evaluate(() => window.scrollTo(0, 1100)); await page.waitForTimeout(150);
  await page.screenshot({ path: 'shot-testcards-bottom.png' });
  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
})();
