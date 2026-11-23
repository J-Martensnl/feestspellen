// Bots that play the game through the window.__feest handle. Each bot is a function
// (F, d) => void called once per frame BEFORE F.step(), where d = F.debug().
// Bots only read plain objects from the sandbox and never use instanceof.
'use strict';

const press = (F, code) => { F.key(code, true); F.key(code, false); };

/* ---------------- Flappy ---------------- */
// Plans, per target gate, the exact frames on which to flap: a layered search over
// (frame, height, vertical speed) up to ~45 frames past the gate, keeping only states
// that never touch a roll or the floor, and picking the one that crosses the gate
// closest to the gap centre (where the card/coin sits). Re-plans when the target changes.
function planFlaps(S, C, gates, cx, cy) {
  const r = 13, bx = S.wx + S.x, by = S.y - 16;
  const dt = Math.max(1, Math.round((cx - bx) / S.speed));
  const HZ = dt + 45;
  const collide = (x, y) => {
    if (y + 18 > C.FLOOR) return true; // game: F.y > FLOOR, and F.y = by + 16
    for (const g of gates) {
      if (g.kind === 'kassa') continue;
      if (x + r > g.x + 4 && x - r < g.x + C.RW - 4 && (y - r < g.gapY || y + r > g.gapY + g.gapH)) return true;
    }
    return false;
  };
  let layer = new Map();
  layer.set('s', { y: by, vy: S.vy, err: null, parent: null, flap: false });
  let x = bx;
  for (let t = 0; t < HZ; t++) {
    x += S.speed;
    const next = new Map();
    for (const n of layer.values()) {
      for (const flap of [false, true]) {
        if (flap && n.vy < -4) continue; // flapping while already rising fast is never useful
        let vy = flap ? C.FLAP : n.vy;
        vy = Math.min(vy + C.GR, 8);
        let y = n.y + vy;
        if (y - 18 < C.CEIL) { y = C.CEIL + 18; vy = Math.max(vy, 0); }
        if (collide(x, y)) continue;
        const err = t === dt - 1 ? Math.abs(y - cy) : n.err;
        const key = (Math.round(y / 2)) + '|' + Math.round(vy * 10);
        const old = next.get(key);
        if (old && (old.err ?? 0) <= (err ?? 0)) continue;
        next.set(key, { y, vy, err, parent: n, flap });
      }
    }
    if (!next.size) return null;
    layer = next;
  }
  let best = null;
  for (const n of layer.values()) if (!best || n.err < best.err) best = n;
  const flaps = [], pred = [];
  for (let n = best, t = HZ - 1; n && n.parent; n = n.parent, t--) { if (n.flap) flaps.push(t); pred[t] = n.y; }
  return { flaps: new Set(flaps), t: 0, cx, err: best.err, pred };
}

function flappyBot() {
  let plan = null;
  return function (F, d) {
    const S = d.F, C = d.consts;
    if (F.deadT) { plan = null; return; }
    if (!S.started) { plan = null; press(F, 'Space'); return; }
    const r = 13, bx = S.wx + S.x;
    const gates = S.gates.filter(g => g.x + C.RW - 4 > bx - r).slice(0, 3);
    const gate = gates[0];
    const cx = gate ? gate.x + C.RW / 2 : bx + 300;
    const cy = gate ? gate.gapY + gate.gapH / 2 : (C.CEIL + C.FLOOR) / 2;
    if (!plan || plan.cx !== cx) plan = planFlaps(S, C, gates, cx, cy);
    if (!plan) { // nothing survives: hover and hope
      if (S.vy > 0 && S.y - 16 > cy) press(F, 'Space');
      return;
    }
    if (plan.flaps.has(plan.t)) press(F, 'Space');
    plan.t++;
  };
}

/* ---------------- Snake ---------------- */
const DIRS = [{ x: 1, y: 0, k: 'ArrowRight' }, { x: -1, y: 0, k: 'ArrowLeft' }, { x: 0, y: 1, k: 'ArrowDown' }, { x: 0, y: -1, k: 'ArrowUp' }];

