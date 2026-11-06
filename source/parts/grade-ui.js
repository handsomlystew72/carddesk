/* ================= Grade / Condition Check ================= */

const gradeZone = document.getElementById('gradeZone');
const gradeFileInput = document.getElementById('gradeFileInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const gradeClearBtn = document.getElementById('gradeClearBtn');
const gradeStatusLine = document.getElementById('gradeStatusLine');
const gradeResults = document.getElementById('gradeResults');

const GRADE_IDLE_MARKUP = `
    <div class="corner tl"></div><div class="corner tr"></div>
    <div class="corner bl"></div><div class="corner br"></div>
    <svg class="scan-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 8a2 2 0 0 1 2-2h1.2a2 2 0 0 0 1.6-.8l.9-1.2a2 2 0 0 1 1.6-.8h1.4a2 2 0 0 1 1.6.8l.9 1.2a2 2 0 0 0 1.6.8H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z"/>
      <circle cx="12" cy="13" r="3.5"/>
    </svg>
    <div class="scan-hint">Photograph the card flat, straight-on, all four corners in frame, on a plain contrasting surface.</div>
    <button type="button" class="camera-btn" id="gradeCameraBtn">Open Camera</button>`;

function newGradeSide(){
  return {
    file: null, url: null,
    analyzed: false,
    work: null, workData: null, natW: 0,
    quad: null, detected: false, clipped: false, lowConf: false, marginFrac: undefined, wholePhoto: false,
    flat: null, flatRGBA: null, flatLum: null, profile: null,
    lines: null, lineConf: null, autoLines: null, autoConf: null, linesTouched: false,
    quality: [],
  };
}
const gradeSides = { front: newGradeSide(), back: newGradeSide() };
let currentGradeSide = 'front';
function curSide(){ return gradeSides[currentGradeSide]; }
function sideWord(){ return currentGradeSide === 'front' ? 'Front' : 'Back'; }

gradeZone.addEventListener('click', (e) => {
  if(e.target.closest('#gradeRotateBtn')){ e.stopPropagation(); gradeRotateCurrentImage(); return; }
  if(e.target.closest('#gradeCameraBtn')){ e.stopPropagation(); gradeOpenCamera(); return; }
  if(e.target.closest('#gradeCameraCancelBtn')){ e.stopPropagation(); gradeCloseCameraToIdle(); return; }
  if(e.target.closest('#gradeCaptureBtn')){ e.stopPropagation(); gradeCaptureFromCamera(); return; }
  if(e.target.closest('#gradeCameraSwitchBtn')){ e.stopPropagation(); gradeSwitchCamera(); return; }
  if(gradeZone.classList.contains('has-camera')) return;
  gradeFileInput.click();
});

gradeFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if(!file) return;
  gradeSetImageFile(file);
  gradeFileInput.value = '';
});

/* Redraws the photo zone + results for whichever side is selected. */
function gradeShowZone(){
  const s = curSide();
  gradeZone.classList.remove('has-camera');
  if(s.file){
    gradeZone.classList.add('has-image');
    gradeZone.innerHTML = `
      <img id="gradePreviewImg" src="${s.url}" alt="${currentGradeSide} of card">
      <button type="button" class="rotate-btn" id="gradeRotateBtn" aria-label="Rotate photo 90 degrees">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12a9 9 0 1 1-2.64-6.36"/>
          <path d="M21 3v6h-6"/>
        </svg>
      </button>`;
  } else {
    gradeZone.classList.remove('has-image');
    gradeZone.innerHTML = GRADE_IDLE_MARKUP;
    if(currentGradeSide === 'back'){
      const hint = gradeZone.querySelector('.scan-hint');
      if(hint) hint.textContent = 'Now the back of the same card — same setup: flat, straight-on, all four corners in frame.';
    }
  }
  analyzeBtn.disabled = !s.file;
  analyzeBtn.textContent = (s.analyzed ? 'Re-analyze ' : 'Analyze ') + sideWord();
  gradeResults.style.display = s.analyzed ? 'block' : 'none';
  document.querySelectorAll('#gradeSideToggle button').forEach(b => b.classList.toggle('active', b.dataset.side === currentGradeSide));
  document.getElementById('backDone').textContent = gradeSides.back.analyzed ? ' ✓' : '';
  if(s.analyzed) renderGradeAll();
}

function gradeSetImageFile(file){
  const s = curSide();
  if(s.url){ try{ URL.revokeObjectURL(s.url); }catch(e){} }
  const keepLinesFlag = false;
  Object.assign(s, newGradeSide(), { file, url: URL.createObjectURL(file) });
  gradeShowZone();
}

document.getElementById('gradeSideToggle').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-side]');
  if(!btn || btn.dataset.side === currentGradeSide) return;
  gradeStopCameraStream();
  currentGradeSide = btn.dataset.side;
  hideSaveForm();
  gradeShowZone();
});

