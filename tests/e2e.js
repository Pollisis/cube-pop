// Playwright end-to-end test at iPad portrait + landscape. Usage: node tests/e2e.js [url] [outdir]
// Needs playwright (PW_PATH env) and Chrome (CHROME env, default /usr/bin/google-chrome).
const { chromium } = require(process.env.PW_PATH || 'playwright');
const fs = require('fs');
const url = process.argv[2] || 'http://127.0.0.1:8823/';
const out = process.argv[3] || 'screenshots';
fs.mkdirSync(out, { recursive: true });
const errors = [], log = [];
const check = (c, m) => { log.push((c ? 'PASS ' : 'FAIL ') + m); if (!c) errors.push(m); };
const left = (p) => p.evaluate(() => window.__cp.S.left);
const idle = (p) => p.waitForFunction(() => !window.__cp.busy, null, { timeout: 15000 });
async function drag(p, x, y, dx, dy) { await p.mouse.move(x, y); await p.mouse.down(); for (let i = 1; i <= 8; i++) await p.mouse.move(x + dx * i / 8, y + dy * i / 8); await p.mouse.up(); }
async function center(p) { const b = await p.locator('#gl').boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }
const visibleFree = (p) => p.evaluate(() => { for (const id of window.__cp.freeArrows()) { const t = window.__cp.tapPoint(id); if (t) return Object.assign({ id }, t); } return null; });
const visibleBlocked = (p) => p.evaluate(() => { const S = window.__cp.S; for (let id = 0; id < S.alive.length; id++) { if (S.alive[id] && !window.CubeGame.isFree(S, id)) { const t = window.__cp.tapPoint(id); if (t) return Object.assign({ id }, t); } } return null; });
// clears the level with real taps: tap any clearable arrow we can see, spin the cube if none are visible
async function clearLevel(p, stopAt) {
  const spins = [[160, 0], [0, 140], [-150, 60], [80, -150]]; let k = 0;
  for (let guard = 0; guard < 1500; guard++) {
    const n = await left(p); if (n === 0 || (stopAt && n <= stopAt)) return true;
    const pt = await visibleFree(p);
    if (pt) { await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(30); }
    else { await idle(p); const c = await center(p), s = spins[k++ % spins.length]; await drag(p, c.x - s[0] / 2, c.y - s[1] / 2, s[0], s[1]); await idle(p); }
  }
  return false;
}

