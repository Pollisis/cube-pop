// Rules + solvability tests for the face-grid snake arrows. Usage: node tests/unit.js [levels=500]
const G = require('../game.js');
const N_LEVELS = +(process.argv[2] || 500);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const X = [1, 0, 0], NX = [-1, 0, 0], Y = [0, 1, 0], NY = [0, -1, 0], Z = [0, 0, 1], NZ = [0, 0, -1];
// build an arrow from a start cell and a list of moves (each move is an axis on the current face)
function arrow(B, start, moves) {
  const a = { cells: [start], out: [], inn: [] }; let c = start;
  for (const t of moves) { const s = B.step(c, t); a.out.push(t); a.inn.push(s.dir); a.cells.push(s.to); c = s.to; }
  return a;
}
const cellAt = (B, P) => B.byKey[P.join(',')];

// 1. the surface: 6*N*N cells, every cell has 4 distinct neighbours, steps are reversible, wraps go to the right face
for (const N of [2, 4, 7, 10]) {
  const B = G.makeBoard(N); ok(B.count === 6 * N * N, 'cell count N=' + N);
  let good = true;
  for (const cell of B.cells) {
    const seen = new Set();
    for (const t of B.faceDirs(cell.id)) {
      const s = B.step(cell.id, t); if (s.to == null) { good = false; continue; } seen.add(s.to);
      const back = B.step(s.to, G.neg(s.dir)); if (back.to !== cell.id) good = false;
      if (s.wrap && B.cells[s.to].f !== G.dirIndex(t)) good = false;
    }
    if (seen.size !== 4) good = false;
  }
  ok(good, 'neighbours valid + reversible + wrap onto correct face (N=' + N + ')');
}

// 2. blocking: only the straight ray from the head, on the head's own face, counts
{
  const N = 4, B = G.makeBoard(N);
  // front face (+z): cells have P.z = 4, x,y in {-3,-1,1,3}
  const a = arrow(B, cellAt(B, [-3, -1, 4]), [X]);          // (-3,-1)->(-1,-1), head points +x
  const b = arrow(B, cellAt(B, [3, -3, 4]), [Y, Y]);         // sits at x=3 column, crosses y=-1: on a's ray
  const lv = { N, arrows: [a, b] }; let S = G.newState(lv);
  ok(!G.isFree(S, 0) && G.blockerOf(S, 0).id === 1 && G.blockerOf(S, 0).dist === 2, 'arrow blocked by another arrow 2 cells ahead on the same face');
  const r = G.tap(S, 0); ok(!r.ok && r.why === 'blocked' && S.left === 2, 'blocked tap changes nothing (no penalty)');
  ok(G.isFree(S, 1), 'b (pointing +y, nothing ahead) is free');
  ok(G.tap(S, 1).ok && G.isFree(S, 0) && G.tap(S, 0).won, 'after b leaves, a is free; level won');
  // something on the next face along the same line does NOT block (arrows leave tangent to the face)
  const c = arrow(B, cellAt(B, [-3, 3, 4]), [X]);            // top row of front face, points +x toward the +x face
  const d = arrow(B, cellAt(B, [4, 3, 3]), [NZ, NZ]);        // on the +x face, right around the corner, in line with c
  S = G.newState({ N, arrows: [c, d] });
  ok(G.isFree(S, 0), 'an arrow on the neighbouring face in line with the ray does not block');
  // the arrow's own path never blocks itself in play
  const e = arrow(B, cellAt(B, [3, 3, 4]), [NY, NY, NX]);    // L shape, head points -x
  S = G.newState({ N, arrows: [e] }); ok(G.isFree(S, 0), 'own body behind the head is not a blocker');
}

