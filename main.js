// Cube Pop v2: frosted cube, snake arrows on the face grids. Rendering, input, hint, dialogs.
import * as THREE from './vendor/three.min.js?v=2';
const C = window.CUBE_CONFIG, G = window.CubeGame, A = window.CubeAudio;
const $ = (s) => document.querySelector(s);
document.title = C.NAME; $('#title').textContent = C.NAME;

// ---------- save (level progress carries over from v1; old power-up bank and stars are dropped) ----------
function freshSave() { return { level: 1, best: 1, muted: false, seenHelp: false }; }
let save = (() => {
  try {
    const s = JSON.parse(localStorage.getItem(C.SAVE_KEY)); if (s && s.best) return Object.assign(freshSave(), s);
    const o = JSON.parse(localStorage.getItem(C.OLD_SAVE_KEY));
    if (o && o.best) { localStorage.removeItem(C.OLD_SAVE_KEY); return Object.assign(freshSave(), { level: o.level || 1, best: o.best, muted: !!o.muted, seenHelp: false }); }
  } catch (e) {}
  return freshSave();
})();
const persist = () => { try { localStorage.setItem(C.SAVE_KEY, JSON.stringify(save)); } catch (e) {} };
A.setMuted(save.muted);

// ---------- three.js ----------
const canvas = $('#gl'), stage = $('#stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.sortObjects = true;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 500);
scene.add(new THREE.AmbientLight(0xffffff, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(2, 5, 8); scene.add(sun);
const pivot = new THREE.Group(); scene.add(pivot);
const world = new THREE.Group(); world.scale.setScalar(0.5); pivot.add(world); // children use doubled coordinates

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const ARROW_W = 0.95, HEAD_W = 1.75, HEAD_L = 0.85, LIFT = 0.06, GROOVE_LIFT = 0.025;
const arrowMat = new THREE.MeshBasicMaterial({ color: C.ARROW_COLOR, side: THREE.DoubleSide });
const hintMat = new THREE.MeshBasicMaterial({ color: C.HINT_COLOR, side: THREE.DoubleSide });
const blockedMat = new THREE.MeshBasicMaterial({ color: C.BLOCKED_COLOR, side: THREE.DoubleSide });
const blockerMat = new THREE.MeshBasicMaterial({ color: C.BLOCKER_COLOR, side: THREE.DoubleSide });
const nudgeMat = new THREE.MeshBasicMaterial({ color: 0x4f6bd8, side: THREE.DoubleSide });
const grooveEdgeMat = new THREE.MeshBasicMaterial({ color: 0xc3d3e8, side: THREE.DoubleSide, transparent: true, opacity: 1, depthWrite: false });
const grooveMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 1, depthWrite: false });

// ---------- arrow routes: the path a snake follows (body, then straight off the head's face) ----------
function routeFor(B, a) {
  const pts = [], nrm = [], Pc = (c) => V(B.cells[c].P), Nc = (c) => V(G.DIRS[B.cells[c].f]);
  const c0 = a.cells[0];
  pts.push(Pc(c0).addScaledVector(V(a.out[0]), -0.55));
  pts.push(Pc(c0)); nrm.push(Nc(c0));
  for (let k = 1; k < a.cells.length; k++) {
    const pc = a.cells[k - 1], c = a.cells[k];
    if (B.cells[pc].f !== B.cells[c].f) { pts.push(Pc(pc).add(V(a.out[k - 1]))); nrm.push(Nc(pc)); }
    pts.push(Pc(c)); nrm.push(Nc(c));
  }
  const h = a.cells[a.cells.length - 1], hd = V(G.headDir(a)), hn = Nc(h), Ph = Pc(h);
  pts.push(Ph.clone().addScaledVector(hd, 0.1)); nrm.push(hn);
  const bodyIdx = pts.length - 1;
  const toEdge = B.N - Ph.dot(hd);
  pts.push(Ph.clone().addScaledVector(hd, toEdge)); nrm.push(hn);
  pts.push(Ph.clone().addScaledVector(hd, toEdge + 6 * B.N + 40)); nrm.push(hn);
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  return { pts, nrm, cum, body: cum[bodyIdx], edge: cum[bodyIdx + 1] };
}
function pointAt(R, s) {
  let i = 1; while (i < R.cum.length - 1 && R.cum[i] < s) i++;
  const t = (s - R.cum[i - 1]) / Math.max(1e-6, R.cum[i] - R.cum[i - 1]);
  return { p: R.pts[i - 1].clone().lerp(R.pts[i], Math.max(0, Math.min(1, t))), seg: i - 1 };
}
// the part of the route between arc lengths s0..s1 as points + one normal per segment
function subRoute(R, s0, s1) {
  const a = pointAt(R, s0), b = pointAt(R, s1), pts = [a.p], nrm = [];
  for (let i = a.seg + 1; i <= b.seg; i++) { pts.push(R.pts[i].clone()); nrm.push(R.nrm[i - 1]); }
  pts.push(b.p); nrm.push(R.nrm[b.seg]);
  // drop zero-length pieces
  const P = [pts[0]], Nn = [];
  for (let i = 1; i < pts.length; i++) { if (pts[i].distanceTo(P[P.length - 1]) > 1e-4) { P.push(pts[i]); Nn.push(nrm[i - 1]); } }
  return { pts: P, nrm: Nn };
}
// thick rounded stroke with a pointed head, lying flat on the cube faces (folds cleanly over edges)
function strokeGeo(sub, w, lift, head, hw, hl) {
  const pos = [], { pts, nrm } = sub, tri = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const m = pts.length - 1; if (m < 1) return new THREE.BufferGeometry();
  for (let i = 0; i < m; i++) {
    const n = nrm[i], d = pts[i + 1].clone().sub(pts[i]).normalize(), side = d.clone().cross(n).multiplyScalar(w / 2);
    let A0 = pts[i].clone(), B0 = pts[i + 1].clone();
    if (i > 0 && !nrm[i - 1].equals(n)) A0.addScaledVector(d, -lift);
    if (i < m - 1 && !nrm[i + 1].equals(n)) B0.addScaledVector(d, lift);
    A0.addScaledVector(n, lift); B0.addScaledVector(n, lift);
    const a1 = A0.clone().add(side), a2 = A0.clone().sub(side), b1 = B0.clone().add(side), b2 = B0.clone().sub(side);
    tri(a1, b1, b2); tri(a1, b2, a2);
    if (i > 0 && nrm[i - 1].equals(n)) { // round joint
      const c = pts[i].clone().addScaledVector(n, lift), u = d.clone().multiplyScalar(w / 2), v = side;
      for (let k = 0; k < 12; k++) {
        const t0 = (k / 12) * Math.PI * 2, t1 = ((k + 1) / 12) * Math.PI * 2;
        tri(c, c.clone().addScaledVector(u, Math.cos(t0)).addScaledVector(v, Math.sin(t0)), c.clone().addScaledVector(u, Math.cos(t1)).addScaledVector(v, Math.sin(t1)));
      }
    }
  }
  if (head) {
    const n = nrm[m - 1], d = pts[m].clone().sub(pts[m - 1]).normalize(), side = d.clone().cross(n).multiplyScalar(hw / 2);
    const base = pts[m].clone().addScaledVector(n, lift * 1.05).addScaledVector(d, -0.05);
    tri(base.clone().add(side), base.clone().addScaledVector(d, hl), base.clone().sub(side));
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return g;
}

// ---------- level ----------
let lv = null, S = null, B = null, arrows = [], glass = null, statics = [], status = 'loading', hintId = null, hintReadyAt = 0;
let anims = [], lastAction = performance.now(), nudged = false, userZoom = 1, fitR = 5;

function gridTexture(N) {
  const px = 512, c = document.createElement('canvas'); c.width = c.height = px; const g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, px, px);
  g.strokeStyle = 'rgba(120,150,200,0.13)'; g.lineWidth = 2;
  for (let i = 1; i < N; i++) { const x = (i / N) * px; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, px); g.moveTo(0, x); g.lineTo(px, x); g.stroke(); }
  g.strokeStyle = 'rgba(120,150,200,0.35)'; g.lineWidth = 6; g.strokeRect(0, 0, px, px);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
}
function clearScene() {
  [...world.children].forEach((o) => { world.remove(o); o.traverse((x) => { if (x.geometry) x.geometry.dispose(); }); });
  arrows = []; statics = []; anims = [];
}
function loadLevel(n) {
  clearScene();
  lv = G.generateLevel(n); S = G.newState(lv); B = S.B; hintId = null; nudged = false; userZoom = 1;
  const N = lv.N;
  const gm = new THREE.MeshLambertMaterial({ color: 0xe6eef9, map: gridTexture(N), transparent: true, opacity: 0.86 });
  glass = new THREE.Mesh(new THREE.BoxGeometry(2 * N, 2 * N, 2 * N), gm); glass.renderOrder = 1; world.add(glass);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(glass.geometry), new THREE.LineBasicMaterial({ color: 0x9fb6d9, transparent: true, opacity: 0.8 }));
  edges.renderOrder = 4; world.add(edges);
  arrows = lv.arrows.map((a, id) => {
    const R = routeFor(B, a);
    const mesh = new THREE.Mesh(strokeGeo(subRoute(R, 0, R.body), ARROW_W, LIFT, true, HEAD_W, HEAD_L), arrowMat);
    mesh.userData.id = id; world.add(mesh);
    return { id, R, mesh, flying: false, busy: false };
  });
  pivot.quaternion.setFromEuler(new THREE.Euler(0.42, -0.6, 0));
  fitR = (N * Math.sqrt(3)) / 2; fit();
  const pal = C.PASTELS[(n - 1) % C.PASTELS.length];
  document.body.style.setProperty('--bg-top', mix('#9fd0ff', pal, 0.18));
  $('#level-label').textContent = 'LEVEL ' + n; $('#shape-name').textContent = N + ' × ' + N + ' cube';
  status = 'play'; save.level = n; persist(); updateHud(); lastAction = performance.now();
}
function mix(a, b, t) { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
function addGroove(a) {
  const sub = subRoute(a.R, 0, a.R.body);
  const e = new THREE.Mesh(strokeGeo(sub, ARROW_W * 0.78, GROOVE_LIFT, true, HEAD_W * 0.8, HEAD_L * 0.85), grooveEdgeMat); e.renderOrder = 2;
  const g = new THREE.Mesh(strokeGeo(sub, ARROW_W * 0.42, GROOVE_LIFT * 1.6, true, HEAD_W * 0.5, HEAD_L * 0.6), grooveMat); g.renderOrder = 3;
  world.add(e, g); statics.push(e, g);
}

function fit() {
  const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  const vf = THREE.MathUtils.degToRad(camera.fov) / 2, hf = Math.atan(Math.tan(vf) * camera.aspect);
  const d = (fitR * 0.96) / Math.sin(Math.min(vf, hf)) / userZoom;
  camera.position.set(0, 0, d); camera.lookAt(0, 0, 0); camera.far = d + 400; camera.updateProjectionMatrix();
}
new ResizeObserver(fit).observe(stage);
window.addEventListener('resize', fit); window.addEventListener('orientationchange', () => setTimeout(fit, 250));
if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);