async function run(browser, name, vp) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const consoleErr = [];
  page.on('pageerror', (e) => consoleErr.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErr.push(m.text()); });
  await page.goto(url); await page.waitForFunction(() => window.__cp && window.__cp.ready, null, { timeout: 30000 });
  const T = (m) => name + ': ' + m;
  check((await page.title()) === 'Cube Pop', T('title from config.js'));
  check((await page.evaluate(() => window.__cp.modal)) === 'How to play', T('how-to-play on first visit'));
  await page.click('#m-buttons button');
  const n0 = await left(page), lv = await page.evaluate(() => ({ N: window.__cp.lv.N, n: window.__cp.lv.arrows.length }));
  check(lv.N === 4 && n0 === lv.n && (await page.textContent('#count')) === String(n0), T('level 1 is a 4x4 cube, counter shows ' + n0 + ' arrows'));
  check((await page.locator('.pw').count()) === 1 && (await page.locator('#btn-hint').count()) === 1, T('only the lightbulb power-up'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${name}-01-level1.png` });

  // drag rotates without clearing
  const q0 = await page.evaluate(() => window.__cp.quat());
  const c = await center(page); await drag(page, c.x - 120, c.y, 240, 50);
  const q1 = await page.evaluate(() => window.__cp.quat());
  check(q0.some((v, i) => Math.abs(v - q1[i]) > 0.05) && (await left(page)) === n0, T('drag spins the cube and clears nothing'));
  await idle(page);

  // blocked arrow: turns blue, bounces back, nothing lost
  const bl = await visibleBlocked(page);
  check(!!bl, T('found a visible blocked arrow'));
  if (bl) {
    await page.mouse.click(bl.x, bl.y); await page.waitForTimeout(90);
    check((await page.evaluate((id) => window.__cp.look(id), bl.id)) === 'blocked' && (await left(page)) === n0, T('blocked arrow turns blue, no penalty'));
    await page.screenshot({ path: `${out}/${name}-02-blocked.png` });
    await idle(page);
    check((await page.evaluate((id) => window.__cp.look(id), bl.id)) === 'normal' && (await page.evaluate((id) => window.__cp.S.alive[id], bl.id)), T('blocked arrow recovers and stays'));
  }

  // tap a clearable arrow with a real touch
  const fr = await visibleFree(page);
  await page.touchscreen.tap(fr.x, fr.y); await page.waitForTimeout(120);
  check((await left(page)) === n0 - 1 && !(await page.evaluate((id) => window.__cp.S.alive[id], fr.id)), T('touch-tap clears a free arrow (' + (n0 - 1) + ' left)'));
  await page.screenshot({ path: `${out}/${name}-03-flying.png` });
  await idle(page);
  check((await page.evaluate(() => window.__cp.grooves())) === 1, T('cleared arrow leaves a groove'));

  // hint: free, no popup, highlights a clearable arrow, then cools down
  await page.click('#btn-hint'); await page.waitForTimeout(100);
  const h = await page.evaluate(() => ({ id: window.__cp.hintId, modal: window.__cp.modal }));
  check(h.id != null && h.modal === null && (await page.evaluate((id) => window.CubeGame.isFree(window.__cp.S, id) && window.__cp.look(id) === 'hint', h.id)), T('lightbulb lights a clearable arrow, no popup'));
  await idle(page);
  check(!!(await page.evaluate((id) => window.__cp.tapPoint(id), h.id)), T('hinted arrow is on screen'));
  await page.screenshot({ path: `${out}/${name}-04-hint.png` });
  await page.click('#btn-hint');
  check((await page.evaluate(() => window.__cp.hintId)) === h.id, T('hint cooldown (second tap within 2.5s ignored)'));

  // clear level 1 with scripted taps
  check(await clearLevel(page), T('level 1 cleared by tapping'));
  await page.waitForFunction(() => /complete/.test(window.__cp.modal || ''), null, { timeout: 8000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${name}-05-complete.png` });
  check((await page.evaluate(() => window.__cp.save.best)) === 2, T('progress saved'));
  await page.click('text=Next ▶');
  check((await page.textContent('#level-label')) === 'LEVEL 2', T('next level loads'));
  await page.reload(); await page.waitForFunction(() => window.__cp && window.__cp.ready);
  check((await page.textContent('#level-label')) === 'LEVEL 2' && (await page.evaluate(() => window.__cp.modal)) === null, T('reload resumes level 2'));

  // large capped cube, part cleared, grooves showing
  await page.evaluate(() => window.__cp.loadLevel(32)); await page.waitForTimeout(200);
  const big = await page.evaluate(() => ({ N: window.__cp.lv.N, n: window.__cp.S.left }));
  check(big.N === 10, T('level 32 is a capped 10x10 cube (' + big.n + ' arrows)'));
  await clearLevel(page, Math.round(big.n * 0.55)); await idle(page);
  await page.screenshot({ path: `${out}/${name}-06-level32-midclear.png` });
  check((await page.evaluate(() => window.__cp.grooves())) >= big.n * 0.4, T('big cube mid-clear with grooves'));

  // resize redraws
  const w0 = await page.evaluate(() => document.querySelector('#gl').width);
  await page.setViewportSize({ width: vp.height, height: vp.width }); await page.waitForTimeout(400);
  check((await page.evaluate(() => document.querySelector('#gl').width)) !== w0, T('rotation resize redraws the canvas'));
  await page.setViewportSize(vp);

  // settings + mute + reset
  await page.click('#btn-sound'); check((await page.evaluate(() => window.__cp.save.muted)) === true, T('mute toggles'));
  await page.click('#btn-sound');
  await page.click('#btn-settings'); await page.click('text=Reset all progress'); await page.click('text=Yes, reset');
  check((await page.evaluate(() => [window.__cp.lv.n, window.__cp.save.best].join())) === '1,1', T('reset goes back to level 1'));
  check(consoleErr.length === 0, T('no console errors' + (consoleErr.length ? ': ' + consoleErr.join(' | ') : '')));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  await run(browser, 'portrait', { width: 820, height: 1180 });
  await run(browser, 'landscape', { width: 1180, height: 820 });
  await browser.close();
  console.log(log.join('\n'));
  console.log(errors.length ? errors.length + ' FAILED' : 'ALL PASSED (' + log.length + ' checks)');
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error(e); console.log(log.join('\n')); process.exit(1); });