// 3. wrapping bodies: a body that runs over an edge occupies cells on both faces and blocks there
{
  const N = 4, B = G.makeBoard(N);
  const w = arrow(B, cellAt(B, [-1, 1, 4]), [Y, Y]);         // front face going up, wraps onto the top face
  ok(B.cells[w.cells[0]].f === 4 && B.cells[w.cells[2]].f === 2, 'body wraps from the front face onto the top face');
  ok(G.headDir(w).join() === NZ.join(), 'after wrapping, the head points away from the front face (-z on top)');
  const t = arrow(B, cellAt(B, [3, 4, 3]), [NX]);            // on top face, head (1,4,3) points -x across row z=3: w's body is at (-1,4,3)
  let S = G.newState({ N, arrows: [w, t] });
  ok(!G.isFree(S, 1) && G.blockerOf(S, 1).id === 0, 'the wrapped part of a body blocks arrows on the other face');
  ok(G.isFree(S, 0), 'wrapped arrow (head ray on top face toward -z) is free');
  ok(G.tap(S, 0).ok && G.isFree(S, 1), 'once it leaves, its cells on both faces are empty');
  const rv = G.reversed(w);
  ok(rv.cells[0] === w.cells[2] && G.headDir(rv).join() === NY.join(), 'reversing a wrapped arrow flips its head direction correctly');
}
// 4. two arrows aimed at each other = deadlock; solver must say so
{
  const N = 4, B = G.makeBoard(N);
  const a = arrow(B, cellAt(B, [-3, 1, 4]), [X]), b = arrow(B, cellAt(B, [3, 1, 4]), [NX]);
  ok(G.solve({ N, arrows: [a, b] }) === null, 'facing arrows are unsolvable (solver detects it)');
}

// 5. generated levels: always solvable, solution replays, deterministic, density + interlock + wraps
const t0 = Date.now(); let worst = 0; const stats = {};
for (let n = 1; n <= N_LEVELS; n++) {
  const t = Date.now(); const lv = G.generateLevel(n); worst = Math.max(worst, Date.now() - t);
  const B = G.makeBoard(lv.N), seen = new Set(); let overlap = false, adj = true, selfRay = false;
  for (const a of lv.arrows) {
    for (const c of a.cells) { if (seen.has(c)) overlap = true; seen.add(c); }
    for (let k = 1; k < a.cells.length; k++) if (B.step(a.cells[k - 1], a.out[k - 1]).to !== a.cells[k]) adj = false;
    if (G.headRay(B, a).some((c) => a.cells.includes(c))) selfRay = true;
    if (a.cells.length < 2) adj = false;
  }
  ok(!overlap, `level ${n}: every cell used by at most one arrow`);
  ok(adj, `level ${n}: every arrow is a connected orthogonal path (len >= 2)`);
  ok(!selfRay, `level ${n}: no arrow points into its own body`);
  const S = G.newState(lv); let good = true;
  for (const id of lv.solution) if (!G.tap(S, id).ok) { good = false; break; }
  ok(good && S.left === 0, `level ${n}: solver order replays to a win`);
  const R = G.newState(lv), rnd = G.mulberry32(n); // random casual play never gets stuck
  while (R.left) { const f = G.freeArrows(R); if (!f.length) { ok(false, `level ${n}: random play got stuck`); break; } G.tap(R, f[Math.floor(rnd() * f.length)]); }
  if (n <= 60 || n % 25 === 0) ok(JSON.stringify(G.generateLevel(n).arrows) === JSON.stringify(lv.arrows), `level ${n}: deterministic`);
  const s = stats[lv.N] = stats[lv.N] || { lv: [], cov: [], arrows: [], free: [], depth: [], wraps: [], maxLen: 0, ms: [] };
  s.lv.push(n); s.cov.push(lv.coverage); s.arrows.push(lv.arrows.length); s.free.push(lv.freeAtStart / lv.arrows.length); s.depth.push(lv.depth); s.wraps.push(lv.wraps / lv.arrows.length);
  s.maxLen = Math.max(s.maxLen, ...lv.arrows.map((a) => a.cells.length));
  ok(lv.coverage >= 0.6, `level ${n}: coverage ${(lv.coverage * 100).toFixed(0)}%`);
}
// 6. raw generator over many seeds at the hardest settings
let gens = 0;
for (let s = 0; s < 200; s++) {
  const p = Object.assign(G.levelParams(400), { interlock: 1, bend: 0.6, maxLen: 14 });
  const g = G.generate(10, p, G.mulberry32(s + 999)); gens++;
  ok(!!G.solve(g), 'raw generator seed ' + s + ' solvable');
}
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length, pct = (x) => (x * 100).toFixed(0) + '%';
for (const N of Object.keys(stats).sort((a, b) => a - b)) {
  const s = stats[N];
  console.log(`N=${N} (levels ${s.lv[0]}-${s.lv[s.lv.length - 1]}): ${avg(s.arrows).toFixed(0)} arrows, coverage ${pct(avg(s.cov))}, free at start ${pct(avg(s.free))}, chain depth ${avg(s.depth).toFixed(1)} (max ${Math.max(...s.depth)}), wrapping arrows ${pct(avg(s.wraps))}, longest ${s.maxLen}`);
}
console.log(`${N_LEVELS} levels in ${Date.now() - t0} ms (slowest ${worst} ms); ${gens} extra hard-setting generator runs`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
