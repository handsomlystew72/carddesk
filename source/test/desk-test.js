const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 430, height: 900 }, deviceScaleFactor: 2 })).newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '../index.html'));
  await page.click('#enterBtn');
  await page.evaluate(() => {
    const mk = (hue) => { const c = document.createElement('canvas'); c.width = 240; c.height = 336; const g = c.getContext('2d');
      g.fillStyle = '#ecc43c'; g.fillRect(0,0,240,336); g.fillStyle = `hsl(${hue},55%,40%)`; g.fillRect(18,22,204,292);
      for(let i=0;i<30;i++){ g.fillStyle = `hsl(${(hue+i*12)%360},60%,60%)`; g.fillRect(30+Math.random()*150, 40+Math.random()*230, 24, 24); }
      return c.toDataURL('image/jpeg', 0.8); };
    const now = Date.now();
    state.collection = [
      { id:'a', game:'pokemon', name:'Charizard 4/102', meta:'Base Set · Holo Rare', img: mk(10), price:'312.50', source:'TCGPLAYER', demo:false, addedAt: now,
        grading:{ savedAt: now, front:{lr:[52,48],tb:[55,45],worst:55}, back:{lr:[60,40],tb:[50,50],worst:60}, ceilings:{psa:'9',bgs:'9',cgc:'9'}, frontOnly:false } },
      { id:'b', game:'baseball', name:'Mickey Mantle (Test)', meta:'1952 Topps · #311', img:null, price:'38,000 – 5.2M', source:null, demo:true, addedAt: now-1,
        grading:{ savedAt: now, front:{lr:[50,50],tb:[50,50],worst:50}, back:null, ceilings:{psa:'10',bgs:'10',cgc:'10 Pristine'}, frontOnly:true }, gradeThumb: mk(200) },
      { id:'c', game:'yugioh', name:'Dark Magician (Test)', meta:'Legend of Blue Eyes · Ultra Rare', img:null, price:'48.00', source:'CARDMARKET', demo:false, addedAt: now-2 },
    ];
    saveCollection(); updateCollectionBadge();
  });
  await page.click('#navCollectionBtn');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'shot-desk-new.png' });
  await page.click('.card-thumb[data-id="a"]');
  await page.waitForTimeout(200);
  const lb = await page.evaluate(() => getComputedStyle(document.getElementById('lightbox')).display);
  await page.screenshot({ path: 'shot-lightbox.png' });
  await page.click('#lightbox');
  const closed = await page.evaluate(() => getComputedStyle(document.getElementById('lightbox')).display);
  await page.click('.desk-grade-cta');
  const view = await page.evaluate(() => state.view);
  console.log('lightbox open:', lb, '| closed:', closed, '| CTA -> view:', view, '| errors:', errors.length ? errors : 'none');
  await browser.close();
})();