async function gradeOpenCamera(){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    gradeShowCameraError(new Error('this browser doesn\'t support camera access'));
    return;
  }
  try{
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: state.gradeFacingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    state.gradeCameraStream = stream;
    gradeZone.classList.remove('has-image');
    gradeZone.classList.add('has-camera');
    gradeZone.innerHTML = `
      <video id="gradeCameraVideo" autoplay playsinline muted></video>
      <div class="camera-controls">
        <button type="button" class="camera-icon-btn" id="gradeCameraCancelBtn" aria-label="Cancel">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
        <button type="button" class="shutter-btn" id="gradeCaptureBtn" aria-label="Capture photo"></button>
        <button type="button" class="camera-icon-btn" id="gradeCameraSwitchBtn" aria-label="Switch camera">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
        </button>
      </div>`;
    document.getElementById('gradeCameraVideo').srcObject = stream;
  } catch(err){
    gradeShowCameraError(err);
  }
}

function gradeStopCameraStream(){
  if(state.gradeCameraStream){
    state.gradeCameraStream.getTracks().forEach(t => t.stop());
    state.gradeCameraStream = null;
  }
}

function gradeCloseCameraToIdle(){
  gradeStopCameraStream();
  gradeShowZone();
}

function gradeShowCameraError(err){
  gradeStopCameraStream();
  gradeZone.classList.remove('has-camera', 'has-image');
  gradeZone.innerHTML = GRADE_IDLE_MARKUP;
  const name = err && err.name;
  const isPermission = name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError';
  const isNoCamera = name === 'NotFoundError' || name === 'DevicesNotFoundError';
  const isInUse = name === 'NotReadableError' || name === 'TrackStartError';
  let msg;
  if(isPermission){
    msg = 'Camera access is turned off for this page. Allow it in your browser settings, then tap "Allow Camera" to try again.';
  } else if(isNoCamera){
    msg = 'No camera was found on this device. You can still upload a photo instead.';
  } else if(isInUse){
    msg = 'Your camera seems to be in use elsewhere. Close it and tap "Allow Camera" to try again.';
  } else {
    msg = 'Camera unavailable (' + (err && err.message ? err.message : 'unknown error') + '). You can upload a photo instead.';
  }
  const hint = gradeZone.querySelector('.scan-hint');
  if(hint) hint.textContent = msg;
  if(isPermission || isInUse){
    const camBtn = document.getElementById('gradeCameraBtn');
    if(camBtn) camBtn.textContent = 'Allow Camera';
  }
}

function gradeCaptureFromCamera(){
  const videoEl = document.getElementById('gradeCameraVideo');
  if(!videoEl || !videoEl.videoWidth) return;
  const canvas = document.createElement('canvas');
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  canvas.getContext('2d').drawImage(videoEl, 0, 0, canvas.width, canvas.height);
  canvas.toBlob((blob) => {
    if(!blob) return;
    gradeStopCameraStream();
    gradeSetImageFile(new File([blob], 'grade-capture.jpg', { type: 'image/jpeg' }));
  }, 'image/jpeg', 0.95);
}

async function gradeSwitchCamera(){
  state.gradeFacingMode = state.gradeFacingMode === 'environment' ? 'user' : 'environment';
  gradeStopCameraStream();
  await gradeOpenCamera();
}

async function gradeRotateCurrentImage(){
  const s = curSide();
  if(!s.file) return;
  const rotateBtn = document.getElementById('gradeRotateBtn');
  if(rotateBtn) rotateBtn.style.opacity = '0.4';
  try{
    const rotated = await rotateImageFile(s.file, 90);
    gradeSetImageFile(rotated);
  } catch(err){
    // leave original photo as-is if rotation fails
  } finally {
    if(rotateBtn) rotateBtn.style.opacity = '1';
  }
}

gradeClearBtn.addEventListener('click', () => {
  const s = curSide();
  if(s.url){ try{ URL.revokeObjectURL(s.url); }catch(e){} }
  Object.assign(s, newGradeSide());
  gradeFileInput.value = '';
  gradeStopCameraStream();
  hideSaveForm();
  gradeShowZone();
});

function loadImageEl(file){
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { resolve(img); };
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  });
}

/* ---------------- Detection pipeline (DOM side) ---------------- */

function autoOutline(s){
  const ww = s.work.width, wh = s.work.height;
  const ds = Math.min(1, 800 / Math.max(ww, wh));
  const sw = Math.max(1, Math.round(ww * ds)), sh = Math.max(1, Math.round(wh * ds));
  const c = document.createElement('canvas');
  c.width = sw; c.height = sh;
  const g = c.getContext('2d');
  g.drawImage(s.work, 0, 0, sw, sh);
  const det = detectCardQuad(g.getImageData(0, 0, sw, sh).data, sw, sh);
  s.wholePhoto = false;
  if(det && det.quad){
    let q = det.quad.map(p => ({ x: p.x / sw * ww, y: p.y / sh * wh }));
    q = orientQuad(q);
    q = refineQuadToCardEdge(s.workData.data, ww, wh, q);
    s.quad = q;
    s.detected = true;
    s.clipped = !!det.clipped;
    s.lowConf = det.conf === 'low';
    const xs = q.map(p => p.x), ys = q.map(p => p.y);
    s.marginFrac = Math.min(Math.min(...xs) / ww, Math.min(...ys) / wh, 1 - Math.max(...xs) / ww, 1 - Math.max(...ys) / wh);
  } else {
    setWholePhotoQuad(s);
    s.detected = false;
  }
}

