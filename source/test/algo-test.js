const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../parts/algo.js', 'utf8');
const m = src.split('/* ALGO-START */')[1].split('/* ALGO-END */')[0];
const api = new Function(m + '; return {detectCardQuad, orientQuad, warpQuad, refineQuadToCardEdge, edgeSharpness, lumOf, autoBorders, centeringFromLines, centeringCeiling, computeQuality, CARD_W, CARD_H, GRADERS, solveHomography};')();
const { detectCardQuad, orientQuad, warpQuad, refineQuadToCardEdge, edgeSharpness, lumOf, autoBorders, centeringFromLines, centeringCeiling, computeQuality, CARD_W:W, CARD_H:H } = api;

// ---- deterministic noise
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const noiseGrid = new Float32Array(64 * 64).map(() => rnd());
function vnoise(x, y){ const gx = x / 9, gy = y / 9; const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
  const g = (a, b) => noiseGrid[((b % 64 + 64) % 64) * 64 + ((a % 64 + 64) % 64)];
  return (g(x0,y0)*(1-fx)+g(x0+1,y0)*fx)*(1-fy)+(g(x0,y0+1)*(1-fx)+g(x0+1,y0+1)*fx)*fy; }

// flat synthetic card: yellow border with given margins (px of 600x840), textured art inside
function flatCard(ml, mr, mt, mb){
  const t = (x, y) => {
    if(x < ml || x >= W - mr || y < mt || y >= H - mb) return [235, 196, 60];
    const n = vnoise(x, y); const n2 = vnoise(x * 2.3 + 40, y * 2.3 + 11);
    return [40 + 150 * n, 60 + 120 * n2, 90 + 110 * (n * 0.5 + n2 * 0.5)];
  };
  return t;
}
// render a photo: card mapped through a quad (given dst corners), bg textured table
function photo(cardFn, quad, PW, PH, bg){
  const out = new Uint8ClampedArray(PW * PH * 4);
  const hm = api.solveHomography(quad, W, H); // flat -> photo; we need inverse, so brute: sample photo -> flat via inverse homography
  // invert by solving with swapped roles
  const inv = invHomog(quad);
  for(let y = 0; y < PH; y++) for(let x = 0; x < PW; x++){
    const d = inv[6]*x + inv[7]*y + 1;
    const u = (inv[0]*x + inv[1]*y + inv[2]) / d, v = (inv[3]*x + inv[4]*y + inv[5]) / d;
    let c;
    if(u >= 0 && u < W && v >= 0 && v < H) c = cardFn(Math.floor(u), Math.floor(v));
    else { const n = vnoise(x + 200, y + 90); c = [bg[0] + 14 * n, bg[1] + 14 * n, bg[2] + 14 * n]; }
    const o = (y * PW + x) * 4; out[o] = c[0]; out[o+1] = c[1]; out[o+2] = c[2]; out[o+3] = 255;
  }
  return out;
}
function invHomog(q){ // photo(x,y) -> flat(u,v)
  const us = [[0,0],[W,0],[W,H],[0,H]]; const A = [], b = [];
  for(let i = 0; i < 4; i++){ const x = q[i].x, y = q[i].y, [u, v] = us[i];
    A.push([x,y,1,0,0,0,-x*u,-y*u]); b.push(u); A.push([0,0,0,x,y,1,-x*v,-y*v]); b.push(v); }
  const n = 8; for(let c = 0; c < n; c++){ let p = c; for(let r = c+1; r < n; r++) if(Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c],A[p]] = [A[p],A[c]]; [b[c],b[p]] = [b[p],b[c]];
    for(let r = c+1; r < n; r++){ const f = A[r][c]/A[c][c]; for(let k = c; k < n; k++) A[r][k] -= f*A[c][k]; b[r] -= f*b[c]; } }
  const h = []; for(let r = n-1; r >= 0; r--){ let s = b[r]; for(let k = r+1; k < n; k++) s -= A[r][k]*h[k]; h[r] = s/A[r][r]; } return h;
}
function boxBlur(data, w, h, r){ // 3 passes ≈ gaussian
  const out = Uint8ClampedArray.from(data);
  for(let pass = 0; pass < 3; pass++){
    const tmp = Uint8ClampedArray.from(out);
    for(let y = 0; y < h; y++) for(let x = 0; x < w; x++){ for(let c = 0; c < 3; c++){ let s = 0, n = 0; for(let k = -r; k <= r; k++){ const xx = Math.min(w-1, Math.max(0, x+k)); s += out[(y*w+xx)*4+c]; n++; } tmp[(y*w+x)*4+c] = s/n; } }
    for(let y = 0; y < h; y++) for(let x = 0; x < w; x++){ for(let c = 0; c < 3; c++){ let s = 0, n = 0; for(let k = -r; k <= r; k++){ const yy = Math.min(h-1, Math.max(0, y+k)); s += tmp[(yy*w+x)*4+c]; n++; } out[(y*w+x)*4+c] = s/n; } }
  } return out;
}
const rot = (pts, cx, cy, deg) => pts.map(p => { const a = deg * Math.PI / 180, dx = p.x - cx, dy = p.y - cy; return { x: cx + dx*Math.cos(a) - dy*Math.sin(a), y: cy + dx*Math.sin(a) + dy*Math.cos(a) }; });

