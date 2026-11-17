// Cube Pop v2 rules: a cube with an N x N grid on every face, covered in snake-like arrows.
// Runs in the browser and in Node (tests).
//
// Coordinates: the cube is centered at the origin with side N. Cell centers are stored in
// "doubled" integer coordinates P (real position = P / 2), so a cell on the face with normal n
// has P.n = N and its other two coordinates are odd numbers in (-N, N).
(function (root, factory) {
  var C = (typeof module === 'object' && module.exports) ? require('./config.js') : root.CUBE_CONFIG;
  var G = factory(C);
  if (typeof module === 'object' && module.exports) module.exports = G; else root.CubeGame = G;
})(this, function (C) {
  'use strict';
  var DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  // in-face axes for each face (u, v); any perpendicular pair works
  var UF = [[0, 0, -1], [0, 0, 1], [1, 0, 0], [1, 0, 0], [1, 0, 0], [-1, 0, 0]];
  var VF = [[0, 1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [0, 1, 0], [0, 1, 0]];
  var dot = function (a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; };
  var add = function (a, b, k) { k = k == null ? 1 : k; return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]; };
  var neg = function (a) { return [-a[0], -a[1], -a[2]]; };
  var cross = function (a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; };
  var dirIndex = function (t) { for (var i = 0; i < 6; i++) if (DIRS[i][0] === t[0] && DIRS[i][1] === t[1] && DIRS[i][2] === t[2]) return i; return -1; };
  var pkey = function (p) { return p[0] + ',' + p[1] + ',' + p[2]; };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- the cube surface ----------
  var boardCache = {};
  function makeBoard(N) {
    if (boardCache[N]) return boardCache[N];
    var cells = [], byKey = {};
    for (var f = 0; f < 6; f++) for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
      var P = add(add(DIRS[f].map(function (x) { return x * N; }), UF[f], 2 * i + 1 - N), VF[f], 2 * j + 1 - N);
      var id = cells.length; cells.push({ id: id, f: f, i: i, j: j, P: P }); byKey[pkey(P)] = id;
    }
    var B = { N: N, cells: cells, byKey: byKey, count: cells.length };
    // step from cell c moving along axis t (t lies in c's face). Wraps over the cube edge.
    B.step = function (c, t) {
      var cell = cells[c], n = DIRS[cell.f], Q = add(cell.P, t, 2);
      if (Math.abs(dot(Q, t)) < N) return { to: byKey[pkey(Q)], dir: t, wrap: false };
      var P2 = add(add(cell.P, t), n, -1); // over the edge onto the face whose normal is t
      return { to: byKey[pkey(P2)], dir: neg(n), wrap: true };
    };
    // cells straight ahead of c along t on the SAME face (no wrapping) up to the face edge
    B.ray = function (c, t) {
      var out = [], cell = cells[c], Q = cell.P;
      for (;;) { Q = add(Q, t, 2); if (Math.abs(dot(Q, t)) >= N) return out; out.push(byKey[pkey(Q)]); }
    };
    B.faceDirs = function (c) { var f = cells[c].f; return [UF[f], neg(UF[f]), VF[f], neg(VF[f])]; };
    boardCache[N] = B;
    return B;
  }

  // An arrow is a path of cells from tail to head. out[k] is the direction leaving cell k (on k's face),
  // inn[k] the direction arriving at cell k+1 (on k+1's face). The head points along inn[last].
  function headDir(a) { return a.inn[a.inn.length - 1]; }
  function reversed(a) {
    var n = a.cells.length, out = [], inn = [];
    for (var k = 0; k < n - 1; k++) { out.push(neg(a.inn[n - 2 - k])); inn.push(neg(a.out[n - 2 - k])); }
    return { cells: a.cells.slice().reverse(), out: out, inn: inn };
  }
  function headRay(B, a) { return B.ray(a.cells[a.cells.length - 1], headDir(a)); }

  // ---------- play state ----------
  function newState(lv) {
    var B = makeBoard(lv.N), occ = new Int32Array(B.count).fill(-1);
    lv.arrows.forEach(function (a, id) { a.cells.forEach(function (c) { occ[c] = id; }); });
    return { B: B, lv: lv, occ: occ, alive: lv.arrows.map(function () { return true; }), left: lv.arrows.length };
  }
  // first other arrow on the head's straight ray (same face only), or null if the way is clear
  function blockerOf(S, id) {
    var a = S.lv.arrows[id], r = headRay(S.B, a);
    for (var k = 0; k < r.length; k++) { var o = S.occ[r[k]]; if (o >= 0 && o !== id) return { id: o, dist: k + 1 }; }
    return null;
  }
  function isFree(S, id) { return S.alive[id] && !blockerOf(S, id); }
  function tap(S, id) {
    if (!S.alive[id]) return { ok: false, why: 'gone' };
    var bl = blockerOf(S, id);
    if (bl) return { ok: false, why: 'blocked', blocker: bl.id, dist: bl.dist };
    S.alive[id] = false; S.left--;
    S.lv.arrows[id].cells.forEach(function (c) { S.occ[c] = -1; });
    return { ok: true, won: S.left === 0 };
  }
  function freeArrows(S) { var out = []; for (var i = 0; i < S.alive.length; i++) if (isFree(S, i)) out.push(i); return out; }

  // Greedy solver: removing an arrow never blocks another, so if any order works, greedy works.
  // Also returns depth = how many "waves" it takes (a measure of how interlocked the level is).
  function solve(lv) {
    var S = newState(lv), order = [], depth = 0;
    while (S.left) {
      var f = freeArrows(S); if (!f.length) return null;
      depth++; f.forEach(function (id) { tap(S, id); order.push(id); });
    }
    return { order: order, depth: depth };
  }

  // ---------- generator (reverse construction) ----------
  // Arrows are added in REVERSE removal order: a new arrow is only kept if its head ray is clear of
  // every arrow already placed (those are removed after it), and not crossing its own body.
  // Arrows added later may sit on earlier rays, which is what makes them interlock.
  function generate(N, p, rnd) {
    var B = makeBoard(N), occ = new Int32Array(B.count).fill(-1), arrows = [], covered = 0, fails = 0;
    var target = Math.floor(B.count * p.density);
    function walk(start, L) {
      var dirs = B.faceDirs(start), t = dirs[Math.floor(rnd() * 4)];
      var a = { cells: [start], out: [], inn: [] }, inPath = {}; inPath[start] = 1;
      var cur = start;
      while (a.cells.length < L) {
        var n = DIRS[B.cells[cur].f], side = cross(t, n), opts;
        if (a.cells.length > 1 && rnd() < p.bend) opts = rnd() < 0.5 ? [side, neg(side), t] : [neg(side), side, t];
        else opts = rnd() < 0.5 ? [t, side, neg(side)] : [t, neg(side), side];
        var moved = false;
        for (var k = 0; k < opts.length; k++) {
          var s = B.step(cur, opts[k]);
          if (occ[s.to] >= 0 || inPath[s.to]) continue;
          if (s.wrap && rnd() > p.wrap) continue;
          a.out.push(opts[k]); a.inn.push(s.dir); a.cells.push(s.to); inPath[s.to] = 1; cur = s.to; t = s.dir; moved = true; break;
        }
        if (!moved) break;
      }
      return a;
    }
    function rayOk(a) {
      var own = {}; a.cells.forEach(function (c) { own[c] = 1; });
      var r = headRay(B, a);
      for (var k = 0; k < r.length; k++) if (occ[r[k]] >= 0 || own[r[k]]) return false;
      return true;
    }
    var empties = []; for (var c = 0; c < B.count; c++) empties.push(c);
    // still-free arrows: which arrows have no later arrow on their ray yet (cell -> arrow ids watching it)
    var watch = {}, freeSet = {};
    function place(a) {
      var id = arrows.length; arrows.push(a); a.cells.forEach(function (c) { occ[c] = id; }); covered += a.cells.length;
      a.cells.forEach(function (c) { (watch[c] || []).forEach(function (w) { delete freeSet[w]; }); });
      freeSet[id] = 1; headRay(B, a).forEach(function (c) { (watch[c] = watch[c] || []).push(id); });
    }
    function blocksCount(a) { var seen = {}, n = 0; a.cells.forEach(function (c) { (watch[c] || []).forEach(function (w) { if (freeSet[w] && !seen[w]) { seen[w] = 1; n++; } }); }); return n; }
    var tries = 1 + Math.round(p.interlock * 7);
    while (covered < target && fails < p.maxFails && empties.length) {
      var best = null, bestScore = -1, late = fails > p.maxFails * 0.6;
      for (var t = 0; t < (late ? 1 : tries); t++) {
        var ei = Math.floor(rnd() * empties.length), start = empties[ei];
        if (occ[start] >= 0) { empties[ei] = empties[empties.length - 1]; empties.pop(); if (!empties.length) break; continue; }
        var L = p.minLen + Math.floor(rnd() * (p.maxLen - p.minLen + 1));
        if (late) L = Math.min(L, 2 + Math.floor(rnd() * 3)); // late fill: small arrows
        var a = walk(start, L);
        if (a.cells.length < 2) continue;
        var cands = rnd() < 0.5 ? [a, reversed(a)] : [reversed(a), a];
        for (var q = 0; q < 2; q++) if (rayOk(cands[q])) {
          var sc = blocksCount(cands[q]) * 2 + headRay(B, cands[q]).length * 0.15 + cands[q].cells.length * 0.1 + rnd();
          if (sc > bestScore) { bestScore = sc; best = cands[q]; }
          break;
        }
      }
      if (best) place(best); else fails++;
    }
    // reverse construction gives the removal order back-to-front; shuffle ids so it isn't readable
    var order = arrows.map(function (_, i) { return i; });
    for (var i = order.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var tmp = order[i]; order[i] = order[j]; order[j] = tmp; }
    return { N: N, arrows: order.map(function (i) { return arrows[i]; }), coverage: covered / B.count };
  }

  function sizeFor(n) {
    for (var i = 0; i < C.SIZE_RAMP.length; i++) if (n <= C.SIZE_RAMP[i][0]) return C.SIZE_RAMP[i][1];
    return C.SIZE_CAP;
  }
  function levelParams(n) {
    var N = sizeFor(n), capStart = C.SIZE_RAMP[C.SIZE_RAMP.length - 1][0] + 1;
    var past = Math.max(0, n - capStart); // levels beyond the size cap
    var ramp = Math.min(1, (n - 1) / 30);
    var extra = Math.min(1, past / 40);    // gentle extra difficulty after the cap, then it plateaus
    return {
      N: N,
      density: (n <= 2 ? 0.62 : 0.7) + 0.12 * ramp + 0.05 * extra,
      minLen: 2,
      maxLen: Math.max(4, Math.round(N * 0.8 + 2 * extra + (n % 3))),
      bend: 0.28 + 0.12 * ramp + 0.08 * extra,
      wrap: 0.85,
      interlock: Math.min(1, 0.15 + 0.6 * ramp + 0.25 * extra),
      maxFails: 1500 + N * 150
    };
  }
  function generateLevel(n) {
    var p = levelParams(n), rnd = mulberry32(n * 104729 + 7);
    var g = generate(p.N, p, rnd);
    var sol = solve(g);
    if (!sol) throw new Error('unsolvable level ' + n); // cannot happen by construction; tests check it
    var lv = { n: n, N: p.N, arrows: g.arrows, coverage: g.coverage, solution: sol.order, depth: sol.depth, params: p };
    var S = newState(lv); lv.freeAtStart = freeArrows(S).length;
    lv.wraps = g.arrows.filter(function (a) { var f = makeBoard(p.N).cells; return a.cells.some(function (c) { return f[c].f !== f[a.cells[0]].f; }); }).length;
    return lv;
  }

  return {
    CONFIG: C, DIRS: DIRS, UF: UF, VF: VF, mulberry32: mulberry32, makeBoard: makeBoard, headDir: headDir, headRay: headRay, reversed: reversed,
    newState: newState, blockerOf: blockerOf, isFree: isFree, tap: tap, freeArrows: freeArrows, solve: solve, generate: generate,
    generateLevel: generateLevel, levelParams: levelParams, sizeFor: sizeFor, dirIndex: dirIndex, dot: dot, add: add, neg: neg
  };
});