// ---------- HUD ----------
function updateHud() { $('#count').textContent = S ? S.left : 0; $('#btn-sound').textContent = save.muted ? '🔇' : '🔊'; }
let toastT = 0;
function toast(msg, ms) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms || 1800); }

// ---------- animations ----------
function restMat(id) { return id === hintId ? hintMat : nudged === id ? nudgeMat : arrowMat; }
function setLook(id, m) { const a = arrows[id]; if (a && !a.flying) a.mesh.material = m; }
function drawAt(a, s, mat) { a.mesh.geometry.dispose(); a.mesh.geometry = strokeGeo(subRoute(a.R, s, s + a.R.body), ARROW_W, LIFT, true, HEAD_W, HEAD_L); if (mat) a.mesh.material = mat; }
function flyOff(id) {
  const a = arrows[id]; a.flying = true; if (hintId === id) hintId = null;
  const m = arrowMat.clone(); m.transparent = true; m.depthWrite = true; m.depthFunc = THREE.LessDepth; a.mesh.material = m; a.mesh.renderOrder = 5;
  addGroove(a);
  const total = a.R.cum[a.R.cum.length - 1] - a.R.body - 1;
  let s = 0, v = 16;
  anims.push({ t: 0, dur: 99, step(t, dt) {
    v += 95 * dt; s = Math.min(total, s + v * dt);
    drawAt(a, s);
    const past = s + a.R.body - a.R.edge; // how far the head is past the face edge
    m.opacity = past > 0 ? Math.max(0, 1 - past / (6 + a.R.body)) : 1;
    if (m.opacity <= 0 || s >= total) this.dur = 0;
  }, done() { world.remove(a.mesh); a.mesh.geometry.dispose(); m.dispose(); } });
}
function bump(id, blocker) {
  const a = arrows[id]; a.busy = true; setLook(id, blockedMat); setLook(blocker, blockerMat);
  anims.push({ t: 0, dur: 0.36, step(t) { const u = t / 0.36, k = u < 0.4 ? Math.sin((u / 0.4) * Math.PI / 2) : (1 - (u - 0.4) / 0.6) ** 2; drawAt(a, 0.68 * k); },
    done() { drawAt(a, 0); a.busy = false; } });
  anims.push({ t: 0, dur: 0.65, step() {}, done() { setLook(id, restMat(id)); setLook(blocker, restMat(blocker)); } });
  const b = arrows[blocker], p0 = b.mesh.position.clone(), n = V(G.DIRS[B.cells[lv.arrows[blocker].cells[0]].f]);
  anims.push({ t: 0, dur: 0.3, step(t) { if (!b.flying) b.mesh.position.copy(p0).addScaledVector(n, Math.sin(t * 45) * 0.12 * (1 - t / 0.3)); }, done() { if (!b.flying) b.mesh.position.copy(p0); } });
}
let rotTo = null;
function showFace(f) { // turn the cube so face f looks toward you
  const v = V(G.DIRS[f]).applyQuaternion(pivot.quaternion), want = new THREE.Vector3(0.28, 0.3, 1).normalize();
  if (v.dot(want) > 0.8) return;
  rotTo = { from: pivot.quaternion.clone(), to: new THREE.Quaternion().setFromUnitVectors(v, want).multiply(pivot.quaternion), t: 0 };
}

