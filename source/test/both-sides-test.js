// Tests the one-button "Scan front & back" flow on the Grade tab.
// Run 1 uses a fake camera; run 2 has no camera, so it falls back to uploads.
const { chromium } = require('playwright');
const path = require('path');

const APP = 'file://' + path.resolve(__dirname, '../../index.html');
let fail = 0;
const check = (label, ok, extra) => { if(!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', label, extra || ''); };

async function openGrade(browser, withCamera){
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, permissions: withCamera ? ['camera'] : [] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if(!withCamera){
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('no camera'), { name: 'NotFoundError' }));
    });
  }
  await page.goto(APP);
  await page.click('#enterBtn');
  await page.waitForTimeout(600);
  await page.click('#navGradeBtn');
  return { page, errors };
}

const stepText = (page) => page.textContent('#gradeBothStep');
const waitAnalyzed = (page) => page.waitForFunction(
  () => gradeSides.front.analyzed && gradeSides.back.analyzed && document.getElementById('gradeResults').style.display === 'block',
  null, { timeout: 30000 });

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });

  // ---- Run 1: live camera ----
  {
    const { page, errors } = await openGrade(browser, true);
    check('camera: no Open Camera button in the photo box', (await page.$('#gradeCameraBtn')) === null && !/Open Camera/.test(await page.textContent('#gradeZone')));
    await page.click('#gradeBothBtn');
    await page.waitForSelector('#gradeCameraVideo');
    await page.waitForFunction(() => document.getElementById('gradeCameraVideo').videoWidth > 0, null, { timeout: 10000 });
    check('camera: step 1 shows front', /Step 1 of 2/.test(await stepText(page)));
    await page.click('#gradeCaptureBtn');
    await page.waitForFunction(() => currentGradeSide === 'back' && document.getElementById('gradeCameraVideo'), null, { timeout: 10000 });
    await page.waitForFunction(() => document.getElementById('gradeCameraVideo').videoWidth > 0, null, { timeout: 10000 });
    check('camera: front saved, camera reopened for back', await page.evaluate(() => !!gradeSides.front.file && !gradeSides.back.file));
    check('camera: step 2 shows back', /Step 2 of 2/.test(await stepText(page)));
    await page.click('#gradeCaptureBtn');
    await waitAnalyzed(page);
    check('camera: both sides analyzed', true);
    check('camera: shows front with back marked done', await page.evaluate(() => currentGradeSide === 'front' && document.getElementById('backDone').textContent.includes('✓')));
    check('camera: grader rows use both sides', /front and back/.test(await page.textContent('#graderSubHead')));
    check('camera: done message', /Front and back checked/.test(await stepText(page)));
    check('camera: no page errors', errors.length === 0, errors.join(' | '));
    await page.context().close();
  }

  // ---- Run 2: no camera, uploads instead ----
  {
    const { page, errors } = await openGrade(browser, false);
    await page.evaluate(() => {
      window.makePhoto = (ml, mr, mt, mb) => {
        const c = document.createElement('canvas'); c.width = 1200; c.height = 900;
        const g = c.getContext('2d');
        g.fillStyle = '#5c4634'; g.fillRect(0, 0, 1200, 900);
        g.save(); g.translate(600, 450);
        g.fillStyle = '#ecc43c'; g.beginPath(); g.roundRect(-250, -350, 500, 700, 22); g.fill();
        g.fillStyle = '#1d4a7a'; g.fillRect(-250 + ml, -350 + mt, 500 - ml - mr, 700 - mt - mb);
        g.restore();
        return c.toDataURL('image/jpeg', 0.92);
      };
    });
    const photo = async (m) => Buffer.from((await page.evaluate((a) => makePhoto(...a), m)).split(',')[1], 'base64');

    await page.click('#gradeBothBtn');
    await page.waitForFunction(() => /upload the front/.test(document.querySelector('#gradeZone .scan-hint').textContent));
    check('upload: camera error tells you to upload the front', true);
    await page.setInputFiles('#gradeFileInput', { name: 'front.jpg', mimeType: 'image/jpeg', buffer: await photo([30, 30, 42, 42]) });
    await page.waitForFunction(() => currentGradeSide === 'back');
    check('upload: moved to back step', /Tap the box to add the back/.test(await stepText(page)));
    await page.setInputFiles('#gradeFileInput', { name: 'back.jpg', mimeType: 'image/jpeg', buffer: await photo([20, 40, 42, 42]) });
    await waitAnalyzed(page);
    check('upload: both sides analyzed', true);
    const back = await page.evaluate(() => centeringFromLines(gradeSides.back.lines, CARD_W, CARD_H).lr[0]);
    check('upload: back centering measured (truth 33/67)', Math.abs(back - 33.3) < 3, back.toFixed(1));

    // cancelling midway ends the flow
    await page.click('#gradeBothBtn');
    await page.waitForFunction(() => bothFlow === 'front');
    await page.click('#gradeSideToggle button[data-side="back"]');
    check('upload: switching sides by hand ends the flow', await page.evaluate(() => bothFlow === null && document.getElementById('gradeBothStep').style.display === 'none'));
    check('upload: no page errors', errors.length === 0, errors.join(' | '));
    await page.context().close();
  }

  await browser.close();
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})();
