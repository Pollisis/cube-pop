// Cube Pop: rendering, input, power-ups, dialogs.
import * as THREE from './vendor/three.min.js?v=1';
const C = window.CUBE_CONFIG, G = window.CubeGame, A = window.CubeAudio;
const $ = (s) => document.querySelector(s);
document.title = C.NAME; $('#title').textContent = C.NAME;

// ---------- save ----------
const PW = Object.keys(C.POWERUPS);
function freshSave() { const bank = {}; PW.forEach((k) => (bank[k] = C.POWERUPS[k].start)); return { level: 1, best: 1, stars: {}, bank, muted: false, seenHelp: false }; }
let save = (() => { try { const s = JSON.parse(localStorage.getItem(C.SAVE_KEY)); if (s && s.bank) return Object.assign(freshSave(), s); } catch (e) {} return freshSave(); })();
const persist = () => { try { localStorage.setItem(C.SAVE_KEY, JSON.stringify(save)); } catch (e) {} };
A.setMuted(save.muted);

// ---------- three.js setup ----------
const canvas = $('#gl'), stage = $('#stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 500);
scene.add(new THREE.AmbientLight(0xffffff, 1.9));
const sun = new THREE.DirectionalLight(0xffffff, 1.3); sun.position.set(3, 6, 8); scene.add(sun);
const fill = new THREE.DirectionalLight(0xe8e4ff, 0.5); fill.position.set(-6, -3, 2); scene.add(fill);
const pivot = new THREE.Group(); scene.add(pivot);
const holder = new THREE.Group(); pivot.add(holder);

// face textures: white tile, thick dark outline, bold arrow
const NF = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const UF = [[0, 0, -1], [0, 0, 1], [1, 0, 0], [1, 0, 0], [1, 0, 0], [-1, 0, 0]];
const VF = [[0, 1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [0, 1, 0], [0, 1, 0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function faceKind(d, f) {
  const D = G.DIRS[d];
  const n = dot(D, NF[f]); if (n === 1) return 'head'; if (n === -1) return 'tail';
  const u = dot(D, UF[f]), v = dot(D, VF[f]);
  return u === 1 ? 'right' : u === -1 ? 'left' : v === 1 ? 'up' : 'down';
}
function rrect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
const texCache = {};
function faceTex(kind) {
  if (texCache[kind]) return texCache[kind];
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.fillStyle = '#1d1f3a'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#ffffff'; rrect(g, 16, 16, S - 32, S - 32, 34); g.fill();
  g.fillStyle = C.ARROW_COLOR; g.strokeStyle = C.ARROW_COLOR; g.lineCap = 'round'; g.lineJoin = 'round';
  if (kind === 'head') { g.beginPath(); g.arc(S / 2, S / 2, 34, 0, Math.PI * 2); g.fill(); }
  else if (kind === 'tail') { g.lineWidth = 12; g.globalAlpha = 0.18; g.beginPath(); g.arc(S / 2, S / 2, 30, 0, Math.PI * 2); g.stroke(); }
  else {
    const ang = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }[kind];
    g.translate(S / 2, S / 2); g.rotate(ang);
    g.lineWidth = 30; g.beginPath(); g.moveTo(0, 74); g.lineTo(0, -30); g.stroke();
    g.beginPath(); g.moveTo(0, -84); g.lineTo(52, -18); g.lineTo(-52, -18); g.closePath(); g.lineWidth = 14; g.fill(); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return (texCache[kind] = t);
}
const TINTS = { normal: 0xffffff, blocked: 0x8fb8ff, blocker: 0xffb3c7, hint: 0xffe07a, nudge: 0xfff1b8, hammer: 0xffc89e };
const matCache = {};
function mat(kind, tint) {
  const k = kind + '|' + tint; if (matCache[k]) return matCache[k];
  return (matCache[k] = new THREE.MeshLambertMaterial({ map: faceTex(kind), color: typeof tint === 'number' ? tint : TINTS[tint] }));
}
function mats(d, tint) { const a = []; for (let f = 0; f < 6; f++) a.push(mat(faceKind(d, f), tint)); return a; }
const boxGeo = new THREE.BoxGeometry(0.97, 0.97, 0.97);

// ---------- level state ----------
let lv = null, S = null, meshes = {}, core = null, used = 0, combo = 0, status = 'loading', hammerMode = false, hintId = null;
let anims = [], lastAction = performance.now(), nudged = false, userZoom = 1, fitDist = 10;

function clearScene() {
  Object.values(meshes).forEach((m) => holder.remove(m)); meshes = {};
  if (core) { holder.remove(core); core.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); core = null; }
  anims = [];
}
function loadLevel(n) {
  clearScene();
  lv = G.generateLevel(n); S = G.newState(lv); used = 0; combo = 0; hammerMode = false; hintId = null; nudged = false; userZoom = 1;
  const cx = lv.max[0] / 2, cy = lv.max[1] / 2, cz = lv.max[2] / 2;
  holder.position.set(-cx, -cy, -cz);
  lv.blocks.forEach((b) => {
    const m = new THREE.Mesh(boxGeo, mats(b.d, 'normal'));
    m.position.set(b.p[0], b.p[1], b.p[2]); m.userData.id = b.id; m.userData.tint = 'normal';
    holder.add(m); meshes[b.id] = m;
  });
  // the soft see-through core that shows where popped blocks used to be
  const sz = [lv.max[0] + 1, lv.max[1] + 1, lv.max[2] + 1];
  const cg = new THREE.BoxGeometry(sz[0] * 0.9, sz[1] * 0.9, sz[2] * 0.9);
  core = new THREE.Group();
  core.add(new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false })));
  core.add(new THREE.LineSegments(new THREE.EdgesGeometry(cg), new THREE.LineBasicMaterial({ color: 0x9b90d8, transparent: true, opacity: 0.5 })));
  core.position.set(cx, cy, cz); holder.add(core);
  pivot.quaternion.setFromEuler(new THREE.Euler(0.45, -0.62, 0));
  const ext = Math.sqrt(sz[0] * sz[0] + sz[1] * sz[1] + sz[2] * sz[2]) / 2;
  fitDist = ext; fit();
  const pal = C.PASTELS[(n - 1) % C.PASTELS.length];
  document.body.style.setProperty('--bg-top', mix('#cfc7ff', pal, 0.35));
  $('#level-label').textContent = 'LEVEL ' + n; $('#shape-name').textContent = lv.name;
  status = 'play'; save.level = n; persist(); updateHud(); lastAction = performance.now();
}
function mix(a, b, t) { const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); }