function snakeBot() {
  return function (F, d) {
    const SN = d.SN, COLS = d.COLS, ROWS = d.ROWS;
    if (F.deadT) return;
    if (SN.timer + 1 < SN.speed) return; // next step() does not move the snake
    const top = SN.top;
    const blocked = new Set();
    for (const p of SN.pins) blocked.add(p.x + ',' + p.y);
    for (const c of SN.cells) blocked.add(c.x + ',' + c.y);
    const inArena = (x, y) => x >= 0 && x < COLS && y >= top && y < ROWS;
    const isKassa = (x, y) => SN.kassa && x >= SN.kassa.x && x < SN.kassa.x + 2 && y >= SN.kassa.y && y < SN.kassa.y + 2;
    const goal = SN.kassa ? isKassa : (SN.food ? ((x, y) => x === SN.food.x && y === SN.food.y) : null);
    const head = SN.cells[0];
    const cur = SN.queue.length ? SN.queue[SN.queue.length - 1] : SN.dir;
    const legal = DIRS.filter(dd => !(dd.x === -cur.x && dd.y === -cur.y));
    const free = (x, y) => inArena(x, y) && !blocked.has(x + ',' + y) && (!SN.kassa || !isKassa(x, y) || goal === isKassa);
    // BFS from head
    let choice = null;
    if (goal) {
      const prev = new Map(); const q = [[head.x, head.y]]; prev.set(head.x + ',' + head.y, null);
      let found = null;
      while (q.length && !found) {
        const [x, y] = q.shift();
        for (const dd of DIRS) {
          const nx = x + dd.x, ny = y + dd.y, key = nx + ',' + ny;
          if (prev.has(key) || !free(nx, ny)) continue;
          if (x === head.x && y === head.y && !legal.includes(dd)) continue;
          prev.set(key, [x, y, dd]);
          if (goal(nx, ny)) { found = key; break; }
          q.push([nx, ny]);
        }
      }
      if (found) {
        let k = found, step = prev.get(k);
        while (step && !(step[0] === head.x && step[1] === head.y)) { k = step[0] + ',' + step[1]; step = prev.get(k); }
        if (step) choice = step[2];
      }
    }
    if (!choice) {
      // survival: pick the legal move with the largest reachable area
      let best = -1;
      for (const dd of legal) {
        const nx = head.x + dd.x, ny = head.y + dd.y;
        if (!free(nx, ny)) continue;
        const seen = new Set([nx + ',' + ny]); const q = [[nx, ny]];
        while (q.length && seen.size < 400) { const [x, y] = q.shift(); for (const e of DIRS) { const ex = x + e.x, ey = y + e.y, key = ex + ',' + ey; if (!seen.has(key) && free(ex, ey)) { seen.add(key); q.push([ex, ey]); } } }
        if (seen.size > best) { best = seen.size; choice = dd; }
      }
    }
    if (choice && !(choice.x === cur.x && choice.y === cur.y)) press(F, choice.k);
  };
}

/* ---------------- Tetris ---------------- */
function evalBoard(board, BW, BH) {
  let lines = 0; const rows = [];
  for (let y = 0; y < BH; y++) if (board[y].every(v => v)) { lines++; } else rows.push(board[y]);
  while (rows.length < BH) rows.unshift(Array(BW).fill(null));
  const heights = []; let holes = 0;
  for (let x = 0; x < BW; x++) {
    let h = 0, seenTop = false;
    for (let y = 0; y < BH; y++) { if (rows[y][x]) { if (!seenTop) { seenTop = true; h = BH - y; } } else if (seenTop) holes++; }
    heights.push(h);
  }
  const agg = heights.reduce((a, b) => a + b, 0);
  let bump = 0; for (let x = 1; x < BW; x++) bump += Math.abs(heights[x] - heights[x - 1]);
  return 0.76 * lines - 0.51 * agg - 0.36 * holes - 0.18 * bump + (lines >= 2 ? 0.3 * lines : 0);
}

function tetrisBot() {
  let plan = null; // {pieceN, rot, x, lastX, stuck}
  return function (F, d) {
    const TZ = d.TZ, BW = d.BW, BH = d.BH;
    if (F.deadT || TZ.clearing || TZ.winT || !TZ.cur) return;
    const cur = TZ.cur;
    if (!plan || plan.pieceN !== TZ.pieceN || plan.stuck > 2) {
      // enumerate placements from the current piece state
      const rots = cur.type === 'O' ? [0] : [0, 1, 2, 3];
      let best = null;
      for (const rot of rots) for (let x = -2; x < BW; x++) {
        let p = { type: cur.type, rot, x, y: cur.y };
        if (!d.fits(p)) continue;
        while (d.fits({ ...p, y: p.y + 1 })) p = { ...p, y: p.y + 1 };
        const cells = d.cellsOf(p);
        if (cells.some(([, y]) => y < 0)) continue;
        const board = TZ.board.map(r => r.slice());
        for (const [cx, cy] of cells) board[cy][cx] = 1;
        const s = evalBoard(board, BW, BH) - (plan && plan.stuck > 2 && rot !== cur.rot ? 5 : 0);
        if (!best || s > best.s) best = { s, rot, x };
      }
      if (!best) { press(F, 'Space'); plan = { pieceN: TZ.pieceN, rot: cur.rot, x: cur.x, lastX: cur.x, stuck: 0, done: true }; return; }
      plan = { pieceN: TZ.pieceN, rot: best.rot, x: best.x, lastX: cur.x, stuck: 0, done: false };
    }
    if (plan.done) return;
    if (cur.rot !== plan.rot) { press(F, 'ArrowUp'); return; }
    if (cur.x !== plan.x) {
      const want = cur.x < plan.x ? 'r' : 'l';
      if (F.keys[want]) { F.keys[want] = false; if (cur.x === plan.lastX) plan.stuck++; else plan.stuck = 0; plan.lastX = cur.x; }
      else { F.keys.l = F.keys.r = false; F.keys[want] = true; }
      return;
    }
    F.keys.l = F.keys.r = false;
    press(F, 'Space'); plan.done = true;
  };
}

