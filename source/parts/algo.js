/* ALGO-START */
const CARD_W = 600, CARD_H = 840;
const CARD_RATIO = 2.5 / 3.5;

function lumOf(data, n){
  const l = new Float32Array(n);
  for(let i = 0; i < n; i++){ const j = i * 4; l[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]; }
  return l;
}

function medianOf(arr){
  const a = Array.from(arr).sort((x, y) => x - y);
  return a[a.length >> 1];
}

function distPts(a, b){ return Math.hypot(a.x - b.x, a.y - b.y); }

function polyArea(q){
  let s = 0;
  for(let i = 0; i < q.length; i++){ const a = q[i], b = q[(i + 1) % q.length]; s += a.x * b.y - b.x * a.y; }
  return Math.abs(s) / 2;
}

/* How sharp is the printed inner-border edge? Ratio of the biggest one-pixel step to
   the whole step's contrast: ~1 for a crisp edge, falling toward 0 as it blurs.
   Independent of how much detail the artwork has. Returns null if no usable edge. */
function edgeSharpness(lum, W, H, lines){
  const ratios = [];
  const bandV = [Math.round(H * 0.425), Math.round(H * 0.575)];
  const bandH = [Math.round(W * 0.425), Math.round(W * 0.575)];
  const colProfile = (x) => { let t = 0; for(let y = bandV[0]; y < bandV[1]; y++) t += lum[y * W + x]; return t / (bandV[1] - bandV[0]); };
  const rowProfile = (y) => { let t = 0; for(let x = bandH[0]; x < bandH[1]; x++) t += lum[y * W + x]; return t / (bandH[1] - bandH[0]); };
  const measure = (get, p, lim) => {
    if(p < 9 || p > lim - 9) return;
    const v = []; for(let i = -9; i <= 9; i++) v.push(get(p + i));
    const m = (a, b) => { let t = 0; for(let i = a; i <= b; i++) t += v[i + 9]; return t / (b - a + 1); };
    const contrast = Math.abs(m(4, 7) - m(-7, -4));
    if(contrast < 18) return;
    let g = 0;
    for(let i = -4; i <= 4; i++) g = Math.max(g, Math.abs(v[i + 9] - v[i + 8]));
    ratios.push(Math.min(1, g / contrast));
  };
  measure(colProfile, lines.l, W); measure(colProfile, lines.r, W);
  measure(rowProfile, lines.t, H); measure(rowProfile, lines.b, H);
  if(!ratios.length) return null;
  ratios.sort((a, b) => a - b);
  return ratios[ratios.length >> 1];
}

/* Finds the card against its background: colour distance from the photo's own
   border colour -> largest blob -> holes filled -> corners from extreme points,
   then each side's line is re-fitted to the straight part of the edge so rounded
   corners don't pull the outline inward. Returns null when it can't tell. */