function fit() {
  const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
  renderer.setSize(w, h, false); camera.aspect = w / h;
  const vf = THREE.MathUtils.degToRad(camera.fov) / 2, hf = Math.atan(Math.tan(vf) * camera.aspect);
  const d = (fitDist * 1.0) / Math.sin(Math.min(vf, hf)) / userZoom;
  camera.position.set(0, 0, d); camera.lookAt(0, 0, 0); camera.near = 0.1; camera.far = d + 100; camera.updateProjectionMatrix();
}
new ResizeObserver(fit).observe(stage);
window.addEventListener('resize', fit); window.addEventListener('orientationchange', () => setTimeout(fit, 250));
if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);

// ---------- HUD ----------
function updateHud() {
  $('#count').textContent = S ? S.left : 0;
  document.querySelectorAll('.pw').forEach((b) => {
    const k = b.dataset.pw, P = C.POWERUPS[k], locked = save.best < P.unlock, n = save.bank[k] || 0;
    b.classList.toggle('locked', locked); b.classList.toggle('empty', !locked && n === 0);
    b.querySelector('.badge').textContent = locked ? '🔒' : n;
    b.classList.toggle('active', k === 'hammer' && hammerMode);
  });
  $('#btn-sound').textContent = save.muted ? '🔇' : '🔊';
}
let toastT = 0;
function toast(msg, ms) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms || 1800); }

