// Tests the Desk "+ Add card" button: it should open the Scan tab's camera.
// Also checks the sample "+ Test Card" button is hidden unless the address has ?test.
const { chromium } = require('playwright');
const path = require('path');

const APP = 'file://' + path.resolve(__dirname, '../../index.html');
let fail = 0;
const check = (label, ok, extra) => { if(!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', label, extra || ''); };

async function open(browser, url, withCamera){
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, permissions: withCamera ? ['camera'] : [] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if(!withCamera){
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('no camera'), { name: 'NotFoundError' }));
    });
  }
  await page.goto(url);
  await page.click('#enterBtn');
  await page.waitForTimeout(600);
  await page.click('#navCollectionBtn');
  return { page, errors };
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });

  {
    const { page, errors } = await open(browser, APP, true);
    check('Add card button says "+ Add card"', (await page.textContent('#addCardBtn')).trim() === '+ Add card');
    check('Test Card button hidden for normal users', !(await page.isVisible('#addTestCardBtn')));
    await page.click('#addCardBtn');
    await page.waitForSelector('#cameraVideo', { timeout: 10000 });
    await page.waitForFunction(() => document.getElementById('cameraVideo').videoWidth > 0, null, { timeout: 10000 });
    check('Add card switches to the Scan tab', await page.evaluate(() => state.view === 'scanner' && document.getElementById('navScanBtn').classList.contains('active')));
    check('Add card opens the camera', true);
    await page.click('#captureBtn');
    await page.waitForFunction(() => !!state.imageFile, null, { timeout: 10000 });
    check('Taking the photo loads it for Read Card', await page.evaluate(() => !document.getElementById('scanBtn').disabled));
    check('no page errors (camera)', errors.length === 0, errors.join(' | '));
    await page.context().close();
  }

  {
    const { page, errors } = await open(browser, APP, false);
    await page.click('#addCardBtn');
    await page.waitForFunction(() => state.view === 'scanner');
    await page.waitForTimeout(300);
    const hint = await page.textContent('#scanZone');
    check('No camera: Scan tab explains and still allows upload', /camera/i.test(hint) && !!(await page.$('#fileInput')), hint.trim().slice(0, 90));
    check('no page errors (no camera)', errors.length === 0, errors.join(' | '));
    await page.context().close();
  }

  {
    const { page } = await open(browser, APP + '?test', true);
    check('Test Card button shows with ?test', await page.isVisible('#addTestCardBtn'));
    await page.context().close();
  }

  await browser.close();
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})();