function setWholePhotoQuad(s){
  const ww = s.work.width, wh = s.work.height;
  s.quad = orientQuad([{ x: 0, y: 0 }, { x: ww, y: 0 }, { x: ww, y: wh }, { x: 0, y: wh }]);
  s.detected = true; s.clipped = false; s.lowConf = false; s.marginFrac = undefined; s.wholePhoto = true;
}

function reflatten(s){
  const ww = s.work.width, wh = s.work.height;
  const out = warpQuad(s.workData.data, ww, wh, s.quad, CARD_W, CARD_H);
  s.flatRGBA = out;
  const fc = document.createElement('canvas');
  fc.width = CARD_W; fc.height = CARD_H;
  fc.getContext('2d').putImageData(new ImageData(out, CARD_W, CARD_H), 0, 0);
  s.flat = fc;
  s.flatLum = lumOf(out, CARD_W * CARD_H);
  const ab = autoBorders(s.flatLum, CARD_W, CARD_H);
  s.autoLines = ab.lines; s.autoConf = ab.conf;
  if(!s.linesTouched || !s.lines){
    s.lines = { ...ab.lines };
    s.lineConf = { ...ab.conf };
  }
  s.profile = cardProfiles(s.flatLum, CARD_W, CARD_H);
  s.quality = computeQuality({
    natW: s.natW, workW: ww, workH: wh, quad: s.quad,
    detected: s.detected, clipped: s.clipped, lowConf: s.lowConf, marginFrac: s.marginFrac,
    flatLum: s.flatLum, flatRGBA: out, autoLines: s.autoLines, autoConf: s.autoConf,
  });
  if(s.wholePhoto){
    const o = s.quality.find(q => q.id === 'outline');
    if(o) o.text = 'Using the whole photo as the card.';
  }
}

async function analyzeSide(s){
  const img = await loadImageEl(s.file);
  const natW = img.naturalWidth || img.width, natH = img.naturalHeight || img.height;
  const ws = Math.min(1, 1600 / Math.max(natW, natH));
  const ww = Math.max(1, Math.round(natW * ws)), wh = Math.max(1, Math.round(natH * ws));
  const work = document.createElement('canvas');
  work.width = ww; work.height = wh;
  const g = work.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, ww, wh);
  s.work = work;
  s.workData = g.getImageData(0, 0, ww, wh);
  s.natW = natW;
  s.linesTouched = false;
  autoOutline(s);
  reflatten(s);
  s.analyzed = true;
}

analyzeBtn.addEventListener('click', async () => {
  const s = curSide();
  if(!s.file) return;
  analyzeBtn.disabled = true;
  gradeStatusLine.style.display = 'flex';
  gradeResults.style.display = 'none';
  const sideAtStart = currentGradeSide;
  try{
    await analyzeSide(s);
    hideSaveForm();
    if(currentGradeSide === sideAtStart) gradeShowZone();
  } catch(err){
    gradeResults.style.display = 'block';
    document.getElementById('qualityHead').textContent = 'Could not analyze this photo';
    document.getElementById('qualityList').innerHTML = `<div class="quality-row is-bad"><span class="status-dot bad"></span><span>${escapeHtml(err.message || 'unknown error')}. Try a clearer, straight-on shot with all four corners visible.</span></div>`;
  } finally {
    gradeStatusLine.style.display = 'none';
    analyzeBtn.disabled = !curSide().file;
  }
});

/* ---------------- Rendering ---------------- */

function renderGradeAll(){
  renderQuality();
  drawOutline();
  drawBorder();
  renderMeasurements();
  renderCloseups();
}
function renderFlatDependents(){
  renderQuality();
  drawBorder();
  renderMeasurements();
  renderCloseups();
}

const qualityDot = { ok: 'clean', warn: 'wear', bad: 'bad', na: 'na' };
function renderQuality(){
  const s = curSide();
  const list = document.getElementById('qualityList');
  const head = document.getElementById('qualityHead');
  const order = { bad: 0, warn: 1, ok: 2, na: 3 };
  const rows = [...s.quality].sort((a, b) => order[a.level] - order[b.level]);
  const issues = rows.filter(r => r.level === 'bad' || r.level === 'warn').length;
  const anyBad = rows.some(r => r.level === 'bad');
  head.textContent = 'Photo quality — ' + (issues === 0 ? 'looks good' : (anyBad ? 'retake recommended' : issues + ' thing' + (issues === 1 ? '' : 's') + ' to improve'));
  list.innerHTML = rows.map(r => `
    <div class="quality-row ${r.level === 'bad' ? 'is-bad' : (r.level === 'warn' ? 'is-warn' : '')}">
      <span class="status-dot ${qualityDot[r.level]}"></span>
      <div><b>${escapeHtml(r.label)}</b><span>${escapeHtml(r.text)}</span></div>
    </div>`).join('');
}