// ---------- picking: find the face cell under the finger, then the arrow on it (or the closest one) ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pick(clientX, clientY) {
  if (!glass) return null;
  const r = canvas.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObject(glass, false)[0]; if (!hit) return null;
  const p = glass.worldToLocal(hit.point.clone()), f = G.dirIndex([Math.round(hit.face.normal.x), Math.round(hit.face.normal.y), Math.round(hit.face.normal.z)]);
  const N = lv.N, U = G.UF[f], Vv = G.VF[f], pu = p.x * U[0] + p.y * U[1] + p.z * U[2], pv = p.x * Vv[0] + p.y * Vv[1] + p.z * Vv[2];
  let best = null, bd = 1.45; // within ~0.7 cell of a stroke center
  const ci = Math.floor((pu + N) / 2), cj = Math.floor((pv + N) / 2);
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= N || j >= N) continue;
    const id = S.occ[f * N * N + j * N + i]; if (id < 0 || arrows[id].flying) continue;
    const d = Math.hypot(pu - (2 * i + 1 - N), pv - (2 * j + 1 - N));
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}
function tapPoint(id) { // a screen point that picks this arrow (idle nudge + tests)
  const a = arrows[id]; if (!a || a.flying) return null;
  pivot.updateMatrixWorld(true);
  const r = canvas.getBoundingClientRect();
  for (const c of lv.arrows[id].cells) {
    const cell = B.cells[c], wp = glass.localToWorld(V(cell.P).addScaledVector(V(G.DIRS[cell.f]), 0.1)).project(camera);
    if (Math.abs(wp.x) > 0.97 || Math.abs(wp.y) > 0.97) continue;
    const x = r.left + ((wp.x + 1) / 2) * r.width, y = r.top + ((1 - wp.y) / 2) * r.height;
    if (pick(x, y) === id) return { x, y };
  }
  return null;
}