function detectCardQuad(data, w, h){
  const N = w * h;
  const ring = Math.max(2, Math.round(Math.min(w, h) * 0.03));
  const R = [], G = [], B = [];
  for(let y = 0; y < h; y++){
    const edgeRow = y < ring || y >= h - ring;
    for(let x = 0; x < w; x++){
      if(edgeRow || x < ring || x >= w - ring){ const j = (y * w + x) * 4; R.push(data[j]); G.push(data[j + 1]); B.push(data[j + 2]); }
    }
  }
  const mr = medianOf(R), mg = medianOf(G), mb = medianOf(B);
  const rd = [];
  for(let i = 0; i < R.length; i++){ const dr = R[i] - mr, dg = G[i] - mg, db = B[i] - mb; rd.push(Math.sqrt(dr * dr + dg * dg + db * db)); }
  rd.sort((a, b) => a - b);
  const p90 = rd[Math.floor(rd.length * 0.9)];
  const T = Math.min(90, Math.max(34, p90 * 1.6 + 14));

  const mask = new Uint8Array(N);
  for(let i = 0; i < N; i++){
    const j = i * 4; const dr = data[j] - mr, dg = data[j + 1] - mg, db = data[j + 2] - mb;
    mask[i] = (dr * dr + dg * dg + db * db) > T * T ? 1 : 0;
  }

  const label = new Int32Array(N);
  const stack = new Int32Array(N);
  let best = 0, bestSize = 0, next = 0;
  for(let s = 0; s < N; s++){
    if(!mask[s] || label[s]) continue;
    next++;
    let sp = 0, size = 0;
    stack[sp++] = s; label[s] = next;
    while(sp){
      const p = stack[--sp]; size++;
      const x = p % w, y = (p - x) / w;
      if(x > 0 && mask[p - 1] && !label[p - 1]){ label[p - 1] = next; stack[sp++] = p - 1; }
      if(x < w - 1 && mask[p + 1] && !label[p + 1]){ label[p + 1] = next; stack[sp++] = p + 1; }
      if(y > 0 && mask[p - w] && !label[p - w]){ label[p - w] = next; stack[sp++] = p - w; }
      if(y < h - 1 && mask[p + w] && !label[p + w]){ label[p + w] = next; stack[sp++] = p + w; }
    }
    if(size > bestSize){ bestSize = size; best = next; }
  }
  if(!best) return { quad: null, reason: 'none' };

  // fill holes: anything not reachable from the frame edge without crossing the blob
  const outside = new Uint8Array(N);
  let sp = 0;
  const seed = (p) => { if(label[p] !== best && !outside[p]){ outside[p] = 1; stack[sp++] = p; } };
  for(let x = 0; x < w; x++){ seed(x); seed((h - 1) * w + x); }
  for(let y = 0; y < h; y++){ seed(y * w); seed(y * w + w - 1); }
  while(sp){
    const p = stack[--sp];
    const x = p % w, y = (p - x) / w;
    if(x > 0) seed(p - 1);
    if(x < w - 1) seed(p + 1);
    if(y > 0) seed(p - w);
    if(y < h - 1) seed(p + w);
  }
  let area = 0;
  for(let i = 0; i < N; i++) if(!outside[i]) area++;
  const areaFrac = area / N;
  if(areaFrac < 0.10) return { quad: null, reason: 'small' };
  if(areaFrac > 0.985) return { quad: null, reason: 'full' };

  // extreme points
  let tl = null, tr = null, br = null, bl = null;
  let minS = Infinity, maxS = -Infinity, minD = Infinity, maxD = -Infinity;
  let edgeTouch = 0;
  for(let y = 0; y < h; y++){
    for(let x = 0; x < w; x++){
      if(outside[y * w + x]) continue;
      const s = x + y, d = x - y;
      if(s < minS){ minS = s; tl = { x, y }; }
      if(s > maxS){ maxS = s; br = { x, y }; }
      if(d > maxD){ maxD = d; tr = { x, y }; }
      if(d < minD){ minD = d; bl = { x, y }; }
      if(x === 0 || y === 0 || x === w - 1 || y === h - 1) edgeTouch++;
    }
  }
  const clipped = edgeTouch > 0.03 * (2 * w + 2 * h);
  const C = [tl, tr, br, bl];

  // boundary pixels (in-frame neighbours only)
  const bpts = [];
  for(let y = 0; y < h; y++){
    for(let x = 0; x < w; x++){
      const p = y * w + x;
      if(outside[p]) continue;
      if((x > 0 && outside[p - 1]) || (x < w - 1 && outside[p + 1]) || (y > 0 && outside[p - w]) || (y < h - 1 && outside[p + w])) bpts.push(x, y);
    }
  }

  const lines = [];
  for(let k = 0; k < 4; k++){
    const a = C[k], b = C[(k + 1) % 4];
    const vx = b.x - a.x, vy = b.y - a.y;
    const L2 = vx * vx + vy * vy, L = Math.sqrt(L2);
    if(L < 8){ lines.push(null); continue; }
    let n = 0, mx = 0, my = 0;
    const sel = [];
    for(let i = 0; i < bpts.length; i += 2){
      const px = bpts[i] - a.x, py = bpts[i + 1] - a.y;
      const t = (px * vx + py * vy) / L2;
      const perp = Math.abs(px * vy - py * vx) / L;
      if(t >= 0.18 && t <= 0.82 && perp < 0.07 * L){ sel.push(bpts[i], bpts[i + 1]); mx += bpts[i]; my += bpts[i + 1]; n++; }
    }
    if(n < 12){ lines.push(null); continue; }
    mx /= n; my /= n;
    let sxx = 0, syy = 0, sxy = 0;
    for(let i = 0; i < sel.length; i += 2){ const dx = sel[i] - mx, dy = sel[i + 1] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    lines.push({ x: mx, y: my, dx: Math.cos(th), dy: Math.sin(th) });
  }

  const quad = [];
  for(let k = 0; k < 4; k++){
    // corner k sits between side (k-1) and side k
    const l1 = lines[(k + 3) % 4], l2 = lines[k];
    let pt = C[k];
    if(l1 && l2){
      const det = l1.dx * (-l2.dy) - l1.dy * (-l2.dx);
      if(Math.abs(det) > 1e-6){
        const rx = l2.x - l1.x, ry = l2.y - l1.y;
        const s = (rx * (-l2.dy) - ry * (-l2.dx)) / det;
        const cand = { x: l1.x + s * l1.dx, y: l1.y + s * l1.dy };
        const lim = 0.12 * Math.hypot(C[(k + 1) % 4].x - C[k].x, C[(k + 1) % 4].y - C[k].y);
        if(distPts(cand, C[k]) < Math.max(6, lim)) pt = cand;
      }
    }
    quad.push(pt);
  }

  const ratio = polyArea(quad) / area;
  const conf = ratio > 0.8 && ratio < 1.25 ? 'ok' : 'low';
  return { quad, clipped, areaFrac, conf };
}

/* Make sure the quad runs TL, TR, BR, BL for a portrait card. */
function orientQuad(q){
  const w = (distPts(q[0], q[1]) + distPts(q[3], q[2])) / 2;
  const h = (distPts(q[0], q[3]) + distPts(q[1], q[2])) / 2;
  if(w > h * 1.1) return [q[3], q[0], q[1], q[2]];
  return q;
}

function solveHomography(q, W, H){
  const us = [0, W, W, 0], vs = [0, 0, H, H];
  const A = [], b = [];
  for(let i = 0; i < 4; i++){
    const u = us[i], v = vs[i], x = q[i].x, y = q[i].y;
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
  }
  const n = 8;
  for(let c = 0; c < n; c++){
    let p = c;
    for(let r = c + 1; r < n; r++) if(Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    const tA = A[c]; A[c] = A[p]; A[p] = tA;
    const tb = b[c]; b[c] = b[p]; b[p] = tb;
    const piv = A[c][c];
    if(Math.abs(piv) < 1e-12) return null;
    for(let r = c + 1; r < n; r++){
      const f = A[r][c] / piv;
      for(let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const h = new Array(n);
  for(let r = n - 1; r >= 0; r--){
    let s = b[r];
    for(let k = r + 1; k < n; k++) s -= A[r][k] * h[k];
    h[r] = s / A[r][r];
  }
  return h;
}

/* Sample a homography over the flat-space rectangle [u0,u0+W) x [v0,v0+H) (bilinear). */
function warpH(src, sw, sh, hm, u0, v0, W, H){
  const out = new Uint8ClampedArray(W * H * 4);
  if(!hm) return out;
  for(let v = 0; v < H; v++){
    for(let u = 0; u < W; u++){
      const uu = u0 + u + 0.5, vv = v0 + v + 0.5;
      const d = hm[6] * uu + hm[7] * vv + 1;
      let x = (hm[0] * uu + hm[1] * vv + hm[2]) / d - 0.5;
      let y = (hm[3] * uu + hm[4] * vv + hm[5]) / d - 0.5;
      x = Math.min(sw - 1.001, Math.max(0, x));
      y = Math.min(sh - 1.001, Math.max(0, y));
      const x0 = Math.floor(x), y0 = Math.floor(y);
      const fx = x - x0, fy = y - y0;
      const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
      const o = (v * W + u) * 4;
      for(let c = 0; c < 4; c++){
        out[o + c] = src[i00 + c] * (1 - fx) * (1 - fy) + src[i10 + c] * fx * (1 - fy) + src[i01 + c] * (1 - fx) * fy + src[i11 + c] * fx * fy;
      }
    }
  }
  return out;
}

/* Perspective-correct the quad into a flat W x H RGBA buffer. */
function warpQuad(src, sw, sh, quad, W, H){
  return warpH(src, sw, sh, solveHomography(quad, W, H), 0, 0, W, H);
}

/* The silhouette-based quad is good to a pixel or two, which is several centering
   points on a ~5% border. Warp with padding, find where the card edge really sits
   on each side (strongest brightness step near the expected spot, sub-pixel), and
   move the quad sides there. */
function refineQuadToCardEdge(src, sw, sh, quad){
  const hm = solveHomography(quad, CARD_W, CARD_H);
  if(!hm) return quad;
  const P = 24, PW = CARD_W + 2 * P, PH = CARD_H + 2 * P;
  const pad = warpH(src, sw, sh, hm, -P, -P, PW, PH);
  const lum = lumOf(pad, PW * PH);
  const x0 = Math.round(PW * 0.3), x1 = Math.round(PW * 0.7), y0 = Math.round(PH * 0.3), y1 = Math.round(PH * 0.7);
  const rowAvg = new Float32Array(PH), colAvg = new Float32Array(PW);
  for(let y = 0; y < PH; y++){ let t = 0; for(let x = x0; x < x1; x++) t += lum[y * PW + x]; rowAvg[y] = t / (x1 - x0); }
  for(let x = 0; x < PW; x++){ let t = 0; for(let y = y0; y < y1; y++) t += lum[y * PW + x]; colAvg[x] = t / (y1 - y0); }
  const step = (a, i) => Math.abs((a[i] + a[i + 1] + a[i + 2]) / 3 - (a[i - 1] + a[i - 2] + a[i - 3]) / 3);
  // offset (in flat px) of the true card edge from the expected one, scanning from one side
  function edgeOffset(arr, fromEnd){
    const a = fromEnd ? Float32Array.from(arr).reverse() : arr;
    const lo = P - 14, hi = P + 10;
    let bi = -1, bs = 0;
    for(let i = lo; i <= hi; i++){ const sv = step(a, i); if(sv > bs){ bs = sv; bi = i; } }
    if(bi < 0 || bs < 12) return 0;
    const s0 = step(a, bi - 1), s1 = bs, s2 = step(a, bi + 1);
    const den = s0 - 2 * s1 + s2;
    const sub = Math.abs(den) > 1e-6 ? Math.max(-0.5, Math.min(0.5, 0.5 * (s0 - s2) / den)) : 0;
    return bi + sub - P;
  }
  const eT = edgeOffset(rowAvg, false), eB = edgeOffset(rowAvg, true);
  const eL = edgeOffset(colAvg, false), eR = edgeOffset(colAvg, true);
  const mapPt = (u, v) => {
    const d = hm[6] * u + hm[7] * v + 1;
    return { x: (hm[0] * u + hm[1] * v + hm[2]) / d, y: (hm[3] * u + hm[4] * v + hm[5]) / d };
  };
  return [
    mapPt(eL, eT), mapPt(CARD_W - eR, eT), mapPt(CARD_W - eR, CARD_H - eB), mapPt(eL, CARD_H - eB),
  ];
}

/* Row/column luminance profiles over the middle half of the card. */
function cardProfiles(lum, W, H){
  const x0 = Math.round(W * 0.25), x1 = Math.round(W * 0.75);
  const y0 = Math.round(H * 0.25), y1 = Math.round(H * 0.75);
  const rowAvg = new Float32Array(H), colAvg = new Float32Array(W);
  for(let y = 0; y < H; y++){ let s = 0; for(let x = x0; x < x1; x++) s += lum[y * W + x]; rowAvg[y] = s / (x1 - x0); }
  for(let x = 0; x < W; x++){ let s = 0; for(let y = y0; y < y1; y++) s += lum[y * W + x]; colAvg[x] = s / (y1 - y0); }
  return { rowAvg, colAvg };
}

/* First strong brightness step inward from one side of the flattened card. */
function findMargin(arr, fromEnd){
  const n = arr.length;
  const a = fromEnd ? Float32Array.from(arr).reverse() : arr;
  const skip = Math.round(n * 0.012), maxScan = Math.round(n * 0.22);
  const THR = 11;
  const stepAt = (i) => {
    const after = (a[i] + a[i + 1] + a[i + 2]) / 3;
    const before = (a[i - 1] + a[i - 2] + a[i - 3]) / 3;
    return Math.abs(after - before);
  };
  for(let i = skip + 3; i < maxScan; i++){
    if(stepAt(i) > THR){
      let bestI = i, bestD = stepAt(i);
      for(let j = i + 1; j < Math.min(maxScan, i + 9); j++){ const d = stepAt(j); if(d > bestD){ bestD = d; bestI = j; } }
      return { px: bestI, found: true };
    }
  }
  return { px: Math.round(n * 0.045), found: false };
}

function autoBorders(lum, W, H){
  const { rowAvg, colAvg } = cardProfiles(lum, W, H);
  const t = findMargin(rowAvg, false), b = findMargin(rowAvg, true);
  const l = findMargin(colAvg, false), r = findMargin(colAvg, true);
  return {
    lines: { l: l.px, r: W - r.px, t: t.px, b: H - b.px },
    conf: { l: l.found, r: r.found, t: t.found, b: b.found },
  };
}

/* Percent split on each axis from the four border lines. */
function centeringFromLines(lines, W, H){
  const L = lines.l, R = W - lines.r, T = lines.t, B = H - lines.b;
  const lp = (L + R) > 0 ? L / (L + R) * 100 : 50;
  const tp = (T + B) > 0 ? T / (T + B) * 100 : 50;
  const worst = Math.max(lp, 100 - lp, tp, 100 - tp);
  return { lr: [lp, 100 - lp], tb: [tp, 100 - tp], worst };
}

/* ---- Grader centering standards (max % on the larger side) ----
   PSA publishes these; CGC publishes most; BGS gives centering as a sub-grade and
   its exact tolerances are not officially published (these are the commonly
   cited figures). Sources disagree in places, so treat all as approximate. */
const GRADERS = {
  psa: { name: 'PSA', unofficial: false, tiers: [
    { g: '10', f: 55, b: 75 }, { g: '9', f: 60, b: 90 }, { g: '8', f: 65, b: 90 }, { g: '7', f: 70, b: 90 },
    { g: '6', f: 80, b: 90 }, { g: '5', f: 85, b: 90 }, { g: '4', f: 85, b: 90 }, { g: '3', f: 90, b: 90 }, { g: '2', f: 90, b: 90 },
  ] },
  bgs: { name: 'BGS', unofficial: true, tiers: [
    { g: '10', f: 55, b: 55 }, { g: '9.5', f: 55, b: 60 }, { g: '9', f: 60, b: 65 }, { g: '8.5', f: 65, b: 70 },
    { g: '8', f: 70, b: 80 }, { g: '7.5', f: 75, b: 85 }, { g: '7', f: 80, b: 90 },
  ] },
  cgc: { name: 'CGC', unofficial: false, tiers: [
    { g: '10 Pristine', f: 50, b: 55 }, { g: '10', f: 55, b: 75 }, { g: '9', f: 60, b: 90 },
    { g: '8', f: 70, b: 90 }, { g: '7', f: 75, b: 90 }, { g: '6', f: 85, b: 90 },
  ] },
};
const CENTERING_TOLERANCE = 2; // points of measurement slack a phone photo can't resolve

/* Highest grade the measured centering allows. Not a predicted grade. */
function centeringCeiling(key, frontWorst, backWorst){
  const tiers = GRADERS[key].tiers;
  const hasBack = backWorst !== null && backWorst !== undefined;
  const okTier = (t, slack) => frontWorst <= t.f + slack && (!hasBack || backWorst <= t.b + slack);
  for(let i = 0; i < tiers.length; i++){
    if(okTier(tiers[i], 0)){
      const up = i > 0 ? tiers[i - 1] : null;
      let borderline = null, limitedBy = null;
      if(up){
        if(okTier(up, CENTERING_TOLERANCE)) borderline = up.g;
        limitedBy = frontWorst > up.f ? 'front' : 'back';
      }
      return { grade: tiers[i].g, tierIndex: i, up, borderline, limitedBy, belowScale: false, hasBack };
    }
  }
  return { grade: '1', tierIndex: tiers.length, up: tiers[tiers.length - 1], borderline: null, limitedBy: 'front', belowScale: true, hasBack };
}

/* Photo-quality checks. info: { natW, workW, workH, quad(work coords), detected, clipped, flatLum, flatRGBA } */
function computeQuality(info){
  const out = [];
  const q = info.quad;
  const top = distPts(q[0], q[1]), bot = distPts(q[3], q[2]);
  const left = distPts(q[0], q[3]), right = distPts(q[1], q[2]);
  const toNat = info.natW / info.workW;
  const cardPx = Math.round(((top + bot) / 2) * toNat);

  if(!info.detected){
    out.push({ id: 'outline', level: 'warn', label: 'Card outline', text: 'Couldn’t auto-find the edges — drag the corners onto the card.' });
  } else if(info.clipped){
    out.push({ id: 'outline', level: 'bad', label: 'Card outline', text: 'The card runs off the edge of the frame — retake with all four corners visible.' });
  } else if(info.lowConf){
    out.push({ id: 'outline', level: 'warn', label: 'Card outline', text: 'Outline looks uncertain — check the corners.' });
  } else {
    out.push({ id: 'outline', level: 'ok', label: 'Card outline', text: 'Found automatically.' });
  }

  if(info.autoConf){
    const found = ['l', 'r', 't', 'b'].filter(k => info.autoConf[k]).length;
    if(found < 3) out.push({ id: 'borders', level: 'warn', label: 'Inner border', text: 'Couldn\u2019t find the border on ' + (4 - found) + ' side(s) \u2014 the orange lines are guesses. Drag them, or check the outline is on the card edge (not the artwork).' });
  }
  if(info.detected && info.marginFrac !== undefined && info.marginFrac < 0.07 && polyArea(q) / (info.workW * info.workH) > 0.55){
    out.push({ id: 'tight', level: 'warn', label: 'Tight frame', text: 'If the card fills the whole photo, tap \u201cUse whole photo\u201d \u2014 the outline may be sitting on the artwork.' });
  }

  if(cardPx < 450) out.push({ id: 'res', level: 'bad', label: 'Resolution', text: 'Card is only ~' + cardPx + ' px wide — too small to measure borders well. Move closer or use a higher-res photo.' });
  else if(cardPx < 700) out.push({ id: 'res', level: 'warn', label: 'Resolution', text: 'Card is ~' + cardPx + ' px wide — usable, but 800+ px gives steadier results.' });
  else out.push({ id: 'res', level: 'ok', label: 'Resolution', text: '~' + cardPx + ' px across the card.' });

  const fill = polyArea(q) / (info.workW * info.workH);
  if(fill < 0.12) out.push({ id: 'size', level: 'bad', label: 'Card size', text: 'Card fills only ' + Math.round(fill * 100) + '% of the frame — move much closer.' });
  else if(fill < 0.25) out.push({ id: 'size', level: 'warn', label: 'Card size', text: 'Card fills ' + Math.round(fill * 100) + '% of the frame — move closer.' });
  else out.push({ id: 'size', level: 'ok', label: 'Card size', text: 'Fills ' + Math.round(fill * 100) + '% of the frame.' });

  const tilt = Math.max(Math.abs(1 - top / bot), Math.abs(1 - left / right));
  if(tilt > 0.12) out.push({ id: 'tilt', level: 'bad', label: 'Tilt', text: 'Strong angle (' + Math.round(tilt * 100) + '% perspective). Straightening helps but accuracy drops — shoot from directly above.' });
  else if(tilt > 0.05) out.push({ id: 'tilt', level: 'warn', label: 'Tilt', text: 'Slight angle (' + Math.round(tilt * 100) + '% perspective) — corrected, but straight-on is better.' });
  else out.push({ id: 'tilt', level: 'ok', label: 'Tilt', text: 'Shot is close to straight-on.' });

  const aw = (top + bot) / 2, ah = (left + right) / 2;
  const dev = Math.abs(aw / ah - CARD_RATIO) / CARD_RATIO;
  if(dev > 0.12) out.push({ id: 'shape', level: 'warn', label: 'Outline shape', text: 'Proportions don’t match a standard card (' + (aw / ah).toFixed(2) + ' vs 0.71) — check the corners.' });

  const W = CARD_W, H = CARD_H;
  const sharp = info.autoLines ? edgeSharpness(info.flatLum, W, H, info.autoLines) : null;
  if(sharp === null) out.push({ id: 'blur', level: 'na', label: 'Sharpness', text: 'Couldn\u2019t measure (borders too low-contrast).' });
  else if(sharp < BLUR_BAD) out.push({ id: 'blur', level: 'bad', label: 'Sharpness', text: 'Looks blurry \u2014 tap to focus, hold steady, add light.' });
  else if(sharp < BLUR_WARN) out.push({ id: 'blur', level: 'warn', label: 'Sharpness', text: 'A bit soft \u2014 edges may read slightly off.' });
  else out.push({ id: 'blur', level: 'ok', label: 'Sharpness', text: 'Edges look crisp.' });

  let hot = 0, tot = 0;
  const gx0 = Math.round(W * 0.12), gx1 = Math.round(W * 0.88), gy0 = Math.round(H * 0.12), gy1 = Math.round(H * 0.88);
  for(let y = gy0; y < gy1; y += 2){
    for(let x = gx0; x < gx1; x += 2){
      const j = (y * W + x) * 4;
      if(info.flatRGBA[j] >= 246 && info.flatRGBA[j + 1] >= 246 && info.flatRGBA[j + 2] >= 246) hot++;
      tot++;
    }
  }
  const hotFrac = hot / tot;
  if(hotFrac > 0.05) out.push({ id: 'glare', level: 'bad', label: 'Glare', text: 'Strong reflections cover ~' + Math.round(hotFrac * 100) + '% of the card — tilt the light away.' });
  else if(hotFrac > 0.015) out.push({ id: 'glare', level: 'warn', label: 'Glare', text: 'Possible glare spots — can hide wear and confuse edge detection.' });
  else out.push({ id: 'glare', level: 'ok', label: 'Glare', text: 'No major glare.' });

  return out;
}
const BLUR_WARN = 0.22, BLUR_BAD = 0.12;
/* ALGO-END */