/* ---- loupe ---- */
function showLoupe(loupeEl, srcCanvas, wrapEl, sx, sy, span, ev){
  const g = loupeEl.getContext('2d');
  const L = loupeEl.width;
  g.fillStyle = '#000'; g.fillRect(0, 0, L, L);
  g.imageSmoothingEnabled = true;
  g.drawImage(srcCanvas, sx - span / 2, sy - span / 2, span, span, 0, 0, L, L);
  g.strokeStyle = 'rgba(125,224,192,0.95)'; g.lineWidth = 2;
  g.beginPath();
  g.moveTo(L / 2, L / 2 - 22); g.lineTo(L / 2, L / 2 + 22);
  g.moveTo(L / 2 - 22, L / 2); g.lineTo(L / 2 + 22, L / 2);
  g.stroke();
  const rect = wrapEl.getBoundingClientRect();
  const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
  const left = Math.min(Math.max(px - 48, 0), Math.max(0, rect.width - 96));
  let top = py - 130;
  if(top < 0) top = py + 36;
  loupeEl.style.left = left + 'px';
  loupeEl.style.top = top + 'px';
  loupeEl.style.display = 'block';
}

function canvasPoint(canvas, ev){
  const r = canvas.getBoundingClientRect();
  const k = canvas.width / r.width;
  return { x: (ev.clientX - r.left) * k, y: (ev.clientY - r.top) * k, k };
}

/* ---- Step 1: outline editor ---- */
const outlineCanvas = document.getElementById('outlineCanvas');
const outlineWrap = document.getElementById('outlineWrap');
const outlineLoupe = document.getElementById('outlineLoupe');
let outlineDrag = -1;

function outlineScale(s){ return Math.min(1, 640 / Math.max(s.work.width, s.work.height)); }

function drawOutline(){
  const s = curSide();
  if(!s.work || !s.quad) return;
  const sc = outlineScale(s);
  const cw = Math.round(s.work.width * sc), ch = Math.round(s.work.height * sc);
  if(outlineCanvas.width !== cw || outlineCanvas.height !== ch){ outlineCanvas.width = cw; outlineCanvas.height = ch; }
  const g = outlineCanvas.getContext('2d');
  g.drawImage(s.work, 0, 0, cw, ch);
  const q = s.quad.map(p => ({ x: p.x * sc, y: p.y * sc }));
  g.lineWidth = Math.max(2, cw * 0.005);
  g.strokeStyle = '#7de0c0';
  g.beginPath();
  q.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y));
  g.closePath(); g.stroke();
  const r = Math.max(8, cw * 0.017);
  q.forEach(p => {
    g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2);
    g.fillStyle = 'rgba(125,224,192,0.35)'; g.fill();
    g.lineWidth = 2; g.strokeStyle = '#7de0c0'; g.stroke();
    g.beginPath(); g.arc(p.x, p.y, 2, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
  });
}

outlineCanvas.addEventListener('pointerdown', (ev) => {
  const s = curSide();
  if(!s.analyzed) return;
  const p = canvasPoint(outlineCanvas, ev), sc = outlineScale(s);
  let bi = -1, bd = Infinity;
  s.quad.forEach((q, i) => { const d = Math.hypot(q.x * sc - p.x, q.y * sc - p.y); if(d < bd){ bd = d; bi = i; } });
  if(bd > 80 * p.k) return;
  outlineDrag = bi;
  outlineCanvas.setPointerCapture(ev.pointerId);
  outlineCanvas.classList.add('dragging');
  ev.preventDefault();
  moveOutlineHandle(ev);
});
outlineCanvas.addEventListener('pointermove', (ev) => { if(outlineDrag >= 0) moveOutlineHandle(ev); });
function endOutlineDrag(){
  if(outlineDrag < 0) return;
  outlineDrag = -1;
  outlineCanvas.classList.remove('dragging');
  outlineLoupe.style.display = 'none';
  const s = curSide();
  reflatten(s);
  renderFlatDependents();
}
outlineCanvas.addEventListener('pointerup', endOutlineDrag);
outlineCanvas.addEventListener('pointercancel', endOutlineDrag);