// ---------- tapping ----------
let combo = 0;
function onTap(x, y) {
  if (status !== 'play') return;
  const id = pick(x, y); if (id == null) return;
  lastAction = performance.now(); clearNudge();
  if (arrows[id].busy) return;
  const r = G.tap(S, id);
  if (r.ok) { flyOff(id); A.pop(combo++); A.whoosh(); updateHud(); bumpCounter(); if (S.left === 0) { status = 'won'; setTimeout(win, 900); } }
  else if (r.why === 'blocked') { combo = 0; A.bonk(); bump(id, r.blocker); if (navigator.vibrate) navigator.vibrate(12); }
}
function bumpCounter() { const c = $('#counter'); c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }

// ---------- lightbulb hint: free, unlimited, short cooldown ----------
function hint() {
  A.unlock(); if (status !== 'play') return;
  const now = performance.now(); if (now < hintReadyAt) return;
  const free = G.freeArrows(S).filter((id) => !arrows[id].busy); if (!free.length) return;
  if (hintId != null) setLook(hintId, arrowMat);
  const vis = free.filter((id) => tapPoint(id));
  hintId = vis.length ? vis[Math.floor(Math.random() * vis.length)] : free[0];
  if (!vis.length) showFace(B.cells[lv.arrows[hintId].cells[lv.arrows[hintId].cells.length - 1]].f);
  setLook(hintId, hintMat); A.sparkle(); lastAction = now; clearNudge();
  hintReadyAt = now + C.HINT_COOLDOWN * 1000;
}
$('#btn-hint').addEventListener('click', hint);