/* ---------------- Platformer (input replay) ---------------- */
// inputs: array of [l, r, j] per frame as produced by the solver.
function platformReplay(inputs) {
  let i = 0, jHeld = false;
  return function (F) {
    const inp = inputs[i++] || [0, 0, 0];
    F.keys.l = !!inp[0]; F.keys.r = !!inp[1];
    if (inp[2] && !jHeld) F.key('Space', true);
    if (!inp[2] && jHeld) F.key('Space', false);
    jHeld = !!inp[2];
  };
}

/* ---------------- Memory ---------------- */
// Plays like a player with a perfect memory: it only knows what a card is once it has been
// face up (during the peek or after a flip), never peeks at face-down cards, and taps the
// canvas through mode().tap(x, y) so the hit-testing is exercised too. One action per `every`
// frames; while a mismatch is still showing it waits for it to close.
const memCentre = (L, n) => [L.X0 + (n % L.MC) * (L.CS + L.GAP) + L.CS / 2, L.Y0 + Math.floor(n / L.MC) * (L.CS + L.GAP) + L.CS / 2];
function memoryBot(every = 10) {
  const seen = new Map(); let t = 0;
  return function (F, d) {
    const M = d.MM;
    M.cards.forEach((c, n) => { if (c.up || M.peekT > 0) seen.set(n, { k: c.k, i: c.i }); });
    if (++t % every || F.deadT || M.peekT > 0 || M.backT > 0) return;
    if (M.kassa) { press(F, 'Space'); return; }
    const free = n => !M.cards[n].up && !M.cards[n].done;
    const tap = n => F.mode().tap(...memCentre(d.layout, n));
    if (M.open.length === 1) {
      const a = M.open[0], ia = M.cards[a].i;
      for (const [n, v] of seen) if (n !== a && v.k === 'cat' && v.i === ia && free(n)) return tap(n);
    } else {
      const byCat = new Map();
      for (const [n, v] of seen) if (v.k === 'cat' && free(n)) { if (byCat.has(v.i)) { tap(byCat.get(v.i)); return; } byCat.set(v.i, n); }
    }
    for (let n = 0; n < M.cards.length; n++) if (free(n) && !seen.has(n)) return tap(n);
    for (let n = 0; n < M.cards.length; n++) if (free(n) && seen.get(n).k === 'coin') return tap(n);
  };
}
// Deliberately mismatches (reads the hidden cards) so the miss budget runs out.
function memoryMissBot(every = 4) {
  let t = 0;
  return function (F, d) {
    const M = d.MM;
    if (++t % every || F.deadT || M.peekT > 0 || M.backT > 0 || M.misses >= d.diff.missBudget) return;
    const cats = M.cards.map((c, n) => n).filter(n => M.cards[n].k === 'cat' && !M.cards[n].up && !M.cards[n].done);
    const a = M.open.length ? M.open[0] : cats[0];
    const b = cats.find(n => n !== a && M.cards[n].i !== M.cards[a].i);
    F.mode().tap(...memCentre(d.layout, M.open.length ? b : a));
  };
}