// ---------- animations ----------
function setTint(id, tint) { const m = meshes[id]; if (!m || m.userData.flying) return; m.userData.tint = tint; m.material = mats(S.byId[id].d, tint); }
function flyOff(id, delay) {
  const m = meshes[id], b = S.byId[id], D = G.DIRS[b.d]; m.userData.flying = true;
  const pastel = new THREE.Color(C.PASTELS[(id * 3 + lv.n) % C.PASTELS.length]).getHex();
  const own = mats(b.d, pastel).map((x) => { const c = x.clone(); c.transparent = true; return c; });
  m.material = own;
  const p0 = m.position.clone();
  anims.push({ t: -(delay || 0), dur: 0.75, step(t) {
    if (t < 0) return;
    const s = 5 * t + 34 * t * t;
    m.position.set(p0.x + D[0] * s, p0.y + D[1] * s, p0.z + D[2] * s);
    const k = Math.min(1, t / 0.75); m.scale.setScalar(1 + 0.25 * Math.sin(Math.min(1, t * 8) * Math.PI) * 0.4);
    own.forEach((x) => (x.opacity = 1 - k * k));
  }, done() { holder.remove(m); own.forEach((x) => x.dispose()); delete meshes[id]; } });
}
function bump(id, blocker, dist) {
  const m = meshes[id], D = G.DIRS[S.byId[id].d], p0 = m.position.clone(), reach = dist - 1 + 0.16;
  setTint(id, 'blocked'); setTint(blocker, 'blocker');
  m.userData.busy = true;
  anims.push({ t: 0, dur: 0.42, step(t) {
    const u = t / 0.42, s = u < 0.45 ? reach * Math.sin((u / 0.45) * Math.PI / 2) : reach * (1 - (u - 0.45) / 0.55) ** 2;
    m.position.set(p0.x + D[0] * s, p0.y + D[1] * s, p0.z + D[2] * s);
  }, done() { m.position.copy(p0); m.userData.busy = false; } });
  anims.push({ t: 0, dur: 0.6, step() {}, done() { if (meshes[id]) setTint(id, id === hintId ? 'hint' : 'normal'); if (meshes[blocker]) setTint(blocker, blocker === hintId ? 'hint' : 'normal'); } });
  const bm = meshes[blocker], q0 = bm.position.clone();
  anims.push({ t: 0, dur: 0.3, step(t) { if (bm.userData.flying) return; const w = Math.sin(t * 50) * 0.05 * (1 - t / 0.3); bm.position.set(q0.x + D[0] * w, q0.y + D[1] * w, q0.z + D[2] * w); }, done() { if (!bm.userData.flying) bm.position.copy(q0); } });
}
let rotTo = null;
function lookAtBlock(id) { // turn the shape so the block's arrow side faces you
  const D = G.DIRS[S.byId[id].d], v = new THREE.Vector3(D[0], D[1], D[2]).applyQuaternion(pivot.quaternion);
  const want = new THREE.Vector3(0.35, 0.3, 1).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(v, want).multiply(pivot.quaternion);
  rotTo = { from: pivot.quaternion.clone(), to: q, t: 0 };
}

// ---------- picking ----------
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pick(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const list = Object.values(meshes).filter((m) => !m.userData.flying);
  const hit = ray.intersectObjects(list, false)[0];
  return hit ? hit.object.userData.id : null;
}
// screen point that really hits this block (used by the idle nudge and by tests)
function tapPoint(id) {
  const m = meshes[id]; if (!m || m.userData.flying) return null;
  pivot.updateMatrixWorld(true);
  const r = canvas.getBoundingClientRect(), offs = [[0, 0], [0.25, 0.25], [-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25]];
  for (let f = 0; f < 6; f++) for (const o of offs) {
    const N = NF[f], U = UF[f], V = VF[f];
    const lp = new THREE.Vector3(N[0] * 0.48 + U[0] * o[0] + V[0] * o[1], N[1] * 0.48 + U[1] * o[0] + V[1] * o[1], N[2] * 0.48 + U[2] * o[0] + V[2] * o[1]);
    const wp = m.localToWorld(lp).project(camera);
    if (Math.abs(wp.x) > 0.98 || Math.abs(wp.y) > 0.98) continue;
    const x = r.left + ((wp.x + 1) / 2) * r.width, y = r.top + ((1 - wp.y) / 2) * r.height;
    if (pick(x, y) === id) return { x, y };
  }
  return null;
}