// ---------- idle nudge ----------
function clearNudge() {
  $('#btn-hint').classList.remove('nudge');
  if (nudged !== false && nudged !== true) setLook(nudged, restMat(-1));
  nudged = false;
}
function idleCheck(now) {
  if (status !== 'play' || nudged !== false || !$('#modal').classList.contains('hidden')) return;
  if (now - lastAction < C.IDLE_NUDGE_SECONDS * 1000) return;
  nudged = true; $('#btn-hint').classList.add('nudge');
}

// ---------- input: drag to spin, tap to clear, pinch / wheel to zoom ----------
const ptrs = new Map(); let drag = null, vel = { x: 0, y: 0 }, pinch0 = 0, zoom0 = 1;
function rotateBy(dx, dy) {
  const k = 0.008;
  pivot.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * k))
    .premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy * k));
}
const app = $('#app');
app.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, #modal')) return;
  A.unlock(); rotTo = null;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { app.setPointerCapture(e.pointerId); } catch (_) {}
  if (ptrs.size === 1) { drag = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moved: false, multi: false }; vel = { x: 0, y: 0 }; }
  else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = userZoom; if (drag) drag.multi = true; }
});
app.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0 > 0) { userZoom = THREE.MathUtils.clamp(zoom0 * d / pinch0, 0.6, 2.5); fit(); } return; }
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 9) drag.moved = true;
  if (drag.moved) { rotateBy(dx, dy); vel = { x: dx, y: dy }; lastAction = performance.now(); }
  drag.x = e.clientX; drag.y = e.clientY;
});
function endPtr(e) {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (drag && ptrs.size === 0) {
    if (!drag.moved && !drag.multi && e.type === 'pointerup') onTap(e.clientX, e.clientY);
    if (!drag.moved) vel = { x: 0, y: 0 };
    drag = null;
  }
}
app.addEventListener('pointerup', endPtr); app.addEventListener('pointercancel', endPtr);
app.addEventListener('wheel', (e) => { e.preventDefault(); userZoom = THREE.MathUtils.clamp(userZoom * Math.exp(-e.deltaY * 0.001), 0.6, 2.5); fit(); }, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ---------- loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!drag && Math.abs(vel.x) + Math.abs(vel.y) > 0.05) { rotateBy(vel.x, vel.y); vel.x *= 0.9; vel.y *= 0.9; }
  if (rotTo) { rotTo.t = Math.min(1, rotTo.t + dt / 0.6); pivot.quaternion.slerpQuaternions(rotTo.from, rotTo.to, 1 - (1 - rotTo.t) ** 3); if (rotTo.t >= 1) rotTo = null; }
  for (let i = anims.length - 1; i >= 0; i--) { const a = anims[i]; a.t += dt; a.step.call(a, Math.min(a.t, a.dur), dt); if (a.t >= a.dur) { anims.splice(i, 1); a.done && a.done(); } }
  if (hintId != null) hintMat.color.set(C.HINT_COLOR).lerp(new THREE.Color(0xffffff), 0.25 + 0.25 * Math.sin(now / 150));
  const cd = Math.max(0, (hintReadyAt - now) / (C.HINT_COOLDOWN * 1000));
  const hb = $('#btn-hint'); hb.style.setProperty('--cd', cd.toFixed(3)); hb.classList.toggle('cooling', cd > 0);
  idleCheck(now);
  renderer.render(scene, camera);
  confettiStep(dt);
  requestAnimationFrame(frame);
}

