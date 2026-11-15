// Cube Pop rules, shapes, level generator and solver. Runs in the browser and in Node.
(function (root, factory) {
  var C = (typeof module === 'object' && module.exports) ? require('./config.js') : root.CUBE_CONFIG;
  var G = factory(C);
  if (typeof module === 'object' && module.exports) module.exports = G; else root.CubeGame = G;
})(this, function (C) {
  'use strict';
  var DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  var key = function (x, y, z) { return x + ',' + y + ',' + z; };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- shapes (lists of integer cells) ----------
  function box(a, b, c, hollow) {
    var out = [];
    for (var x = 0; x < a; x++) for (var y = 0; y < b; y++) for (var z = 0; z < c; z++) {
      if (hollow && x > 0 && y > 0 && z > 0 && x < a - 1 && y < b - 1 && z < c - 1) continue;
      out.push([x, y, z]);
    }
    return out;
  }
  function extrude(rows, depth) {
    var out = [];
    for (var r = 0; r < rows.length; r++) for (var x = 0; x < rows[r].length; x++) if (rows[r][x] === 'X')
      for (var z = 0; z < depth; z++) out.push([x, rows.length - 1 - r, z]);
    return out;
  }
  function ball(r, hollow) {
    var out = [], R = Math.ceil(r);
    for (var x = -R; x <= R; x++) for (var y = -R; y <= R; y++) for (var z = -R; z <= R; z++) {
      var d = Math.sqrt(x * x + y * y + z * z);
      if (d <= r && (!hollow || d > r - 1.2)) out.push([x, y, z]);
    }
    return out;
  }
  function pyramid(tiers) {
    var out = [];
    for (var t = 0; t < tiers; t++) { var s = tiers - 1 - t; for (var x = -s; x <= s; x++) for (var z = -s; z <= s; z++) out.push([x, t, z]); }
    return out;
  }
  function mushroom() {
    var out = [];
    for (var x = -3; x <= 3; x++) for (var y = 0; y <= 3; y++) for (var z = -3; z <= 3; z++)
      if (x * x + y * y * 1.6 + z * z <= 11.5) out.push([x, y + 3, z]);
    for (var x2 = -1; x2 <= 1; x2++) for (var y2 = 0; y2 < 3; y2++) for (var z2 = -1; z2 <= 1; z2++) out.push([x2, y2, z2]);
    return out;
  }
  function tree() {
    var out = [];
    var layers = [3, 2, 2, 1, 1, 0];
    for (var i = 0; i < layers.length; i++) { var s = layers[i]; for (var x = -s; x <= s; x++) for (var z = -s; z <= s; z++) if (Math.abs(x) + Math.abs(z) <= s + 1) out.push([x, i + 2, z]); }
    out.push([0, 0, 0], [0, 1, 0]);
    return out;
  }
  function house() {
    var out = box(5, 3, 4, false);
    for (var t = 0; t < 3; t++) for (var x = t; x < 5 - t; x++) for (var z = 0; z < 4; z++) out.push([x, 3 + t, z]);
    return out;
  }
  function donut() {
    var out = [];
    for (var x = -4; x <= 4; x++) for (var z = -4; z <= 4; z++) { var d = Math.sqrt(x * x + z * z); if (d >= 1.9 && d <= 4.1) { out.push([x, 0, z]); if (d >= 2.4 && d <= 3.6) out.push([x, 1, z]); } }
    return out;
  }
  function plus3d() {
    var s = {}, out = [];
    function add(x, y, z) { var k = key(x, y, z); if (!s[k]) { s[k] = 1; out.push([x, y, z]); } }
    for (var i = -3; i <= 3; i++) for (var a = -1; a <= 0; a++) for (var b = -1; b <= 0; b++) { add(i, a, b); add(a, i, b); add(a, b, i); }
    return out;
  }
  var BITMAPS = {
    heart: ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],
    star: ['...X...', '..XXX..', 'XXXXXXX', '.XXXXX.', '..XXX..', '.XX.XX.', '.X...X.'],
    cat: ['X.....X', 'XX...XX', 'XXXXXXX', 'XX.X.XX', 'XXXXXXX', '.XXXXX.'],
    flower: ['.XX.XX.', 'XXXXXXX', '.XXXXX.', 'XXXXXXX', '.XX.XX.', '...X...', '..XXX..'],
    duck: ['..XX....', '.XXXX...', '.XXXXX..', '..XX....', '.XXXXXXX', 'XXXXXXXX', '.XXXXXX.'],
    smile: ['.XXXXX.', 'XX.X.XX', 'XXXXXXX', 'X.XXX.X', 'XX...XX', '.XXXXX.']
  };
  var SHAPES = {
    cube3: function () { return box(3, 3, 3, true); },
    solid3: function () { return box(3, 3, 3, false); },
    cube4: function () { return box(4, 4, 4, true); },
    slab: function () { return box(4, 4, 3, false); },
    solid4: function () { return box(4, 4, 4, false); },
    cube5: function () { return box(5, 5, 5, true); },
    tower: function () { return box(3, 6, 3, false); },
    brick: function () { return box(5, 4, 3, false); },
    heart: function () { return extrude(BITMAPS.heart, 2); },
    bigheart: function () { return extrude(BITMAPS.heart, 3); },
    star: function () { return extrude(BITMAPS.star, 2); },
    cat: function () { return extrude(BITMAPS.cat, 2); },
    flower: function () { return extrude(BITMAPS.flower, 2); },
    duck: function () { return extrude(BITMAPS.duck, 2); },
    smile: function () { return extrude(BITMAPS.smile, 2); },
    pyramid: function () { return pyramid(3); },
    bigpyramid: function () { return pyramid(4); },
    mushroom: mushroom,
    tree: tree,
    house: house,
    donut: donut,
    plus: plus3d,
    ball: function () { return ball(2.6, false); },
    bubble: function () { return ball(3.3, true); }
  };
  var NAMES = {
    cube3: 'Little Cube', solid3: 'Sugar Cube', cube4: 'Big Cube', slab: 'Chunky Block', solid4: 'Solid Cube', cube5: 'Giant Cube',
    tower: 'Tower', brick: 'Brick', heart: 'Heart', bigheart: 'Big Heart', star: 'Star', cat: 'Kitty', flower: 'Flower', duck: 'Duckling',
    smile: 'Smiley', pyramid: 'Pyramid', bigpyramid: 'Big Pyramid', mushroom: 'Mushroom', tree: 'Pine Tree', house: 'Cottage',
    donut: 'Donut', plus: 'Jack', ball: 'Ball', bubble: 'Bubble'
  };
  // Hand-picked opening, then an endless cycle that slowly gets harder.
  var OPENING = [
    ['cube3', 0.05], ['cube3', 0.25], ['solid3', 0.3], ['heart', 0.3], ['cube4', 0.35],
    ['pyramid', 0.4], ['slab', 0.4], ['star', 0.45], ['flower', 0.45], ['cube4', 0.55],
    ['house', 0.5], ['cat', 0.5], ['solid4', 0.5], ['tree', 0.55], ['donut', 0.55],
    ['mushroom', 0.5], ['cube5', 0.55], ['ball', 0.6], ['bigheart', 0.6], ['brick', 0.6]
  ];
  var CYCLE = ['plus', 'solid4', 'duck', 'bigpyramid', 'heart', 'tower', 'smile', 'cube5', 'star', 'mushroom', 'bubble', 'cat',
    'house', 'donut', 'brick', 'tree', 'bigheart', 'plus', 'ball', 'slab'];

  function levelSpec(n) {
    if (n <= OPENING.length) return { shape: OPENING[n - 1][0], hard: OPENING[n - 1][1] };
    var i = n - OPENING.length - 1;
    return { shape: CYCLE[i % CYCLE.length], hard: Math.min(0.9, 0.6 + i * 0.008) };
  }

  function normalize(cells) {
    var mn = [Infinity, Infinity, Infinity];
    cells.forEach(function (c) { for (var j = 0; j < 3; j++) mn[j] = Math.min(mn[j], c[j]); });
    return cells.map(function (c) { return [c[0] - mn[0], c[1] - mn[1], c[2] - mn[2]]; });
  }
  function bounds(cells) {
    var mx = [0, 0, 0];
    cells.forEach(function (c) { for (var j = 0; j < 3; j++) mx[j] = Math.max(mx[j], c[j]); });
    return mx; // inclusive max; min is 0 after normalize
  }

  // ---------- rules ----------
  // occ: Set of keys; returns the first blocking cell distance (k>=1) or 0 if the path is clear.
  function firstBlock(occ, p, d, mx) {
    var D = DIRS[d];
    for (var k = 1; ; k++) {
      var x = p[0] + D[0] * k, y = p[1] + D[1] * k, z = p[2] + D[2] * k;
      if (x < 0 || y < 0 || z < 0 || x > mx[0] || y > mx[1] || z > mx[2]) return 0;
      if (occ.has(key(x, y, z))) return k;
    }
  }

  // Greedy solver. Removing a block never blocks another one, so if any order works, greedy works.
  function solve(blocks, mx) {
    mx = mx || bounds(blocks.map(function (b) { return b.p; }));
    var occ = new Set(blocks.map(function (b) { return key(b.p[0], b.p[1], b.p[2]); }));
    var left = blocks.slice(), order = [], progress = true;
    while (left.length && progress) {
      progress = false;
      for (var i = 0; i < left.length; i++) {
        var b = left[i];
        if (!firstBlock(occ, b.p, b.d, mx)) { occ.delete(key(b.p[0], b.p[1], b.p[2])); order.push(b.id); left.splice(i, 1); i--; progress = true; }
      }
    }
    return left.length ? null : order;
  }

  // ---------- generator: reverse construction ----------
  // Place blocks in reverse removal order. A new block must point along a ray with no already-placed
  // block on it (those are removed after it). Ordering cells from the center outward guarantees
  // at least one outward direction is always free, so construction never gets stuck.
  function generate(cells, hard, rnd) {
    cells = normalize(cells);
    var mx = bounds(cells);
    var ctr = [mx[0] / 2, mx[1] / 2, mx[2] / 2];
    var all = new Set(cells.map(function (c) { return key(c[0], c[1], c[2]); }));
    function chain(p, d) { // shape cells on the ray (they must all go first)
      var D = DIRS[d], n = 0;
      for (var k = 1; k < 40; k++) { if (all.has(key(p[0] + D[0] * k, p[1] + D[1] * k, p[2] + D[2] * k))) n++; }
      return n;
    }
    for (var attempt = 0; attempt < 8; attempt++) {
      var noise = attempt < 7 ? hard * 1.4 * (1 - attempt / 7) : 0;
      var order = cells.map(function (c) {
        var dx = c[0] - ctr[0], dy = c[1] - ctr[1], dz = c[2] - ctr[2];
        return { c: c, s: Math.sqrt(dx * dx + dy * dy + dz * dz) + rnd() * noise };
      }).sort(function (a, b) { return a.s - b.s; });
      var placed = new Set(), dirs = [], ok = true;
      for (var i = 0; i < order.length; i++) {
        var p = order[i].c, free = [];
        for (var d = 0; d < 6; d++) if (!firstBlock(placed, p, d, mx)) free.push(d);
        if (!free.length) { ok = false; break; }
        var pick;
        if (rnd() < hard) {
          var best = -1; free.forEach(function (d) { var c = chain(p, d) + rnd() * 0.5; if (c > best) { best = c; pick = d; } });
        } else pick = free[Math.floor(rnd() * free.length)];
        dirs.push(pick); placed.add(key(p[0], p[1], p[2]));
      }
      if (!ok) continue;
      var blocks = order.map(function (o, i) { return { p: o.c, d: dirs[i] }; });
      // stable ids sorted by position so the same seed always gives the same ids
      blocks.sort(function (a, b) { return (a.p[1] - b.p[1]) || (a.p[0] - b.p[0]) || (a.p[2] - b.p[2]); });
      blocks.forEach(function (b, i) { b.id = i; });
      return { blocks: blocks, max: mx, attempts: attempt + 1 };
    }
    throw new Error('generator failed');
  }

  function generateLevel(n) {
    var spec = levelSpec(n);
    var rnd = mulberry32(n * 7919 + 17);
    var cells = SHAPES[spec.shape]();
    if (cells.length > C.MAX_BLOCKS) cells = cells.slice(0, C.MAX_BLOCKS);
    var g = generate(cells, spec.hard, rnd);
    var solution = solve(g.blocks, g.max);
    if (!solution) throw new Error('unsolvable level ' + n); // never expected; tests check this
    var st = newState({ blocks: g.blocks, max: g.max });
    var freeNow = g.blocks.filter(function (b) { return isFree(st, b.id); }).length;
    return { n: n, shape: spec.shape, name: NAMES[spec.shape], hard: spec.hard, blocks: g.blocks, max: g.max, solution: solution, freeAtStart: freeNow };
  }

  // ---------- play state ----------
  function newState(lv) {
    var S = { max: lv.max, byId: {}, occ: new Map(), left: 0 };
    lv.blocks.forEach(function (b) { S.byId[b.id] = b; S.occ.set(key(b.p[0], b.p[1], b.p[2]), b.id); S.left++; });
    return S;
  }
  function blockerOf(S, id) {
    var b = S.byId[id], D = DIRS[b.d];
    for (var k = 1; ; k++) {
      var x = b.p[0] + D[0] * k, y = b.p[1] + D[1] * k, z = b.p[2] + D[2] * k;
      if (x < 0 || y < 0 || z < 0 || x > S.max[0] || y > S.max[1] || z > S.max[2]) return null;
      var o = S.occ.get(key(x, y, z));
      if (o !== undefined) return { id: o, dist: k };
    }
  }
  function alive(S, id) { var b = S.byId[id]; return !!b && S.occ.get(key(b.p[0], b.p[1], b.p[2])) === id; }
  function isFree(S, id) { return alive(S, id) && !blockerOf(S, id); }
  function remove(S, id) { var b = S.byId[id]; S.occ.delete(key(b.p[0], b.p[1], b.p[2])); S.left--; }
  // Tap a block: pops it if its path is clear, otherwise reports what blocks it.
  function tap(S, id) {
    if (!alive(S, id)) return { ok: false, why: 'gone' };
    var bl = blockerOf(S, id);
    if (bl) return { ok: false, why: 'blocked', blocker: bl.id, dist: bl.dist };
    remove(S, id);
    return { ok: true, won: S.left === 0 };
  }
  function force(S, id) { if (!alive(S, id)) return { ok: false }; remove(S, id); return { ok: true, won: S.left === 0 }; }
  function freeBlocks(S) { var out = []; for (var id in S.byId) if (isFree(S, +id)) out.push(+id); return out; }
  function aliveIds(S) { var out = []; S.occ.forEach(function (id) { out.push(id); }); return out; }
  function starsFor(used) { return used === 0 ? 3 : used <= 2 ? 2 : 1; }

  return {
    CONFIG: C, DIRS: DIRS, SHAPES: SHAPES, NAMES: NAMES, mulberry32: mulberry32, levelSpec: levelSpec,
    generate: generate, generateLevel: generateLevel, solve: solve, newState: newState, tap: tap, force: force,
    isFree: isFree, alive: alive, blockerOf: blockerOf, freeBlocks: freeBlocks, aliveIds: aliveIds, starsFor: starsFor, bounds: bounds, normalize: normalize
  };
});