// ---------- tapping ----------
function onTap(x, y) {
  if (status !== 'play') return;
  const id = pick(x, y); if (id == null) return;
  lastAction = performance.now(); clearNudge();
  if (meshes[id].userData.busy) return;
  if (hammerMode) {
    hammerMode = false; spend('hammer'); G.force(S, id); popFx(id); afterPop(); return;
  }
  const r = G.tap(S, id);
  if (r.ok) { popFx(id); afterPop(); }
  else if (r.why === 'blocked') { combo = 0; A.bonk(); bump(id, r.blocker, r.dist); if (navigator.vibrate) navigator.vibrate(12); }
}
function popFx(id) { if (id === hintId) hintId = null; flyOff(id); A.pop(combo++); A.whoosh(); }
function afterPop() {
  updateHud(); const c = $('#count'); c.parentElement.classList.remove('bump'); void c.offsetWidth; c.parentElement.classList.add('bump');
  if (S.left === 0) { status = 'won'; setTimeout(win, 650); }
}
function spend(k) { save.bank[k] = Math.max(0, (save.bank[k] || 0) - 1); used++; persist(); updateHud(); }

// ---------- power-ups ----------
function visibleFree() { return G.freeBlocks(S).filter((id) => meshes[id] && !meshes[id].userData.flying && !meshes[id].userData.busy); }
const POWER = {
  hint() {
    const free = visibleFree(); if (!free.length) return;
    if (hintId != null && meshes[hintId]) setTint(hintId, 'normal');
    hintId = free.find((id) => tapPoint(id)) ?? free[0];
    if (!tapPoint(hintId)) lookAtBlock(hintId);
    setTint(hintId, 'hint'); spend('hint'); A.sparkle(); toast('Tap the glowing block!');
  },
  hammer() { hammerMode = true; updateHud(); toast('Tap any block to pop it', 2600); },
  wand() {
    let free = visibleFree(), n = 0; spend('wand'); A.sparkle();
    const go = () => {
      free = visibleFree(); if (!free.length || n >= C.WAND_POPS || status !== 'play') return;
      const id = free[Math.floor(Math.random() * free.length)]; G.tap(S, id); popFx(id); afterPop(); n++; setTimeout(go, 140);
    };
    go();
  }
};
document.querySelectorAll('.pw').forEach((b) => b.addEventListener('click', () => {
  A.unlock(); A.click(); if (status !== 'play') return;
  const k = b.dataset.pw, P = C.POWERUPS[k], n = save.bank[k] || 0;
  if (k === 'hammer' && hammerMode) { hammerMode = false; updateHud(); toast('Hammer put away'); return; }
  if (save.best < P.unlock) { modal('🔒 ' + P.label, `<p>${P.desc}</p><p>Unlocks at level ${P.unlock}.</p>`, [['OK', null, 'primary']]); return; }
  if (!n) { modal(P.icon + ' ' + P.label, `<p>${P.desc}</p><p>You're out of these. Clear levels to earn more!</p>`, [['OK', null, 'primary']]); return; }
  modal(P.icon + ' ' + P.label + '?', `<p>${P.desc}</p><p>You have <b>${n}</b>. Using one means 2 stars max this level.</p>`,
    [['Use it', () => POWER[k](), 'primary'], ['Not now', null]]);
}));

// ---------- idle nudge ----------
function clearNudge() {
  document.querySelectorAll('.pw.nudge').forEach((b) => b.classList.remove('nudge'));
  if (nudged && nudged !== true && meshes[nudged] && meshes[nudged].userData.tint === 'nudge') setTint(nudged, 'normal');
  nudged = false;
}
function idleCheck(now) {
  if (status !== 'play' || nudged || !$('#modal').classList.contains('hidden')) return;
  if (now - lastAction < C.IDLE_NUDGE_SECONDS * 1000) return;
  nudged = true;
  if ((save.bank.hint || 0) > 0) $('.pw[data-pw="hint"]').classList.add('nudge');
  if (lv.n <= 3) { const id = visibleFree().find((i) => tapPoint(i)); if (id != null) { setTint(id, 'nudge'); nudged = id; } }
}