// ---------- confetti ----------
const cf = $('#confetti'), cg = cf.getContext('2d'); let bits = [];
function confetti() {
  const W = (cf.width = innerWidth * 2), H = (cf.height = innerHeight * 2);
  bits = []; for (let i = 0; i < 160; i++) bits.push({ x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.42, vx: (Math.random() - 0.5) * 34, vy: -Math.random() * 34 - 12, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: C.PASTELS[i % C.PASTELS.length], w: 16 + Math.random() * 14, h: 10 + Math.random() * 10, life: 3 });
}
function confettiStep(dt) {
  if (!bits.length) return; cg.clearRect(0, 0, cf.width, cf.height);
  bits.forEach((b) => { b.vy += 60 * dt; b.vx *= 0.99; b.x += b.vx * dt * 30; b.y += b.vy * dt * 15; b.r += b.vr; b.life -= dt;
    cg.save(); cg.globalAlpha = Math.max(0, Math.min(1, b.life)); cg.translate(b.x, b.y); cg.rotate(b.r); cg.fillStyle = b.c; cg.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); cg.restore(); });
  bits = bits.filter((b) => b.life > 0 && b.y < cf.height + 40); if (!bits.length) cg.clearRect(0, 0, cf.width, cf.height);
}

// ---------- dialogs ----------
let modalName = null;
function modal(title, html, buttons, hideTitle) {
  modalName = title; $('#m-title').textContent = title; $('#m-title').classList.toggle('hidden-title', !!hideTitle); $('#m-body').innerHTML = html;
  const box = $('#m-buttons'); box.innerHTML = '';
  buttons.forEach(([label, fn, cls]) => {
    const b = document.createElement('button'); b.className = 'btn ' + (cls || ''); b.textContent = label;
    b.onclick = () => { A.click(); closeModal(); fn && fn(); lastAction = performance.now(); }; box.appendChild(b);
  });
  $('#modal').classList.remove('hidden');
}
function closeModal() { $('#modal').classList.add('hidden'); modalName = null; }
function help(after) {
  modal('How to play', `<div class="howto">
    <div><b class="i">👆</b><span><b>Tap an arrow</b>. It slides along its path and zooms off the cube the way its head points.</span></div>
    <div><b class="i">🚧</b><span>It can only leave if <b>no other arrow is straight ahead</b> of its head on that side. Blocked arrows just bounce back. No penalty, ever.</span></div>
    <div><b class="i">🔄</b><span><b>Drag</b> to spin the cube, pinch to zoom. Arrows wrap around the edges, so check every side.</span></div>
    <div><b class="i">💡</b><span>Stuck? The lightbulb is free. It lights up an arrow you can clear next.</span></div></div>`,
    [["Let's play!", () => { save.seenHelp = true; persist(); after && after(); }, 'primary']]);
}
function win() {
  const n = lv.n;
  if (n >= save.best) save.best = n + 1;
  persist(); A.chime(); confetti();
  modal('Level ' + n + ' complete!', `<div class="ribbon">Level ${n} complete!</div><div class="bigcheck">🎉</div><p>Every arrow cleared. Nice!</p>`,
    [['Next ▶', () => loadLevel(n + 1), 'primary'], ['Play again', () => loadLevel(n)]], true);
}
function levelsHtml() {
  let h = '<div class="levels">'; const top = Math.max(save.best, 1);
  for (let i = 1; i <= Math.max(top, 20); i++) h += `<button data-l="${i}" class="${i === lv.n ? 'cur' : ''}" ${i > top ? 'disabled' : ''}>${i}<small>${G.sizeFor(i)}×${G.sizeFor(i)}</small></button>`;
  return h + '</div>';
}
function settings() {
  modal('Settings', `<p style="margin-top:0">Pick a level to play:</p>${levelsHtml()}`, [
    [save.muted ? '🔇 Sound: Off' : '🔊 Sound: On', () => { toggleMute(); settings(); }],
    ['↺ Restart this level', () => loadLevel(lv.n)],
    ['❓ How to play', () => help()],
    ['Reset all progress', () => modal('Reset progress?', '<p>This puts you back to level 1 on this device.</p>', [
      ['Yes, reset', () => { save = freshSave(); save.seenHelp = true; persist(); A.setMuted(false); loadLevel(1); }, 'danger'], ['Cancel', null]]), 'danger'],
    ['Close', null, 'primary']
  ]);
  document.querySelectorAll('.levels button').forEach((b) => (b.onclick = () => { A.click(); closeModal(); loadLevel(+b.dataset.l); }));
}
function toggleMute() { save.muted = !save.muted; A.setMuted(save.muted); persist(); updateHud(); }
$('#btn-settings').addEventListener('click', () => { A.unlock(); A.click(); settings(); });
$('#btn-sound').addEventListener('click', () => { A.unlock(); toggleMute(); A.click(); toast(save.muted ? 'Sound off' : 'Sound on'); });
$('#modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal' && modalName === 'Settings') closeModal(); });

// ---------- start ----------
loadLevel(Math.max(1, Math.min(save.level || 1, save.best || 1)));
$('#loading').classList.add('hidden');
requestAnimationFrame(frame);
if (!save.seenHelp) help();

// test / debug hooks
window.__cp = {
  get S() { return S; }, get lv() { return lv; }, get save() { return save; }, get status() { return status; }, get modal() { return modalName; },
  get busy() { return anims.length > 0 || !!rotTo; }, get hintId() { return hintId; }, get hintReadyAt() { return hintReadyAt; },
  quat() { return pivot.quaternion.toArray(); }, look(id) { return arrows[id] && arrows[id].mesh.material === blockedMat ? 'blocked' : arrows[id].mesh.material === hintMat ? 'hint' : 'normal'; },
  tapPoint, pick, freeArrows: () => G.freeArrows(S).filter((id) => !arrows[id].busy), loadLevel, ready: true,
  grooves: () => statics.length / 2
};
