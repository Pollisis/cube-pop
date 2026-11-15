// Playwright end-to-end test at an iPad viewport. Usage: node tests/e2e.js [url] [outdir]
// Needs playwright (PW_PATH env) and Chrome (CHROME env, default /usr/bin/google-chrome).
const { chromium } = require(process.env.PW_PATH || 'playwright');
const fs = require('fs');
const url = process.argv[2] || 'http://127.0.0.1:8823/';
const out = process.argv[3] || 'screenshots';
fs.mkdirSync(out, { recursive: true });
const errors = [], log = [];
const check = (c, m) => { log.push((c ? 'PASS ' : 'FAIL ') + m); if (!c) errors.push(m); };
const count = (p) => p.evaluate(() => window.__cp.S.left);
const idle = (p) => p.waitForFunction(() => !window.__cp.busy, null, { timeout: 10000 });
async function drag(p, x, y, dx, dy) { await p.mouse.move(x, y); await p.mouse.down(); for (let i = 1; i <= 8; i++) await p.mouse.move(x + dx * i / 8, y + dy * i / 8); await p.mouse.up(); }
async function center(p) { const b = await p.locator('#gl').boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }
// clears the current level with real taps: tap any free block we can see, spin if none are visible
async function clearLevel(p) {
  for (let guard = 0; guard < 600; guard++) {
    if ((await count(p)) === 0) return true;
    const pt = await p.evaluate(() => { for (const id of window.__cp.freeBlocks()) { const t = window.__cp.tapPoint(id); if (t) return t; } return null; });
    if (pt) { await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(40); }
    else { await idle(p); const c = await center(p); await drag(p, c.x - 100, c.y + 150, 90, 40); await idle(p); }
  }
  return false;
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const consoleErr = [];
  page.on('pageerror', (e) => consoleErr.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErr.push(m.text()); });
  await page.goto(url); await page.waitForFunction(() => window.__cp && window.__cp.ready, null, { timeout: 30000 });
  check((await page.title()) === 'Cube Pop', 'title comes from config.js');
  check((await page.evaluate(() => window.__cp.modal)) === 'How to play', 'how-to-play shows on first visit');
  await page.screenshot({ path: out + '/01-help-ipad.png' });
  await page.click('#m-buttons button');
  check((await count(page)) === 26 && (await page.textContent('#count')) === '26', 'level 1: 26 blocks, counter shows 26');
  check((await page.textContent('#level-label')) === 'LEVEL 1', 'LEVEL 1 label');
  await page.waitForTimeout(300);
  await page.screenshot({ path: out + '/02-level1-ipad.png' });

  // drag rotates and does not pop anything
  const q0 = await page.evaluate(() => window.__cp.quat());
  const c = await center(page); await drag(page, c.x - 120, c.y, 240, 60);
  const q1 = await page.evaluate(() => window.__cp.quat());
  check(q0.some((v, i) => Math.abs(v - q1[i]) > 0.05), 'drag rotates the shape');
  check((await count(page)) === 26, 'drag does not pop a block');
  await idle(page);

  // a blocked block bounces back, costs nothing
  const blockedPt = await page.evaluate(() => { const S = window.__cp.S; for (const id of Object.keys(S.byId)) { if (!window.CubeGame.isFree(S, +id)) { const t = window.__cp.tapPoint(+id); if (t) return t; } } return null; });
  check(!!blockedPt, 'found a visible blocked block');
  if (blockedPt) { await page.mouse.click(blockedPt.x, blockedPt.y); await page.waitForTimeout(120); check((await count(page)) === 26, 'blocked tap pops nothing (no penalty)'); await page.screenshot({ path: out + '/03-blocked-bump-ipad.png' }); await idle(page); }

  // tap a free block with a real touch
  const freePt = await page.evaluate(() => { for (const id of window.__cp.freeBlocks()) { const t = window.__cp.tapPoint(id); if (t) return t; } return null; });
  await page.touchscreen.tap(freePt.x, freePt.y); await page.waitForTimeout(150);
  check((await count(page)) === 25 && (await page.textContent('#count')) === '25', 'touch-tapping a free block pops it (25 left)');
  await page.screenshot({ path: out + '/04-fly-off-ipad.png' });

  // clear the rest of level 1 with a scripted solution
  check(await clearLevel(page), 'level 1 cleared by tapping');
  await page.waitForFunction(() => /clear/.test(window.__cp.modal || ''), null, { timeout: 5000 });
  await page.waitForTimeout(1300);
  check((await page.locator('.stars span.on').count()) === 3, '3 stars with no power-ups');
  await page.screenshot({ path: out + '/05-level-complete-ipad.png' });
  const sv = await page.evaluate(() => window.__cp.save);
  check(sv.best === 2 && sv.stars[1] === 3 && sv.bank.hint === 4, 'progress + stars + earned hint saved (' + JSON.stringify(sv.bank) + ')');
  await page.click('text=Next level');
  check((await page.textContent('#level-label')) === 'LEVEL 2', 'next level loads');

  // reload keeps progress
  await page.reload(); await page.waitForFunction(() => window.__cp && window.__cp.ready);
  check((await page.textContent('#level-label')) === 'LEVEL 2' && (await page.evaluate(() => window.__cp.modal)) === null, 'reload resumes level 2 without the help screen');

  // hint power-up: confirm first, then highlight a free block, bank goes down
  await page.click('.pw[data-pw="hint"]');
  check(/Hint\?/.test(await page.evaluate(() => window.__cp.modal)), 'power-up asks to confirm');
  await page.click('text=Use it'); await idle(page);
  const h = await page.evaluate(() => ({ id: window.__cp.hintId, free: window.CubeGame.isFree(window.__cp.S, window.__cp.hintId), bank: window.__cp.save.bank.hint, used: window.__cp.used, vis: !!window.__cp.tapPoint(window.__cp.hintId) }));
  check(h.id != null && h.free && h.vis && h.bank === 3 && h.used === 1, 'hint lights up a visible free block, bank 4 -> 3');
  await page.screenshot({ path: out + '/06-hint-ipad.png' });
  // locked hammer
  await page.click('.pw[data-pw="hammer"]');
  check(/🔒/.test(await page.evaluate(() => window.__cp.modal)), 'hammer locked before level 3');
  await page.click('#m-buttons button');

  // mute toggle
  await page.click('#btn-sound'); check((await page.evaluate(() => window.__cp.save.muted)) === true && (await page.textContent('#btn-sound')) === '🔇', 'mute toggles and saves');
  await page.click('#btn-sound');

  // landscape: the canvas redraws to the new size
  const w0 = await page.evaluate(() => document.querySelector('#gl').width);
  await page.setViewportSize({ width: 1180, height: 820 }); await page.waitForTimeout(400);
  const dims = await page.evaluate(() => { const g = document.querySelector('#gl'), r = g.getBoundingClientRect(); return { w: g.width, cw: r.width, ch: r.height }; });
  check(dims.w !== w0 && Math.abs(dims.cw - 1180) < 2, 'landscape resize redraws canvas (' + JSON.stringify(dims) + ')');
  await page.evaluate(() => window.__cp.loadLevel(4)); await page.waitForTimeout(300);
  await page.screenshot({ path: out + '/07-heart-landscape-ipad.png' });
  await page.setViewportSize({ width: 820, height: 1180 }); await page.waitForTimeout(300);

  // a few later shapes render and are clearable
  for (const n of [9, 11, 18]) {
    await page.evaluate((n) => window.__cp.loadLevel(n), n); await page.waitForTimeout(300);
    await page.screenshot({ path: out + `/08-level${n}-ipad.png` });
  }
  await page.evaluate(() => window.__cp.loadLevel(9));
  check(await clearLevel(page), 'level 9 (flower) cleared by tapping');

  // settings + reset
  await page.waitForFunction(() => /clear/.test(window.__cp.modal || '')); await page.click('text=Next level');
  await page.click('#btn-settings'); await page.waitForTimeout(200);
  await page.screenshot({ path: out + '/09-settings-ipad.png' });
  await page.click('text=Reset all progress'); await page.click('text=Yes, reset');
  const r = await page.evaluate(() => ({ lvl: window.__cp.lv.n, best: window.__cp.save.best, hint: window.__cp.save.bank.hint }));
  check(r.lvl === 1 && r.best === 1 && r.hint === 3, 'reset progress goes back to level 1');

  check(consoleErr.length === 0, 'no console errors' + (consoleErr.length ? ': ' + consoleErr.join(' | ') : ''));
  await browser.close();
  console.log(log.join('\n'));
  console.log(errors.length ? errors.length + ' FAILED' : 'ALL PASSED (' + log.length + ' checks)');
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(log.join('\n')); process.exit(1); });