// ---------- input: drag to spin, tap to pop, pinch/wheel to zoom ----------
const ptrs = new Map(); let drag = null, vel = { x: 0, y: 0 }, pinch0 = 0, zoom0 = 1;
function rotateBy(dx, dy) {
  const k = 0.0085;
  const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * k);
  const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy * k);
  pivot.quaternion.premultiply(qy).premultiply(qx);
}
const app = $('#app');
app.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, #modal')) return;
  A.unlock(); rotTo = null;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { app.setPointerCapture(e.pointerId); } catch (_) {}
  if (ptrs.size === 1) { drag = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t: performance.now(), moved: false, multi: false }; vel = { x: 0, y: 0 }; }
  else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = userZoom; if (drag) drag.multi = true; }
});
app.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0 > 0) { userZoom = THREE.MathUtils.clamp(zoom0 * d / pinch0, 0.6, 2); fit(); } return; }
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
app.addEventListener('wheel', (e) => { e.preventDefault(); userZoom = THREE.MathUtils.clamp(userZoom * Math.exp(-e.deltaY * 0.001), 0.6, 2); fit(); }, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ---------- loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!drag && (Math.abs(vel.x) + Math.abs(vel.y)) > 0.05) { rotateBy(vel.x, vel.y); vel.x *= 0.9; vel.y *= 0.9; }
  if (rotTo) { rotTo.t = Math.min(1, rotTo.t + dt / 0.6); const e = 1 - (1 - rotTo.t) ** 3; pivot.quaternion.slerpQuaternions(rotTo.from, rotTo.to, e); if (rotTo.t >= 1) rotTo = null; }
  for (let i = anims.length - 1; i >= 0; i--) { const a = anims[i]; a.t += dt; a.step(Math.min(a.t, a.dur)); if (a.t >= a.dur) { anims.splice(i, 1); a.done && a.done(); } }
  if (hintId != null && meshes[hintId]) { const s = 1 + 0.05 * Math.sin(now / 140); meshes[hintId].scale.setScalar(s); }
  if (nudged !== false && nudged !== true && meshes[nudged]) { meshes[nudged].rotation.z = Math.sin(now / 90) * 0.06 * (Math.sin(now / 600) > 0 ? 1 : 0); }
  idleCheck(now);
  renderer.render(scene, camera);
  confettiStep(dt);
  requestAnimationFrame(frame);
}

// ---------- confetti ----------
const cf = $('#confetti'), cg = cf.getContext('2d'); let bits = [];
function confetti() {
  const W = (cf.width = innerWidth * 2), H = (cf.height = innerHeight * 2);
  bits = []; for (let i = 0; i < 140; i++) bits.push({ x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.42, vx: (Math.random() - 0.5) * 34, vy: -Math.random() * 34 - 12, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: C.PASTELS[i % C.PASTELS.length], w: 16 + Math.random() * 14, h: 10 + Math.random() * 10, life: 3 });
}
function confettiStep(dt) {
  if (!bits.length) return; cg.clearRect(0, 0, cf.width, cf.height);
  bits.forEach((b) => { b.vy += 60 * dt; b.vx *= 0.99; b.x += b.vx * dt * 30; b.y += b.vy * dt * 30 * 0.5; b.r += b.vr; b.life -= dt;
    cg.save(); cg.globalAlpha = Math.max(0, Math.min(1, b.life)); cg.translate(b.x, b.y); cg.rotate(b.r); cg.fillStyle = b.c; cg.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); cg.restore(); });
  bits = bits.filter((b) => b.life > 0 && b.y < cf.height + 40); if (!bits.length) cg.clearRect(0, 0, cf.width, cf.height);
}

