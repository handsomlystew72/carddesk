const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if(m.type() === 'error' && !/net::|Failed to load resource|tesseract|fonts/i.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.waitForTimeout(500);
  await page.click('#enterBtn');
  await page.click('#navGradeBtn');
  await page.waitForTimeout(200);

  // helper: build a synthetic photo in-page and load it as the current side
  await page.evaluate(() => {
    window.makePhoto = async (ml, mr, mt, mb, rot, bg) => {
      const c = document.createElement('canvas'); c.width = 1200; c.height = 900;
      const g = c.getContext('2d');
      g.fillStyle = bg || '#5c4634'; g.fillRect(0, 0, 1200, 900);
      for(let i = 0; i < 300; i++){ g.fillStyle = `rgba(${90 + Math.random()*30},${70 + Math.random()*25},${50 + Math.random()*20},0.5)`; g.fillRect(Math.random()*1200, Math.random()*900, 40, 6); }
      g.save(); g.translate(600, 450); g.rotate(rot * Math.PI / 180);
      g.fillStyle = '#ecc43c'; g.beginPath(); g.roundRect(-250, -350, 500, 700, 22); g.fill();
      const ax = -250 + ml, ay = -350 + mt, aw = 500 - ml - mr, ah = 700 - mt - mb;
      const grd = g.createLinearGradient(ax, ay, ax + aw, ay + ah); grd.addColorStop(0, '#1d4a7a'); grd.addColorStop(1, '#8a2f6b');
      g.fillStyle = grd; g.fillRect(ax, ay, aw, ah);
      for(let i = 0; i < 160; i++){ g.fillStyle = `hsl(${Math.random()*360},60%,${30 + Math.random()*40}%)`; g.fillRect(ax + Math.random()*(aw - 30), ay + Math.random()*(ah - 30), 10 + Math.random()*30, 10 + Math.random()*30); }
      g.restore();
      return new Promise(r => c.toBlob(b => r(new File([b], 'synthetic.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.92));
    };
  });

  const loadAndAnalyze = async (ml, mr, mt, mb, rot) => {
    await page.evaluate(async ([a, b, c, d, r]) => { gradeSetImageFile(await makePhoto(a, b, c, d, r)); }, [ml, mr, mt, mb, rot]);
    await page.click('#analyzeBtn');
    await page.waitForFunction(() => document.getElementById('gradeResults').style.display === 'block' && curSide().analyzed, null, { timeout: 30000 });
    await page.waitForTimeout(200);
  };
  const read = () => page.evaluate(() => ({
    lr: document.getElementById('lrValue').textContent, tb: document.getElementById('tbValue').textContent,
    quality: [...document.querySelectorAll('.quality-row')].map(r => r.textContent.replace(/\s+/g, ' ').trim()),
    head: document.getElementById('qualityHead').textContent,
    graders: [...document.querySelectorAll('.grader-row')].map(r => r.textContent.replace(/\s+/g, ' ').trim()),
    sub: document.getElementById('graderSubHead').textContent,
  }));

  // FRONT: margins L30 R30 T42 B42 (truth 50/50, 50/50), rotated 6deg
  await loadAndAnalyze(30, 30, 42, 42, 6);
  let r = await read();
  console.log('FRONT centered (truth 50/50 · 50/50):', r.lr, '|', r.tb);
  console.log(' quality:', r.head); r.quality.forEach(q => console.log('   -', q));
  console.log(' graders:', r.graders);
  await page.locator('#gradeResults').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'shot-front-top.png', fullPage: false });

  // drag a border line: move left line right by ~40 canvas px and confirm centering changes
  const before = await page.evaluate(() => ({ ...curSide().lines }));
  await page.locator('#borderCanvas').scrollIntoViewIfNeeded(); await page.waitForTimeout(150);
  const box = await page.locator('#borderCanvas').boundingBox();
  const k = box.width / 600;
  const startX = box.x + before.l * k, startY = box.y + 420 * k;
  await page.mouse.move(startX, startY); await page.mouse.down();
  await page.mouse.move(startX + 18 * k, startY, { steps: 6 });
  const loupeVisible = await page.evaluate(() => getComputedStyle(document.getElementById('borderLoupe')).display);
  await page.screenshot({ path: 'shot-dragging-line.png' });
  await page.mouse.up();
  const after = await page.evaluate(() => ({ ...curSide().lines, touched: curSide().linesTouched }));
  r = await read();
  console.log('Line drag: l', before.l, '->', after.l, 'touched', after.touched, 'loupe during drag:', loupeVisible, '| now', r.lr);

  // drag outline corner a bit, expect re-flatten without errors
  await page.locator('#outlineCanvas').scrollIntoViewIfNeeded(); await page.waitForTimeout(150);
  const ob = await page.locator('#outlineCanvas').boundingBox();
  const q0 = await page.evaluate(() => { const s = curSide(), sc = outlineScale(s); return { x: s.quad[0].x * sc, y: s.quad[0].y * sc, cw: outlineCanvas.width }; });
  const ok = ob.width / q0.cw;
  await page.mouse.move(ob.x + q0.x * ok, ob.y + q0.y * ok); await page.mouse.down();
  await page.mouse.move(ob.x + (q0.x + 6) * ok, ob.y + (q0.y + 6) * ok, { steps: 4 });
  await page.mouse.up();
  console.log('Corner drag ok, detected flag:', await page.evaluate(() => curSide().detected));

  // reset lines + redetect to get the clean number back
  await page.click('#redetectBtn'); await page.waitForTimeout(150);
  r = await read(); console.log('After re-detect:', r.lr, '|', r.tb);

  // BACK: off-center 70/30-ish L/R
  await page.click('#gradeSideToggle button[data-side="back"]');
  await loadAndAnalyze(50, 22, 40, 40, -4);
  r = await read();
  console.log('BACK L50 R22 (truth LR 69.4/30.6, TB 50/50):', r.lr, '|', r.tb);
  console.log(' sub:', r.sub); console.log(' graders:', r.graders);
  await page.screenshot({ path: 'shot-back.png', fullPage: false });

  // Failure-ish case: low-res small card far away
  await page.click('#gradeSideToggle button[data-side="front"]');
  await page.evaluate(async () => {
    const f = await makePhoto(30, 30, 42, 42, 0);
    const img = await loadImageEl(f); const c = document.createElement('canvas'); c.width = 300; c.height = 225;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, 300, 225);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.6)); gradeSetImageFile(new File([blob], 'small.jpg', { type: 'image/jpeg' }));
  });
  await page.click('#analyzeBtn');
  await page.waitForFunction(() => curSide().analyzed, null, { timeout: 30000 });
  r = await read(); console.log('LOW-RES front:', r.head); r.quality.forEach(q => console.log('   -', q));

  // restore good front for saving
  await loadAndAnalyze(30, 30, 42, 42, 6);

  // SAVE to desk as new entry
  const countBefore = await page.evaluate(() => state.collection.length);
  await page.click('#gradeSaveOpen');
  await page.fill('#gradeSaveName', 'Test Charizard 4/102');
  await page.selectOption('#gradeSaveGame', 'pokemon');
  await page.click('#gradeSaveConfirm');
  const msg = await page.textContent('#gradeSaveMsg');
  const saved = await page.evaluate(() => { const c = state.collection[state.collection.length - 1]; return { n: state.collection.length, name: c.name, grading: c.grading, thumb: !!c.gradeThumb }; });
  console.log('Saved:', msg, '| count', countBefore, '->', saved.n, '|', JSON.stringify(saved.grading));

  // attach to existing: add a test card then attach
  await page.click('#navCollectionBtn'); await page.click('#addTestCardBtn');
  await page.click('#navGradeBtn');
  await page.click('#gradeSaveOpen');
  const opts = await page.$$eval('#gradeSaveTarget option', o => o.map(x => x.textContent));
  console.log('Attach options:', opts.slice(0, 4));
  await page.selectOption('#gradeSaveTarget', { index: 1 });
  await page.click('#gradeSaveConfirm');

  await page.click('#navCollectionBtn'); await page.waitForTimeout(200);
  const chips = await page.$$eval('.grade-chips', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  console.log('Desk chips:', chips);
  await page.screenshot({ path: 'shot-desk.png', fullPage: true });

  // full-page screenshot of the grade tab in finished state
  await page.click('#navGradeBtn'); await page.waitForTimeout(200);
  for(const [id,name] of [['#graderGrid','graders'],['#cornerGrid','wear'],['#gradeSaveBar','save']]){ await page.locator(id).scrollIntoViewIfNeeded(); await page.evaluate(()=>window.scrollBy(0,-120)); await page.waitForTimeout(120); await page.screenshot({ path: 'shot-'+name+'.png' }); }

  console.log('ERRORS:', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('TEST CRASH', e); process.exit(1); });