/* ---------------- Winkelmandje (catch) ---------------- */
// Everything falls at a fixed speed and sways as a function of its height only, so the bot knows for every
// object when it crosses the basket rim (LINE) and where. Each frame it picks a target x by tapping:
// the landing spot of the next card it can still reach, else a coin, else stays; and it checks every candidate
// by simulating its own walk (SPD per frame towards the target) against the pins that cross LINE meanwhile,
// falling back to the safe candidate nearest to the card.
function catchBot() {
  return function (F, d) {
    if (F.deadT) return;
    const CT = d.CT, C = d.consts, tap = x => F.mode().tap(x, C.LINE);
    if (CT.kassa) { tap(CT.kassa.x + 32); return; }
    const cross = o => { const k = Math.ceil((C.LINE - o.y) / o.v); return k >= 1 ? { k, x: d.xAt(o, o.y + k * o.v) } : null; };
    const posAfter = (target, k) => { const dx = target - CT.x; return Math.abs(dx) <= k * C.SPD ? target : CT.x + Math.sign(dx) * k * C.SPD; };
    const pins = CT.falling.filter(o => o.kind === 'pin').map(cross).filter(Boolean);
    const safe = target => pins.every(p => Math.abs(posAfter(target, p.k) - p.x) >= C.PIN_W + 6);
    const goals = CT.falling.filter(o => o.kind !== 'pin').map(o => ({ o, c: cross(o) })).filter(g => g.c && Math.abs(g.c.x - CT.x) <= g.c.k * C.SPD + C.CATCH_W - 6)
      .sort((a, b) => (a.o.kind === 'card' ? 0 : 1) - (b.o.kind === 'card' ? 0 : 1) || a.c.k - b.c.k);
    const want = goals.length ? goals[0].c.x : CT.x;
    const cands = [want, CT.x, ...[-240, -160, -100, -60, 60, 100, 160, 240].map(dx => CT.x + dx)].map(x => Math.max(40, Math.min(C.W - 40, x)));
    const ok = cands.filter(safe);
    const pick = ok.length ? ok.sort((a, b) => Math.abs(a - want) - Math.abs(b - want))[0]
      : cands.sort((a, b) => Math.min(...pins.map(p => Math.abs(posAfter(b, p.k) - p.x))) - Math.min(...pins.map(p => Math.abs(posAfter(a, p.k) - p.x))))[0];
    tap(pick);
  };
}

/* ---------------- Bezorgroute (route) ---------------- */
// Knows the generator's solution: every route tile back to its original rotation, every pin tile to its safe
// rotation (decoys are left alone). It turns the tile nearest to the warehouse first, one tap per `every`
// frames, and skips a turn that would put a pin on the warehouse network (it simulates the turn first).
// This proves a level can be finished well within the time, not that it is easy to see.
function routeBot(every = 6) {
  let t = 0;
  return function (F, d) {
    if (++t % every || F.deadT) return;
    const RT = d.RT, ware = RT.ware, wc = ware % RT.cols, wr = Math.floor(ware / RT.cols);
    const want = (c, rot) => c.k === 'road' ? d.rotM(c.base, rot) === c.base : c.pin ? rot === c.sol : true;
    const todo = RT.cells.map((c, i) => i).filter(i => d.turnable(RT.cells[i]) && !want(RT.cells[i], RT.cells[i].rot))
      .sort((a, b) => (RT.cells[b].pin ? 1 : 0) - (RT.cells[a].pin ? 1 : 0) || (Math.abs(a % RT.cols - wc) + Math.abs(Math.floor(a / RT.cols) - wr)) - (Math.abs(b % RT.cols - wc) + Math.abs(Math.floor(b / RT.cols) - wr)));
    for (const i of todo) {
      const next = (RT.cells[i].rot + 1) % 4;
      if (d.reach((j, c) => (j === i ? next : c.rot)).pin >= 0) continue;
      F.mode().tap(d.cx(i), d.cy(i)); return;
    }
  };
}

/* ---------------- Ballonnen prikken (pop) ---------------- */
// Every `every` frames it pricks the card balloon highest up the screen (the next to fly away), else a coin, and
// never a shop balloon: it taps a balloon's centre and checks with the game's own hitAt() that this is the balloon hit.
function popBot(every = 4) {
  let t = 0;
  return function (F, d) {
    if (++t % every || F.deadT) return;
    const PP = d.PP, tap = (x, y) => F.mode().tap(x, y);
    if (PP.kassa) { tap(d.consts.W / 2, d.consts.H / 2); return; }
    const vis = PP.balloons.filter(b => b.kind !== 'shop' && b.y < d.consts.H - 20 && b.y > 40);
    vis.sort((a, b) => (a.kind === 'card' ? 0 : 1) - (b.kind === 'card' ? 0 : 1) || a.y - b.y);
    for (const b of vis) { const h = d.hitAt(b.x, b.y); if (h && h.id === b.id) { tap(b.x, b.y); return; } }
  };
}

/* ---------------- Vakken vullen (sort) ---------------- */
// Reads the falling product's category (as a player reads the picture) and the bin labels, taps the right bin,
// then taps it again to drop. A pin goes to Afval.
function sortBot() {
  return function (F, d) {
    const p = d.SO.cur; if (!p || F.deadT || p.fast) return;
    const target = p.kind === 'pin' ? d.AFVAL : d.SO.labels.indexOf(p.i);
    if (target < 0) return;
    F.mode().tap(d.colX(target), 420); if (p.col === target) F.mode().tap(d.colX(target), 420);
  };
}

module.exports = { flappyBot, snakeBot, tetrisBot, memoryBot, memoryMissBot, memCentre, platformReplay, catchBot, routeBot, popBot, sortBot, press };