function moveOutlineHandle(ev){
  const s = curSide(), sc = outlineScale(s);
  const p = canvasPoint(outlineCanvas, ev);
  const x = Math.min(s.work.width, Math.max(0, p.x / sc)), y = Math.min(s.work.height, Math.max(0, p.y / sc));
  s.quad[outlineDrag] = { x, y };
  s.detected = true; s.clipped = false; s.lowConf = false; s.marginFrac = undefined; s.wholePhoto = false;
  drawOutline();
  showLoupe(outlineLoupe, s.work, outlineWrap, x, y, 44, ev);
}

document.getElementById('useWholePhotoBtn').addEventListener('click', () => {
  const s = curSide(); if(!s.analyzed) return;
  setWholePhotoQuad(s); s.linesTouched = false;
  reflatten(s); drawOutline(); renderFlatDependents();
});
document.getElementById('redetectBtn').addEventListener('click', () => {
  const s = curSide(); if(!s.analyzed) return;
  autoOutline(s); s.linesTouched = false;
  reflatten(s); drawOutline(); renderFlatDependents();
});

/* ---- Step 2: border-line editor ---- */
const borderCanvas = document.getElementById('borderCanvas');
const borderWrap = document.getElementById('borderWrap');
const borderLoupe = document.getElementById('borderLoupe');
let borderDrag = null;

function drawBorder(){
  const s = curSide();
  if(!s.flat || !s.lines) return;
  const W = CARD_W, H = CARD_H;
  if(borderCanvas.width !== W || borderCanvas.height !== H){ borderCanvas.width = W; borderCanvas.height = H; }
  const g = borderCanvas.getContext('2d');
  g.drawImage(s.flat, 0, 0);
  const col = (k) => s.lineConf && s.lineConf[k] ? '#7de0c0' : '#ffb347';
  g.lineWidth = 2;
  const seg = (k, x0, y0, x1, y1) => {
    g.strokeStyle = col(k); g.setLineDash([9, 6]);
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.setLineDash([]);
  };
  seg('l', s.lines.l, 0, s.lines.l, H);
  seg('r', s.lines.r, 0, s.lines.r, H);
  seg('t', 0, s.lines.t, W, s.lines.t);
  seg('b', 0, s.lines.b, W, s.lines.b);
  const tab = (k, cx, cy, w, h) => {
    g.fillStyle = col(k);
    g.beginPath();
    if(g.roundRect) g.roundRect(cx - w / 2, cy - h / 2, w, h, 5); else g.rect(cx - w / 2, cy - h / 2, w, h);
    g.fill();
  };
  tab('l', s.lines.l, H / 2, 12, 46); tab('r', s.lines.r, H / 2, 12, 46);
  tab('t', W / 2, s.lines.t, 46, 12); tab('b', W / 2, s.lines.b, 46, 12);
}

borderCanvas.addEventListener('pointerdown', (ev) => {
  const s = curSide();
  if(!s.analyzed) return;
  const p = canvasPoint(borderCanvas, ev);
  const cands = [
    ['l', Math.abs(p.x - s.lines.l)], ['r', Math.abs(p.x - s.lines.r)],
    ['t', Math.abs(p.y - s.lines.t)], ['b', Math.abs(p.y - s.lines.b)],
  ].sort((a, b) => a[1] - b[1]);
  if(cands[0][1] > 44 * p.k) return;
  borderDrag = cands[0][0];
  borderCanvas.setPointerCapture(ev.pointerId);
  borderCanvas.classList.add('dragging');
  ev.preventDefault();
  moveBorderLine(ev);
});
borderCanvas.addEventListener('pointermove', (ev) => { if(borderDrag) moveBorderLine(ev); });
function endBorderDrag(){
  if(!borderDrag) return;
  borderDrag = null;
  borderCanvas.classList.remove('dragging');
  borderLoupe.style.display = 'none';
}
borderCanvas.addEventListener('pointerup', endBorderDrag);
borderCanvas.addEventListener('pointercancel', endBorderDrag);

function moveBorderLine(ev){
  const s = curSide();
  const p = canvasPoint(borderCanvas, ev);
  const W = CARD_W, H = CARD_H, k = borderDrag, L = s.lines;
  if(k === 'l') L.l = Math.round(Math.min(L.r - 80, Math.max(3, p.x)));
  if(k === 'r') L.r = Math.round(Math.max(L.l + 80, Math.min(W - 3, p.x)));
  if(k === 't') L.t = Math.round(Math.min(L.b - 100, Math.max(3, p.y)));
  if(k === 'b') L.b = Math.round(Math.max(L.t + 100, Math.min(H - 3, p.y)));
  s.linesTouched = true;
  s.lineConf[k] = true;
  drawBorder();
  renderMeasurements();
  const focusX = (k === 'l' || k === 'r') ? L[k] : Math.min(W, Math.max(0, p.x));
  const focusY = (k === 't' || k === 'b') ? L[k] : Math.min(H, Math.max(0, p.y));
  showLoupe(borderLoupe, borderCanvas, borderWrap, focusX, focusY, 40, ev);
}

