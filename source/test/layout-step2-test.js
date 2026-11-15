// Tests the step 2 screen layouts (2026-11-12):
// Scan heading, photo tips and Upload link; the Check summary card; the Collection grid,
// search, Checked/Unchecked filter, grid/list switch, Scan another card and CSV export.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const APP = 'file://' + path.resolve(__dirname, '../../index.html');
let fail = 0;
const check = (label, ok, extra) => { if(!ok) fail++; console.log(ok ? 'PASS' : 'FAIL', label, extra || ''); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 }, acceptDownloads: true });
  await ctx.route('**/*', r => r.request().url().startsWith('file:') ? r.continue() : r.fulfill({ status: 404, body: '' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('no camera'), { name: 'NotFoundError' }));
  });
  await page.goto(APP + '?test');
  await page.click('#enterBtn');
  await page.waitForTimeout(500);

  // ---- Scan ----
  check('Scan heading shows', (await page.textContent('.hero-title')).trim() === 'Next great find?');
  check('three photo tips', (await page.$$('.photo-tips .tip')).length === 3);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 3000 }).catch(() => null), page.click('#uploadPhotoBtn')]);
  check('Upload photo opens the file picker', !!chooser);

  // ---- Check: analyze front and back by upload ----
  await page.click('#navGradeBtn');
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
  await page.waitForFunction(() => bothFlow === 'front');
  await page.setInputFiles('#gradeFileInput', { name: 'front.jpg', mimeType: 'image/jpeg', buffer: await photo([30, 30, 42, 42]) });
  await page.waitForFunction(() => currentGradeSide === 'back');
  await page.setInputFiles('#gradeFileInput', { name: 'back.jpg', mimeType: 'image/jpeg', buffer: await photo([20, 40, 42, 42]) });
  await page.waitForFunction(() => gradeSides.front.analyzed && gradeSides.back.analyzed && document.getElementById('gradeResults').style.display === 'block', null, { timeout: 30000 });

  check('summary card says front + back captured', /Front \+ back captured/i.test(await page.textContent('#centerCard .cc-badge')));
  const vals = await page.$$eval('#centerCard .cc-val', els => els.map(e => e.textContent.trim()));
  check('four centering numbers shown', vals.length === 4, vals.join(' | '));
  const expected = await page.evaluate(() => {
    const f = centeringFromLines(gradeSides.front.lines, CARD_W, CARD_H), b = centeringFromLines(gradeSides.back.lines, CARD_W, CARD_H);
    const r = (p) => Math.round(p[0]) + ' / ' + Math.round(p[1]);
    return [r(f.lr), r(f.tb), r(b.lr), r(b.tb)];
  });
  check('numbers match the measurement', vals.join('|') === expected.join('|'), expected.join(' | '));
  const backLeft = parseInt(vals[2], 10);
  check('back left/right ≈ 33/67 (truth)', Math.abs(backLeft - 33) <= 3, vals[2]);
  const marker = await page.$$eval('#centerCard .cc-gauge i', els => els.map(e => parseFloat(e.style.left)));
  check('gauge markers placed (front ≈ middle, back left of middle)', Math.abs(marker[0] - 50) < 8 && marker[2] < 30, marker.join(', '));
  const thumbsDrawn = await page.evaluate(() => ['ccThumbFront', 'ccThumbBack'].every(id => {
    const c = document.getElementById(id), d = c.getContext('2d').getImageData(75, 105, 1, 1).data; return d[0] + d[1] + d[2] > 0 && !(d[0] === 238 && d[1] === 242);
  }));
  check('front and back pictures drawn', thumbsDrawn);
  check('centering-only note shown', /Surface, corners and edges aren't assessed/.test(await page.textContent('#centerCard .cc-note')));
  check('old duplicate readout hidden', !(await page.isVisible('.centering-readout')) && !(await page.isVisible('#centerSummary')));

  // dragging a border line updates the card
  await page.evaluate(() => { gradeSides.front.lines.l -= 20; renderMeasurements(); });
  const vals2 = await page.$$eval('#centerCard .cc-val', els => els.map(e => e.textContent.trim()));
  check('card updates when a line moves', vals2[0] !== vals[0], vals[0] + ' -> ' + vals2[0]);

  await page.click('#centerCard [data-cc="save"]');
  check('Save to collection opens the save form', await page.isVisible('#gradeSaveForm'));
  await page.fill('#gradeSaveName', 'Ember Fox');
  await page.click('#gradeSaveConfirm');
  check('saved', /Saved/.test(await page.textContent('#gradeSaveMsg')));

  await page.click('#centerCard [data-cc="retake"]');
  check('Retake starts the front & back flow again', await page.evaluate(() => bothFlow === 'front' && !gradeSides.front.file && !gradeSides.back.file));

  // ---- Collection ----
  await page.click('#navCollectionBtn');
  for(let i = 0; i < 3; i++){ await page.click('#addTestCardBtn'); await page.waitForTimeout(80); }
  check('grid view by default', (await page.$$('.coll-grid .grid-tile')).length === 4);
  check('grid toggle marked active', await page.$eval('#viewToggle [data-view="grid"]', b => b.classList.contains('active')));
  const fox = await page.$('.grid-tile[aria-label^="Ember Fox"]');
  check('checked card shows "Checked"', fox && /Checked/.test(await fox.textContent()) && !/Not checked/.test(await fox.textContent()));

  await page.click('#statusFilter [data-status="checked"]');
  let names = await page.$$eval('.grid-tile .gt-name', els => els.map(e => e.textContent));
  check('Checked filter shows only checked cards', names.length === 1 && names[0] === 'Ember Fox', names.join(','));
  await page.click('#statusFilter [data-status="unchecked"]');
  names = await page.$$eval('.grid-tile .gt-name', els => els.map(e => e.textContent));
  check('Unchecked filter hides it', names.length === 3 && !names.includes('Ember Fox'), names.join(','));
  await page.click('#statusFilter [data-status="all"]');

  await page.fill('#collectionSearch', 'magician');
  names = await page.$$eval('.grid-tile .gt-name', els => els.map(e => e.textContent));
  check('search narrows cards', names.length === 1 && /Dark Magician/.test(names[0]), names.join(','));
  await page.fill('#collectionSearch', 'zzz');
  check('no-match message', /No cards match "zzz"/.test(await page.textContent('#collectionList')));
  await page.fill('#collectionSearch', '');

  await page.click('.grid-tile[aria-label^="Ember Fox"]');
  await page.waitForTimeout(200);
  check('tapping a tile opens it in list view', await page.evaluate(() => state.collectionView === 'list') && !!(await page.$('.collection-item.is-flash')));
  check('list view keeps delete and condition details', !!(await page.$('.collection-item .remove-btn')) && !!(await page.$('.collection-item .grade-slab')));
  await page.click('#viewToggle [data-view="grid"]');
  check('grid view restored', (await page.$$('.coll-grid .grid-tile')).length === 4);
  check('view choice remembered', await page.evaluate(() => localStorage.getItem('carddesk_view_v1') === 'grid'));

  // export
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.click('#exportCsvBtn')]);
  check('Export downloads a CSV', !!dl && /^carddesk-collection-\d{4}-\d{2}-\d{2}\.csv$/.test(dl.suggestedFilename()), dl ? dl.suggestedFilename() : '');
  if(dl){
    const csv = fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, '');
    const lines = csv.trim().split(/\r\n/);
    check('CSV has a header and one row per card', lines.length === 5 && /^Name,Category,Details,Price/.test(lines[0]), String(lines.length));
    const foxRow = lines.find(l => l.startsWith('Ember Fox'));
    check('CSV row carries centering and ceilings', !!foxRow && /\d+\/\d+,\d+\/\d+,\d+\/\d+,\d+\/\d+/.test(foxRow), foxRow);
    check('CSV quotes text with commas', /"38,000 – 5\.2M"/.test(csv));
  }
  check('export message', /Downloaded carddesk-collection-.*\(4 cards\)/.test(await page.textContent('#exportMsg')));

  await page.click('#scanAnotherBtn');
  await page.waitForTimeout(300);
  check('Scan another card goes to Scan', await page.evaluate(() => state.view === 'scanner'));

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
  process.exit(fail ? 1 : 0);
})();
