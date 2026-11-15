// Rules + solvability tests. Usage: node tests/unit.js [levels=500]
const G = require('../game.js');
const N = +(process.argv[2] || 500);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const mk = (blocks) => blocks.map((b, i) => ({ id: i, p: b[0], d: b[1] }));
// DIRS: 0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z

// 1. a block with a clear path pops; one with a block anywhere along its ray does not
{
  const lv = { blocks: mk([[[0, 0, 0], 0], [[2, 0, 0], 2], [[2, 1, 0], 1]]), max: [2, 1, 0] };
  const S = G.newState(lv);
  ok(!G.isFree(S, 0), 'block 0 blocked by block at distance 2');
  const r = G.tap(S, 0); ok(!r.ok && r.why === 'blocked' && r.blocker === 1 && r.dist === 2, 'tap reports blocker + distance');
  ok(S.left === 3, 'blocked tap removes nothing (no penalty)');
}
{
  const lv = { blocks: mk([[[0, 0, 0], 0], [[2, 0, 0], 2], [[2, 1, 0], 1]]), max: [2, 1, 0] };
  const S = G.newState(lv);
  ok(G.isFree(S, 2) === true, 'block 2 has a clear path to the left');
  ok(G.tap(S, 1).ok === false, 'block 1 (+y) blocked by block 2 above it');
  ok(G.tap(S, 2).ok, 'pop 2'); ok(G.tap(S, 1).ok, 'then 1 is free'); const r = G.tap(S, 0); ok(r.ok && r.won, 'then 0, level won');
  ok(G.tap(S, 0).why === 'gone', 'popped block cannot be tapped again');
}
// 2. two blocks pointing at each other is a deadlock; solver must say so
{
  const b = mk([[[0, 0, 0], 0], [[1, 0, 0], 1]]);
  ok(G.solve(b, [1, 0, 0]) === null, 'facing pair is unsolvable');
  const b2 = mk([[[0, 0, 0], 1], [[1, 0, 0], 0]]);
  ok(Array.isArray(G.solve(b2, [1, 0, 0])), 'back-to-back pair is solvable');
}
// 3. hammer (force) removes even a blocked block
{
  const S = G.newState({ blocks: mk([[[0, 0, 0], 0], [[1, 0, 0], 1]]), max: [1, 0, 0] });
  ok(G.freeBlocks(S).length === 0, 'deadlock has no free blocks'); ok(G.force(S, 0).ok, 'force pops'); ok(G.isFree(S, 1), 'other now free');
}
// 4. stars
ok(G.starsFor(0) === 3 && G.starsFor(1) === 2 && G.starsFor(2) === 2 && G.starsFor(3) === 1, 'stars 3/2/2/1');

// 5. every generated level is solvable, deterministic, and the solution replays through the real rules
const t0 = Date.now(); let worst = 0, totalBlocks = 0; const freeRatio = [];
for (let n = 1; n <= N; n++) {
  const t = Date.now(); const lv = G.generateLevel(n); worst = Math.max(worst, Date.now() - t);
  const cells = new Set(lv.blocks.map((b) => b.p.join(',')));
  ok(cells.size === lv.blocks.length, 'level ' + n + ' no overlapping blocks');
  ok(lv.blocks.length === G.SHAPES[lv.shape]().length, 'level ' + n + ' uses the whole shape');
  ok(lv.solution && lv.solution.length === lv.blocks.length, 'level ' + n + ' solver found an order');
  const S = G.newState(lv); let good = true;
  for (const id of lv.solution) { const r = G.tap(S, id); if (!r.ok) { good = false; break; } }
  ok(good && S.left === 0, 'level ' + n + ' solution replays to a win');
  // random play never gets stuck: from any state, some block is free (removals never block others)
  const R = G.newState(lv), rnd = G.mulberry32(n);
  while (R.left) { const f = G.freeBlocks(R); if (!f.length) { ok(false, 'level ' + n + ' random play got stuck'); break; } G.tap(R, f[Math.floor(rnd() * f.length)]); }
  const again = G.generateLevel(n);
  ok(JSON.stringify(again.blocks) === JSON.stringify(lv.blocks), 'level ' + n + ' is the same every time');
  totalBlocks += lv.blocks.length; freeRatio.push(lv.freeAtStart / lv.blocks.length);
}
// 6. the generator on raw shapes over many seeds and difficulties
let gens = 0;
for (const name in G.SHAPES) for (let s = 0; s < 40; s++) for (const h of [0, 0.5, 0.95]) {
  const g = G.generate(G.SHAPES[name](), h, G.mulberry32(s * 31 + name.length)); gens++;
  if (!G.solve(g.blocks, g.max)) ok(false, 'shape ' + name + ' seed ' + s + ' hard ' + h + ' unsolvable');
  else pass++;
}
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`levels 1-${N}: avg ${(totalBlocks / N).toFixed(0)} blocks, ${(avg(freeRatio.slice(0, 10)) * 100).toFixed(0)}% free at start (1-10) -> ${(avg(freeRatio.slice(-50)) * 100).toFixed(0)}% (last 50), slowest ${worst} ms, ${Date.now() - t0} ms total`);
console.log(`${gens} extra generator runs over ${Object.keys(G.SHAPES).length} shapes`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