document.getElementById('resetLinesBtn').addEventListener('click', () => {
  const s = curSide(); if(!s.analyzed) return;
  s.linesTouched = false;
  s.lines = { ...s.autoLines }; s.lineConf = { ...s.autoConf };
  drawBorder(); renderMeasurements();
});

/* ---- Measurements, grader ceilings, wear ---- */

function sideCentering(s){
  return s && s.analyzed && s.lines ? centeringFromLines(s.lines, CARD_W, CARD_H) : null;
}
const r0 = (n) => Math.round(n);

function renderMeasurements(){
  const s = curSide();
  const c = sideCentering(s);
  if(!c) return;
  document.getElementById('lrFill').style.width = c.lr[0] + '%';
  document.getElementById('tbFill').style.width = c.tb[0] + '%';
  document.getElementById('lrValue').textContent = r0(c.lr[0]) + ' / ' + r0(c.lr[1]);
  document.getElementById('tbValue').textContent = r0(c.tb[0]) + ' / ' + r0(c.tb[1]);
  const worst = c.worst;
  let verdict;
  if(worst <= 55) verdict = 'Excellent — close to dead-center';
  else if(worst <= 60) verdict = 'Very good centering';
  else if(worst <= 65) verdict = 'Good centering';
  else if(worst <= 70) verdict = 'Fair — noticeably off-center';
  else if(worst <= 80) verdict = 'Off-center';
  else verdict = 'Significantly off-center';
  document.getElementById('centeringVerdict').textContent = verdict;

  const f = sideCentering(gradeSides.front), b = sideCentering(gradeSides.back);
  const line = (label, key, cc) => cc ? `
    <div class="center-line ${currentGradeSide === key ? 'is-current' : ''}">
      <span class="cl-side">${label}</span>
      <span class="cl-vals">L/R ${r0(cc.lr[0])}/${r0(cc.lr[1])} · T/B ${r0(cc.tb[0])}/${r0(cc.tb[1])}</span>
      <span class="cl-worst">worst ${r0(cc.worst)}/${100 - r0(cc.worst)}</span>
    </div>` : `
    <div class="center-line"><span class="cl-side">${label}</span><span class="cl-vals" style="opacity:.5">not analyzed yet</span></div>`;
  document.getElementById('centerSummary').innerHTML = line('Front', 'front', f) + line('Back', 'back', b);

  renderGraders(f, b);
  renderWear(s);
}

function renderGraders(f, b){
  const grid = document.getElementById('graderGrid');
  const sub = document.getElementById('graderSubHead');
  const note = document.getElementById('graderNote');
  if(!f){
    grid.innerHTML = '';
    sub.textContent = 'Analyze the front of the card to see what its centering allows at PSA, BGS and CGC.';
    note.textContent = '';
    return;
  }
  sub.textContent = b
    ? 'Based on measured front and back centering. This is a ceiling from centering only.'
    : 'Front only so far — add the back photo for the full check (PSA 10 also limits the back to 75/25). This is a ceiling from centering only.';
  const bw = b ? b.worst : null;
  grid.innerHTML = ['psa', 'bgs', 'cgc'].map(key => {
    const G = GRADERS[key];
    const res = centeringCeiling(key, f.worst, bw);
    let line;
    if(res.belowScale){
      line = `Centering is worse than the lowest ${G.name} tier listed.`;
    } else if(res.tierIndex === 0){
      line = 'Centering doesn’t hold it back at the top tier.';
    } else {
      const u = res.up;
      const need = `≤ ${u.f}/${100 - u.f} front${res.hasBack ? ', ≤ ' + u.b + '/' + (100 - u.b) + ' back' : ''}`;
      line = res.borderline
        ? `Borderline for ${res.borderline} (needs ${need}) — within measurement error, can\u2019t be confirmed from a photo.`
        : `Held back by ${res.limitedBy} centering. Next grade up (${u.g}) needs ${need}.`;
    }
    return `
      <div class="grader-row">
        <div class="grader-name">${G.name}</div>
        <div class="grader-ceiling">≤ ${escapeHtml(res.grade)}${G.unofficial ? '<small>unofficial tolerances</small>' : ''}${res.hasBack ? '' : '<small>front only</small>'}</div>
        <div class="grader-sub">${escapeHtml(line)}</div>
      </div>`;
  }).join('');
  note.textContent = 'PSA and CGC publish centering tolerances (PSA reportedly tightened its 10 to 55/45 in 2025; CGC’s lower tiers are approximate). BGS grades centering as a sub-grade and doesn’t officially publish exact numbers — these are the commonly cited figures, and a BGS Pristine 10 needs a true 50/50. Corners, edges and surface can only lower a grade from these ceilings, never raise it.';
}

const WEAR_THRESHOLD = 22, LIGHT_BORDER_CUTOFF = 195;
const conditionStatusText = { clean: 'Looks clean', wear: 'Possible wear', inconclusive: 'Inconclusive' };