function runPipeline(px, PW, PH, label, truth){
  const t0 = Date.now();
  const det = detectCardQuad(px, PW, PH);
  if(!det || !det.quad){ console.log(label, 'DETECT FAIL', det && det.reason); return null; }
  const q = refineQuadToCardEdge(px, PW, PH, orientQuad(det.quad));
  const flat = warpQuad(px, PW, PH, q, W, H);
  const lum = lumOf(flat, W * H);
  const ab = autoBorders(lum, W, H);
  const c = centeringFromLines(ab.lines, W, H);
  const msg = `${label}: LR ${c.lr[0].toFixed(1)}/${c.lr[1].toFixed(1)}  TB ${c.tb[0].toFixed(1)}/${c.tb[1].toFixed(1)}  lines ${JSON.stringify(ab.lines)} conf ${JSON.stringify(ab.conf)}  (${Date.now()-t0}ms)`;
  console.log(msg);
  if(truth){ const e = Math.max(Math.abs(c.lr[0]-truth.lr), Math.abs(c.tb[0]-truth.tb)); console.log('   truth LR', truth.lr.toFixed(1), 'TB', truth.tb.toFixed(1), ' max error', e.toFixed(2), 'pts', det.conf, 'clipped', det.clipped); }
  return { q, flat, lum, det, ab, c };
}

const PW = 800, PH = 640;
const cases = [
  { name: 'straight, centered', m: [30,30,42,42], rotDeg: 0, persp: 0 },
  { name: 'rot 8deg, centered', m: [30,30,42,42], rotDeg: 8, persp: 0 },
  { name: 'rot -15, L/R 40/20', m: [40,20,42,42], rotDeg: -15, persp: 0 },
  { name: 'rot 5 + perspective 6%', m: [34,26,50,34], rotDeg: 5, persp: 0.06 },
  { name: 'rot 3 + perspective 12%', m: [30,30,42,42], rotDeg: 3, persp: 0.12 },
];
for(const cs of cases){
  const cw = 250, ch = 350; const cx = PW/2, cy = PH/2;
  let quad = [{x:cx-cw/2,y:cy-ch/2},{x:cx+cw/2,y:cy-ch/2},{x:cx+cw/2,y:cy+ch/2},{x:cx-cw/2,y:cy+ch/2}];
  if(cs.persp) { const k = cs.persp; quad[0].x += cw*k; quad[1].x -= cw*k; }
  quad = rot(quad, cx, cy, cs.rotDeg);
  const px = photo(flatCard(...cs.m), quad, PW, PH, [92, 70, 52]);
  const truth = { lr: cs.m[0] / (cs.m[0] + cs.m[1]) * 100, tb: cs.m[2] / (cs.m[2] + cs.m[3]) * 100 };
  runPipeline(px, PW, PH, cs.name, truth);
}

// sharpness calibration: photo of card with progressive blur, through full pipeline
console.log('--- sharpness (edge-based) through the pipeline ---');
{
  const cw = 250, ch = 350, cx = PW/2, cy = PH/2;
  const quad = rot([{x:cx-cw/2,y:cy-ch/2},{x:cx+cw/2,y:cy-ch/2},{x:cx+cw/2,y:cy+ch/2},{x:cx-cw/2,y:cy+ch/2}], cx, cy, 4);
  const px0 = photo(flatCard(30,30,42,42), quad, PW, PH, [92,70,52]);
  for(const r of [0, 1, 2, 3, 5]){
    const px = r ? boxBlur(px0, PW, PH, r) : px0;
    const det = detectCardQuad(px, PW, PH); const q = refineQuadToCardEdge(px, PW, PH, orientQuad(det.quad));
    const flat = warpQuad(px, PW, PH, q, W, H); const lum = lumOf(flat, W*H); const ab = autoBorders(lum, W, H);
    console.log('blur r', r, '-> sharpness', edgeSharpness(lum, W, H, ab.lines));
  }
}
// low-contrast artwork / white-border-on-white-table behaviours
console.log('--- failure modes ---');
{
  const cw = 250, ch = 350, cx = PW/2, cy = PH/2;
  const quad = [{x:cx-cw/2,y:cy-ch/2},{x:cx+cw/2,y:cy-ch/2},{x:cx+cw/2,y:cy+ch/2},{x:cx-cw/2,y:cy+ch/2}];
  const px = photo(flatCard(30,30,42,42), quad, PW, PH, [236, 198, 62]); // table same colour as border
  const det = detectCardQuad(px, PW, PH); console.log('table == border colour ->', det && (det.quad ? 'quad found conf ' + det.conf : 'null: ' + det.reason));
  const full = photo(flatCard(30,30,42,42), [{x:0,y:0},{x:PW,y:0},{x:PW,y:PH},{x:0,y:PH}], PW, PH, [0,0,0]);
  const d2 = detectCardQuad(full, PW, PH); console.log('card fills the frame ->', d2 && (d2.quad ? 'quad found' : 'null: ' + d2.reason));
}
// ceilings
console.log('--- ceilings ---');
for(const [fw, bw] of [[51,null],[56,null],[58,60],[62,null],[52,80],[70,90],[95,null]]){
  console.log(`front ${fw} back ${bw}:`, ['psa','bgs','cgc'].map(k => { const c = centeringCeiling(k, fw, bw); return k + '=' + c.grade + (c.borderline ? '(~' + c.borderline + ')' : '') + (c.limitedBy ? '[' + c.limitedBy + ']' : ''); }).join('  '));
}