// ---------- dialogs ----------
let modalName = null;
function modal(title, html, buttons) {
  modalName = title; $('#m-title').textContent = title; $('#m-body').innerHTML = html;
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
    <div><b class="i">👆</b><span><b>Tap a block</b> to send it flying the way its arrow points.</span></div>
    <div><b class="i">⚫</b><span>A <b>dot</b> means the arrow points straight at you.</span></div>
    <div><b class="i">🚧</b><span>It only goes if <b>nothing is in its way</b>. Blocked? No problem, it just bounces back.</span></div>
    <div><b class="i">🔄</b><span><b>Drag</b> anywhere to spin the shape. Pinch to zoom.</span></div>
    <div><b class="i">🎉</b><span>Pop every block to clear the level. No timer, no lives.</span></div>
    <div><b class="i">💡</b><span>Stuck? Hints and other helpers are free and saved for later.</span></div></div>`,
    [["Let's play!", () => { save.seenHelp = true; persist(); after && after(); }, 'primary']]);
}
function win() {
  const n = lv.n, stars = G.starsFor(used), first = n >= save.best;
  save.stars[n] = Math.max(save.stars[n] || 0, stars);
  const rewards = [];
  if (first) {
    save.best = n + 1;
    PW.forEach((k) => { const P = C.POWERUPS[k]; if (n + 1 >= P.unlock && n % P.every === 0) { save.bank[k] = (save.bank[k] || 0) + 1; rewards.push(P.icon + ' +1'); } });
    PW.forEach((k) => { if (C.POWERUPS[k].unlock === n + 1) rewards.push(C.POWERUPS[k].icon + ' unlocked!'); });
  }
  persist(); A.chime(); confetti();
  modal('Level ' + n + ' clear!', `<div class="stars"><span>⭐</span><span>⭐</span><span>⭐</span></div>
    <p>${stars === 3 ? 'Perfect! No helpers needed.' : stars === 2 ? 'Nice work!' : 'You did it!'}</p>
    ${rewards.length ? '<div>' + rewards.map((r) => `<span class="reward">${r}</span>`).join('') + '</div>' : ''}`,
    [['Next level ▶', () => loadLevel(n + 1), 'primary'], ['Play again', () => loadLevel(n)]]);
  const ss = document.querySelectorAll('.stars span');
  for (let i = 0; i < stars; i++) setTimeout(() => { ss[i] && ss[i].classList.add('on'); A.star(i); }, 350 + i * 280);
  updateHud();
}
function levelsHtml() {
  let h = '<div class="levels">'; const top = Math.max(save.best, 1) + 0;
  for (let i = 1; i <= Math.max(top, 20); i++) {
    const s = save.stars[i] || 0;
    h += `<button data-l="${i}" class="${i === lv.n ? 'cur' : ''}" ${i > top ? 'disabled' : ''}>${i}<small>${'★'.repeat(s)}</small></button>`;
  }
  return h + '</div>';
}
function settings() {
  modal('Settings', `<p style="margin-top:0">Pick a level to play:</p>${levelsHtml()}`, [
    [save.muted ? '🔇 Sound: Off' : '🔊 Sound: On', () => { toggleMute(); settings(); }],
    ['↺ Restart this level', () => loadLevel(lv.n)],
    ['❓ How to play', () => help()],
    ['Reset all progress', () => modal('Reset progress?', '<p>This clears your levels, stars and saved helpers on this device.</p>', [
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
loadLevel(Math.min(save.level || 1, save.best || 1));
$('#loading').classList.add('hidden');
requestAnimationFrame(frame);
if (!save.seenHelp) help();

// test / debug hooks
window.__cp = {
  get S() { return S; }, get lv() { return lv; }, get save() { return save; }, get status() { return status; }, get modal() { return modalName; },
  get busy() { return anims.length > 0 || !!rotTo; }, get used() { return used; }, get hintId() { return hintId; }, get hammerMode() { return hammerMode; },
  quat() { return pivot.quaternion.toArray(); }, tapPoint, freeBlocks: () => visibleFree(), loadLevel, ready: true
};