function computeWear(s){
  const W = CARD_W, H = CARD_H, lum = s.flatLum, L = s.lines;
  const m = { t: L.t, b: H - L.b, l: L.l, r: W - L.r };
  const avg1D = (arr, i0, i1) => {
    i0 = Math.max(0, i0); i1 = Math.min(arr.length, Math.max(i0 + 1, i1));
    let t = 0, n = 0; for(let i = i0; i < i1; i++){ t += arr[i]; n++; }
    return n ? t / n : null;
  };
  const region = (x0, y0, x1, y1) => {
    x0 = Math.max(0, Math.round(x0)); y0 = Math.max(0, Math.round(y0));
    x1 = Math.min(W, Math.round(x1)); y1 = Math.min(H, Math.round(y1));
    if(x1 <= x0 || y1 <= y0) return null;
    let t = 0, n = 0;
    for(let y = y0; y < y1; y++) for(let x = x0; x < x1; x++){ t += lum[y * W + x]; n++; }
    return n ? t / n : null;
  };
  const { rowAvg, colAvg } = s.profile;
  const ref = {
    t: avg1D(rowAvg, Math.round(m.t * 0.25), Math.round(m.t * 0.75)),
    b: avg1D(rowAvg, H - Math.round(m.b * 0.75), H - Math.round(m.b * 0.25)),
    l: avg1D(colAvg, Math.round(m.l * 0.25), Math.round(m.l * 0.75)),
    r: avg1D(colAvg, W - Math.round(m.r * 0.75), W - Math.round(m.r * 0.25)),
  };
  const mean2 = (a, b) => (a === null || b === null) ? (a === null ? b : a) : (a + b) / 2;
  const verdict = (patch, r) => (r === null || patch === null || r >= LIGHT_BORDER_CUTOFF) ? 'inconclusive' : ((patch - r) > WEAR_THRESHOLD ? 'wear' : 'clean');

  const minM = Math.min(m.t, m.b, m.l, m.r);
  const o = 8, avail = minM - o - 1;
  const cs = Math.min(14, avail);
  const cornerOK = cs >= 4;
  const corner = (label, x0, y0, refA, refB) => ({
    label,
    status: cornerOK ? verdict(region(x0, y0, x0 + cs, y0 + cs), mean2(refA, refB)) : 'inconclusive',
  });
  const corners = [
    corner('Top-left', o, o, ref.t, ref.l),
    corner('Top-right', W - o - cs, o, ref.t, ref.r),
    corner('Bottom-left', o, H - o - cs, ref.b, ref.l),
    corner('Bottom-right', W - o - cs, H - o - cs, ref.b, ref.r),
  ];

  const edge = (label, refv, sampler, length) => {
    if(refv === null || refv >= LIGHT_BORDER_CUTOFF) return { label, status: 'inconclusive' };
    const segs = 6, start = length * 0.12, usable = length * 0.76, segLen = usable / segs;
    for(let i = 0; i < segs; i++){
      const v = sampler(start + i * segLen, start + (i + 1) * segLen);
      if(v !== null && (v - refv) > WEAR_THRESHOLD) return { label, status: 'wear' };
    }
    return { label, status: 'clean' };
  };
  const band = (mm) => Math.max(2, Math.round(mm * 0.6));
  const edges = [
    edge('Top edge', ref.t, (a, b) => region(a, 3, b, band(m.t)), W),
    edge('Bottom edge', ref.b, (a, b) => region(a, H - band(m.b), b, H - 3), W),
    edge('Left edge', ref.l, (a, b) => region(3, a, band(m.l), b), H),
    edge('Right edge', ref.r, (a, b) => region(W - band(m.r), a, W - 3, b), H),
  ];
  return { corners, edges };
}

function renderWear(s){
  const w = computeWear(s);
  const render = (id, items) => {
    document.getElementById(id).innerHTML = items.map(item => `
      <div class="condition-chip">
        <span class="status-dot ${item.status}"></span>
        <span class="chip-label">${escapeHtml(item.label)}</span>
        <span>${conditionStatusText[item.status]}</span>
      </div>`).join('');
  };
  render('cornerGrid', w.corners);
  render('edgeGrid', w.edges);
}

function drawCrop(canvasId, sx, sy, sw, sh){
  const s = curSide();
  const target = document.getElementById(canvasId);
  if(!target || !s.flat) return;
  const dw = 160, dh = Math.round(dw * (sh / sw));
  target.width = dw; target.height = dh;
  target.getContext('2d').drawImage(s.flat, sx, sy, sw, sh, 0, 0, dw, dh);
}
function renderCloseups(){
  const W = CARD_W, H = CARD_H, cs = Math.round(W * 0.22);
  drawCrop('cropTL', 0, 0, cs, cs);
  drawCrop('cropTR', W - cs, 0, cs, cs);
  drawCrop('cropBL', 0, H - cs, cs, cs);
  drawCrop('cropBR', W - cs, H - cs, cs, cs);
  const cw = Math.round(W * 0.5), ch = Math.round(H * 0.3);
  drawCrop('cropCenter', Math.round((W - cw) / 2), Math.round((H - ch) / 2), cw, ch);
}

/* ---- Save to My Desk ---- */

const saveForm = document.getElementById('gradeSaveForm');
const saveMsg = document.getElementById('gradeSaveMsg');
function hideSaveForm(){ saveForm.style.display = 'none'; saveMsg.textContent = ''; saveMsg.classList.remove('is-error'); }

function ceilingsRecord(f, b){
  if(!f) return null;
  const out = {};
  ['psa', 'bgs', 'cgc'].forEach(k => { out[k] = centeringCeiling(k, f.worst, b ? b.worst : null).grade; });
  return out;
}

function buildGradingRecord(){
  const f = sideCentering(gradeSides.front), b = sideCentering(gradeSides.back);
  const side = (c) => c ? { lr: [r0(c.lr[0]), r0(c.lr[1])], tb: [r0(c.tb[0]), r0(c.tb[1])], worst: r0(c.worst) } : null;
  const issues = ['front', 'back'].reduce((n, k) => n + gradeSides[k].quality.filter(q => q.level === 'bad' || q.level === 'warn').length, 0);
  return { savedAt: Date.now(), front: side(f), back: side(b), ceilings: ceilingsRecord(f, b), frontOnly: !b, photoIssues: issues };
}

function gradeThumbData(){
  const src = (gradeSides.front.flat || gradeSides.back.flat);
  if(!src) return null;
  const c = document.createElement('canvas');
  c.width = 120; c.height = 168;
  c.getContext('2d').drawImage(src, 0, 0, 120, 168);
  try{ return c.toDataURL('image/jpeg', 0.7); } catch(e){ return null; }
}

document.getElementById('gradeSaveOpen').addEventListener('click', () => {
  saveMsg.textContent = ''; saveMsg.classList.remove('is-error');
  if(!gradeSides.front.analyzed && !gradeSides.back.analyzed) return;
  const sel = document.getElementById('gradeSaveTarget');
  const sorted = [...state.collection].sort((a, b) => b.addedAt - a.addedAt);
  sel.innerHTML = '<option value="new">+ New entry</option>' + sorted.map(c =>
    `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)} · ${escapeHtml(gameNames[c.game] || c.game)}</option>`).join('');
  document.getElementById('gradeNewFields').style.display = 'flex';
  saveForm.style.display = 'flex';
});
document.getElementById('gradeSaveTarget').addEventListener('change', (e) => {
  document.getElementById('gradeNewFields').style.display = e.target.value === 'new' ? 'flex' : 'none';
});
document.getElementById('gradeSaveCancel').addEventListener('click', hideSaveForm);
document.getElementById('gradeSaveConfirm').addEventListener('click', () => {
  const target = document.getElementById('gradeSaveTarget').value;
  const record = buildGradingRecord();
  const thumb = gradeThumbData();
  if(target === 'new'){
    const name = document.getElementById('gradeSaveName').value.trim();
    if(!name){
      saveMsg.textContent = 'Give the card a name first.';
      saveMsg.classList.add('is-error');
      return;
    }
    state.collection.push({
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      game: document.getElementById('gradeSaveGame').value,
      name, meta: 'Condition check', img: null, gradeThumb: thumb,
      price: null, source: null, demo: false, addedAt: Date.now(), grading: record,
    });
  } else {
    const item = state.collection.find(c => c.id === target);
    if(!item) return;
    item.grading = record;
    item.gradeThumb = thumb;
  }
  saveCollection();
  updateCollectionBadge();
  saveForm.style.display = 'none';
  document.getElementById('gradeSaveName').value = '';
  saveMsg.classList.remove('is-error');
  saveMsg.textContent = 'Saved — find it on the Desk tab.';
});

function gradingChipsMarkup(c){
  const g = c.grading;
  if(!g) return '';
  const chips = [];
  if(g.front) chips.push(`<span class="grade-chip muted">Front ${g.front.lr[0]}/${g.front.lr[1]} · ${g.front.tb[0]}/${g.front.tb[1]}</span>`);
  if(g.back) chips.push(`<span class="grade-chip muted">Back ${g.back.lr[0]}/${g.back.lr[1]} · ${g.back.tb[0]}/${g.back.tb[1]}</span>`);
  if(g.ceilings){
    chips.push(`<span class="grade-chip">PSA ≤ ${escapeHtml(g.ceilings.psa)}</span>`);
    chips.push(`<span class="grade-chip">BGS ≤ ${escapeHtml(g.ceilings.bgs)}</span>`);
    chips.push(`<span class="grade-chip">CGC ≤ ${escapeHtml(g.ceilings.cgc)}</span>`);
  }
  if(g.frontOnly && g.front) chips.push('<span class="grade-chip muted">front only</span>');
  return `<div class="grade-chips" title="Centering-based ceilings, not predicted grades">${chips.join('')}</div>`;
}

