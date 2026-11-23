// Per-level behaviour: every level renders, is winnable by a bot (3 seeds), kills the player
// when it should, and ends the game after three deaths. Platformer winnability is proven by
// the solver in solver.test.js; here the platformer gets the death/over checks only.
// Run: node --test tools/test/levels.test.js   (about two minutes, flappy planning dominates)
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame, runFrames, memStorage } = require('../harness.js');
const { flappyBot, snakeBot, tetrisBot, memoryBot, memoryMissBot, memCentre, catchBot, routeBot, popBot, sortBot, press } = require('../bots.js');

const SEEDS = [1, 2, 3];
const BUDGET = { flappy: 9000, snake: 12000, tetris: 3000, memory: 3000, catch: 6000, route: 3000, pop: 6000, sort: 5000 };
const BOT = { flappy: flappyBot, snake: snakeBot, tetris: tetrisBot, memory: memoryBot, catch: catchBot, route: routeBot, pop: popBot, sort: sortBot };

/** Force a death in the current mode by editing its state so the next step() kills. */
const KILL = {
  platform(F) { F.debug().P.y = 544 + 60; },
  flappy(F) { const d = F.debug(); d.F.started = true; d.F.y = d.consts.FLOOR + 5; },
  snake(F) { const d = F.debug(); d.SN.queue.length = 0; d.SN.dir = { x: 0, y: -1 }; d.SN.cells[0].y = d.SN.top; d.SN.timer = d.SN.speed; },
  tetris(F) { const d = F.debug(); for (const row of d.TZ.board) row.fill('#000'); d.TZ.cur = null; d.TZ.clearing = { rows: [], t: 1 }; },
  memory(F) { const d = F.debug(); d.MM.peekT = 0; d.MM.backT = 0; d.MM.misses = d.diff.missBudget; },
  route(F) { F.debug().RT.timer = 1; },
  sort(F) { const d = F.debug(); if (d.SO.cur) { d.SO.misses = d.diff.missBudget - 1; d.SO.cur.kind = 'cat'; d.SO.cur.i = 0; d.SO.cur.col = d.AFVAL; d.SO.cur.y = 1e3; d.SO.cur.fast = true; } },
  pop(F) { const d = F.debug(); d.PP.balloons.push({ id: 9999, kind: 'shop', i: -1, x0: 480, x: 480, y: 300, r: 30, v: 0, ph: 0, col: '#D20000' }); F.mode().tap(480, 300); },
  catch(F) { const d = F.debug(); d.CT.falling.push({ kind: 'pin', i: -1, x0: d.CT.x, x: d.CT.x, y: d.consts.LINE - 1, v: 3, ph: 0, sway: 0 }); },
};

function dieOnce(F, kill) {
  const before = F.lives;
  for (let i = 0; i < 6 && F.lives === before; i++) { kill(F); F.step(); }
  assert.equal(F.lives, before - 1, 'kill did not cost a life');
  // wait out the death animation (70 frames) and the invulnerability (90 frames)
  for (let i = 0; i < 165 && F.state === 'play'; i++) F.step();
}

const { F: F0 } = loadGame({ seed: 1 });
const LEVELS = F0.LEVELS;

describe('every game has a bot, a budget and a way to force a death', () => {
  for (const g of F0.GAMES) {
    it(g.id, () => {
      assert.ok(KILL[g.type], `${g.type}: add a KILL entry`);
      if (g.type !== 'platform') { // the platformer is proven by the solver instead
        assert.ok(BOT[g.type], `${g.type}: add a bot to tools/bots.js and BOT`);
        assert.ok(BUDGET[g.type], `${g.type}: add a frame BUDGET`);
      }
    });
  }
});

for (let idx = 0; idx < LEVELS.length; idx++) {
  const lv = LEVELS[idx];
  describe(`${lv.game.name} · level ${lv.li + 1} "${lv.name}" (${lv.type})`, () => {
    it('renders the first frames without throwing', () => {
      const { F } = loadGame({ seed: 1 });
      F.play(idx, true); runFrames(F, 5); F.draw(5);
      assert.equal(F.state, 'play'); assert.equal(F.lives, 3); assert.equal(F.collected, 0);
      assert.equal(F.tot.items, 10);
    });

    if (lv.type !== 'platform') {
      for (const seed of SEEDS) {
        it(`is won by the bot with all 10 cards (seed ${seed})`, () => {
          const { F } = loadGame({ seed });
          F.play(idx, true);
          const n = runFrames(F, BUDGET[lv.type], BOT[lv.type]());
          assert.equal(F.state, 'win', `not won within ${BUDGET[lv.type]} frames (ran ${n}, collected ${F.collected}, lives ${F.lives})`);
          assert.equal(F.collected, 10);
        });
      }
    }

    it('kills the player when it should', () => {
      const { F } = loadGame({ seed: 1 });
      F.play(idx, true);
      if (lv.type === 'flappy') { press(F, 'Space'); const n = runFrames(F, 200); assert.ok(F.lives === 2, `flappy with no input should hit the floor (ran ${n})`); }
      else if (lv.type === 'snake') { const n = runFrames(F, 23 * lv.diff.speed0 + 30); assert.equal(F.lives, 2, `snake with no input should hit the wall (ran ${n})`); }
      else if (lv.type === 'sort') { let n = 0; while (F.lives === 3 && n++ < 8000) { const d = F.debug(); if (d.SO.cur && !d.SO.cur.fast) F.mode().tap(d.colX(d.SO.cur.kind === 'pin' ? 0 : d.AFVAL), 420); F.step(); } assert.equal(F.lives, 2, `sorting everything into the wrong bin should cost a life (ran ${n})`); }
      else if (lv.type === 'pop') { let n = 0; while (F.lives === 3 && n++ < 12000) F.step(); assert.equal(F.lives, 2, `letting the card balloons fly away should cost a life (ran ${n})`); }
      else if (lv.type === 'route') { const n = runFrames(F, lv.diff.time * 60 + 60); assert.equal(F.lives, 2, `the clock running out should cost a life (ran ${n})`); }
      else if (lv.type === 'catch') { let n = 0; while (F.lives === 3 && n++ < 5000) F.step(); assert.equal(F.lives, 2, `standing still should get hit by a pin within 5000 frames (ran ${n})`); }
      else if (lv.type === 'memory') { const n = runFrames(F, lv.diff.peek + lv.diff.missBudget * (lv.diff.flipBack + 12) + 120, memoryMissBot()); assert.equal(F.lives, 2, `running out of misses should cost a life (ran ${n})`); }
      else if (lv.type === 'tetris') { let n = 0; while (F.lives === 3 && n++ < 800) { press(F, 'Space'); F.step(); } assert.equal(F.lives, 2, 'hard-dropping every frame should top out'); }
      else { F.keys.r = true; let n = 0; while (F.lives === 3 && n++ < 900) F.step(); assert.equal(F.lives, 2, `running right without jumping should die within 900 frames`); }
    });

    it('ends the game after three deaths and resets on a new play()', () => {
      const { F } = loadGame({ seed: 1 });
      F.play(idx, true);
      dieOnce(F, KILL[lv.type]); assert.equal(F.state, 'play');
      dieOnce(F, KILL[lv.type]); assert.equal(F.state, 'play');
      dieOnce(F, KILL[lv.type]);
      assert.equal(F.state, 'over'); assert.equal(F.lives, 0);
      F.play(idx, true); assert.equal(F.state, 'play'); assert.equal(F.lives, 3);
    });
  });
}

describe('memory', () => {
  const idx = LEVELS.findIndex(l => l.type === 'memory' && l.li === 2); // the level with pins
  const ready = seed => { const { F } = loadGame({ seed }); F.play(idx, true); runFrames(F, LEVELS[idx].diff.peek + 1); return F; };
  const find = (F, k) => F.debug().MM.cards.findIndex(c => c.k === k);
  it('deals the 10 pairs, the pins and ballonnetjes on a 6x4 table, all face down after the peek', () => {
    const F = ready(1), d = F.debug(), cards = d.MM.cards;
    assert.equal(cards.length, 24);
    for (let i = 0; i < 10; i++) assert.equal(cards.filter(c => c.k === 'cat' && c.i === i).length, 2, `pair ${i}`);
    assert.equal(cards.filter(c => c.k === 'pin').length, d.diff.pins);
    assert.equal(cards.filter(c => c.k === 'coin').length, 24 - 20 - d.diff.pins);
    assert.equal(d.MM.peekT, 0); assert.ok(cards.every(c => !c.up));
  });
  it('ignores taps during the peek and outside the cards', () => {
    const { F } = loadGame({ seed: 1 }); F.play(idx, true);
    F.mode().tap(...memCentre(F.debug().layout, 0)); assert.ok(!F.debug().MM.cards[0].up, 'flipped during the peek');
    runFrames(F, LEVELS[idx].diff.peek + 1);
    F.mode().tap(5, 5); F.mode().tap(480, 4); assert.ok(F.debug().MM.cards.every(c => !c.up));
  });
  it('flips the tapped card, collects a matching pair and closes a mismatch', () => {
    const F = ready(2), d = F.debug(), M = d.MM, tap = n => F.mode().tap(...memCentre(d.layout, n));
    const a = M.cards.findIndex(c => c.k === 'cat'), b = M.cards.findIndex((c, n) => n !== a && c.k === 'cat' && c.i === M.cards[a].i);
    tap(a); assert.ok(M.cards[a].up); tap(b);
    assert.equal(F.collected, 1); assert.ok(M.cards[a].done && M.cards[b].done);
    const x = M.cards.findIndex(c => c.k === 'cat' && !c.done), y = M.cards.findIndex((c, n) => n !== x && c.k === 'cat' && !c.done && c.i !== M.cards[x].i);
    tap(x); tap(y); assert.equal(M.misses, 1); assert.ok(M.cards[x].up && M.cards[y].up);
    runFrames(F, d.diff.flipBack + 1); assert.ok(!M.cards[x].up && !M.cards[y].up, 'mismatch did not close');
  });
  it('a pin costs a life, a ballonnetje is a coin', () => {
    const F = ready(3), d = F.debug(), tap = n => F.mode().tap(...memCentre(d.layout, n));
    tap(find(F, 'pin')); assert.equal(F.lives, 2);
    runFrames(F, 80); assert.equal(F.state, 'play');
    tap(find(F, 'coin')); assert.equal(F.tot.coins, 1);
  });
  it('can be played with the keyboard only', () => {
    const F = ready(1), M = F.debug().MM;
    press(F, 'ArrowRight'); press(F, 'ArrowDown'); assert.equal(M.cur, 7);
    for (let i = 0; i < 9; i++) press(F, 'ArrowRight'); assert.equal(M.cur, 11, 'cursor must stop at the edge');
    press(F, 'Space'); assert.ok(M.cards[11].up);
  });
});

describe('seasonal themes are visual only', () => {
  for (const theme of ['sint', 'kerst', 'carnaval', 'pasen']) {
    it(`every level draws under "${theme}", including the kassa and a win`, () => {
      const { F } = loadGame({ seed: 1, theme });
      assert.equal(F.THEME, theme);
      for (let idx = 0; idx < LEVELS.length; idx++) { F.play(idx, true); runFrames(F, 30); F.draw(30); F.win(); F.draw(31); }
    });
    it(`the flappy bot still wins under "${theme}" (same course as without a theme)`, () => {
      const idx = LEVELS.findIndex(l => l.type === 'flappy' && l.li === 1);
      const run = th => { const { F } = loadGame({ seed: 2, theme: th }); F.play(idx, true); const n = runFrames(F, BUDGET.flappy, flappyBot()); return [F.state, F.collected, n]; };
      assert.deepEqual(run(theme), run('geen'));
    });
  }
});

describe('het clownmeisje', () => {
  it('?held=meisje picks her, and every level draws with her', () => {
    for (const theme of ['geen', 'sint', 'kerst', 'carnaval', 'pasen']) {
      const { F } = loadGame({ seed: 1, search: `?thema=${theme}&held=meisje` });
      assert.equal(F.HERO, 'meisje');
      for (let idx = 0; idx < LEVELS.length; idx++) { F.play(idx, true); runFrames(F, 20); F.draw(20); }
    }
  });
  it('the choice is remembered in storage; anything else means the clown', () => {
    const storage = memStorage(); storage.data.set('feestrun:v1:held', '"meisje"');
    assert.equal(loadGame({ storage }).F.HERO, 'meisje');
    storage.data.set('feestrun:v1:held', '"prinses"'); assert.equal(loadGame({ storage }).F.HERO, 'clown');
    assert.equal(loadGame({}).F.HERO, 'clown');
  });
});

describe('records and stars', () => {
  const KEY = 'feestrun:v1:records';
  const receipt = sandbox => sandbox.document.getElementById('receipt').innerHTML;
  it('stars: ★ finished, ★★ all 10 cards, ★★★ all 10 without losing a balloon', () => {
    assert.equal(F0.starsOf(7, 0), 1); assert.equal(F0.starsOf(10, 2), 2); assert.equal(F0.starsOf(10, 0), 3);
  });
  it('without storage a win works, shows stars and no record line', () => {
    const { F, sandbox } = loadGame({ seed: 1 });
    F.play(0, true); F.win();
    assert.equal(F.state, 'win'); assert.doesNotMatch(receipt(sandbox), /Jouw record/); assert.match(receipt(sandbox), /★<span class="off">★★<\/span>/);
    assert.equal(JSON.stringify(F.records()), '{}');
  });
  it('keeps the best score per level and says "Nieuw record" when it is beaten', () => {
    const storage = memStorage();
    let { F, sandbox } = loadGame({ seed: 1, storage });
    F.play(0, true); runFrames(F, 600); F.win(); // slow: a small speed bonus
    const first = JSON.parse(storage.data.get(KEY))['platformer:0'];
    assert.ok(first.score > 0 && first.stars === 1, JSON.stringify(first));
    assert.doesNotMatch(receipt(sandbox), /Jouw record/, 'no earlier record on the first win');
    ({ F, sandbox } = loadGame({ seed: 1, storage })); // a reload in the same browser
    F.play(0, true); runFrames(F, 3600); F.win(); // slower: lower score, the record stays
    assert.equal(JSON.parse(storage.data.get(KEY))['platformer:0'].score, first.score);
    assert.match(receipt(sandbox), new RegExp(`Jouw record</span><span>${first.score}<`)); assert.doesNotMatch(receipt(sandbox), /Nieuw record/);
    F.play(0, true); F.win(); // instantly: the biggest speed bonus
    assert.ok(JSON.parse(storage.data.get(KEY))['platformer:0'].score > first.score);
    assert.match(receipt(sandbox), /Nieuw record/);
  });
  it('a win with all 10 cards and no lost balloon stores 3 stars', () => {
    const storage = memStorage(), { F } = loadGame({ seed: 1, storage });
    const idx = LEVELS.findIndex(l => l.type === 'memory' && l.li === 0);
    F.play(idx, true); runFrames(F, BUDGET.memory, memoryBot());
    assert.equal(F.state, 'win'); assert.equal(F.collected, 10);
    assert.equal(F.records()['memory:0'].stars, F.lives === 3 ? 3 : 2);
  });
  it('ignores corrupt or foreign data in storage', () => {
    for (const bad of ['{nope', '[1,2]', '"text"', 'null']) {
      const storage = memStorage(); storage.data.set(KEY, bad);
      const { F } = loadGame({ seed: 1, storage });
      F.play(0, true); F.win(); assert.equal(F.state, 'win');
      assert.equal(F.records()['platformer:0'].stars, 1, `stored over ${bad}`);
    }
  });
});

describe('vakken vullen', () => {
  const idx = LEVELS.findIndex(l => l.type === 'sort' && l.li === 1);
  const ready = () => { const { F } = loadGame({ seed: 2 }); F.play(idx, true); return { F, d: F.debug() }; };
  const land = (F, d, kind, i, col) => { Object.assign(d.SO.cur, { kind, i, col, y: 1e3, fast: true }); F.step(); };
  it('a product in its own bin collects the card and the bin gets a new label', () => {
    const { F, d } = ready(); const i = d.SO.labels[1];
    land(F, d, 'cat', i, 1); assert.ok(F.items[i].got); assert.notEqual(d.SO.labels[1], i, 'relabelled');
    assert.ok(!F.items[d.SO.labels[1]].got, 'the new label is a category still to find');
  });
  it('a wrong bin or Afval is a miss; a pin in Afval is fine, in a product bin it pops a balloon', () => {
    const { F, d } = ready();
    land(F, d, 'cat', d.SO.labels[0], 2); assert.equal(d.SO.misses, 1);
    land(F, d, 'cat', d.SO.labels[0], d.AFVAL); assert.equal(d.SO.misses, 2);
    land(F, d, 'pin', -1, d.AFVAL); assert.equal(F.lives, 3); assert.equal(d.SO.misses, 2);
    land(F, d, 'pin', -1, 0); assert.equal(F.lives, 2);
  });
  it('every category can always be sorted: the labels are distinct and the falling product has a bin', () => {
    const { F, d } = ready();
    for (let k = 0; k < 400 && F.state === 'play'; k++) {
      const L = d.SO.labels; assert.equal(new Set(L).size, L.length);
      if (d.SO.cur && d.SO.cur.kind === 'cat') assert.ok(L.includes(d.SO.cur.i));
      sortBot()(F, F.debug()); F.step();
    }
  });
  it('the product waits for a choice; arrows choose, space drops, one tap drops into that bin', () => {
    const { F, d } = ready(); const c0 = d.SO.cur.col;
    for (let k = 0; k < 600; k++) F.step(); assert.equal(d.SO.misses, 0, 'nothing happens while waiting'); assert.ok(!d.SO.cur.fast);
    press(F, 'ArrowLeft'); assert.equal(d.SO.cur.col, Math.max(0, c0 - 1)); press(F, 'Space'); assert.ok(d.SO.cur.fast);
    for (let k = 0; k < 30; k++) F.step();
    F.mode().tap(d.colX(2), 420); assert.equal(d.SO.cur.col, 2); assert.ok(d.SO.cur.fast);
  });
});

describe('ballonnen prikken', () => {
  const idx = LEVELS.findIndex(l => l.type === 'pop' && l.li === 0);
  const ready = () => { const { F } = loadGame({ seed: 1 }); F.play(idx, true); const d = F.debug(); d.PP.balloons.length = 0; d.PP.spawnT = -1e9; return { F, d }; };
  const add = (d, kind, x, y, i = -1) => { const b = { id: d.PP.balloons.length + 100, kind, i, x0: x, x, y, r: 30, v: 0, ph: 0, col: '#8ED1FC' }; d.PP.balloons.push(b); return b; };
  it('pricking a card balloon collects its card, a coin balloon is a ballonnetje', () => {
    const { F, d } = ready(); add(d, 'card', 400, 300, 6); add(d, 'coin', 600, 300);
    F.mode().tap(400, 300); assert.ok(F.items[6].got); F.mode().tap(600, 305); assert.equal(F.debug().PP.popped, 2); assert.equal(F.lives, 3);
  });
  it('a prick hits the balloon whose centre is nearest: a shop balloon in front is a risk', () => {
    const { F, d } = ready(); add(d, 'card', 400, 300, 2); add(d, 'shop', 430, 300);
    F.mode().tap(420, 300); assert.equal(F.lives, 2, 'nearer to the shop balloon'); assert.ok(!F.items[2].got);
  });
  it('a card balloon that flies away comes back later and counts as a miss', () => {
    const { F, d } = ready(); const b = add(d, 'card', 400, -89, 3); b.v = 2;
    F.step(); assert.equal(d.PP.misses, 1); assert.equal(JSON.stringify(d.PP.missed), '[3]');
  });
});

describe('bezorgroute', () => {
  const levelsOf = () => LEVELS.map((l, i) => [l, i]).filter(([l]) => l.type === 'route');
  it('every generated village is solvable, starts with nothing connected, and keeps pins off the solution', () => {
    for (const [lv, idx] of levelsOf()) for (let seed = 1; seed <= 12; seed++) {
      const { F } = loadGame({ seed }); F.play(idx, true); const d = F.debug(), RT = d.RT;
      const houses = RT.cells.filter(c => c.k === 'house'); assert.equal(houses.length, 10, `${lv.name} seed ${seed}`);
      assert.equal(JSON.stringify(houses.map(h => h.i).sort((a, b) => a - b)), '[0,1,2,3,4,5,6,7,8,9]');
      assert.equal(RT.cells.filter(c => c.pin).length, lv.diff.pins);
      const now = d.reach(); assert.equal(now.houses.length, 0, 'nothing delivered at the start'); assert.equal(now.pin, -1);
      const solved = d.reach((i, c) => (c.k === 'road' ? 0 : c.pin ? c.sol : c.rot));
      assert.equal(solved.houses.length, 10, `${lv.name} seed ${seed}: the solution reaches every house`); assert.equal(solved.pin, -1);
    }
  });
  const idx2 = LEVELS.findIndex(l => l.type === 'route' && l.li === 1);
  it('a tap turns a tile a quarter; connecting a house delivers its card', () => {
    const { F } = loadGame({ seed: 3 }); F.play(idx2, true); const d = F.debug(), RT = d.RT;
    const i = RT.cells.findIndex(c => c.k === 'road'), r0 = RT.cells[i].rot;
    F.mode().tap(d.cx(i), d.cy(i)); assert.equal(RT.cells[i].rot, (r0 + 1) % 4);
    for (const c of RT.cells) if (c.k === 'road') c.rot = 0; else if (c.pin) c.rot = c.sol;
    const j = RT.cells.findIndex(c => c.k === 'road'); RT.cells[j].rot = 3; F.mode().tap(d.cx(j), d.cy(j)); // back to 0: all connected
    assert.equal(F.collected, 10); assert.equal(F.lives, 3);
  });
  it('a road that reaches a pin gives a flat tyre: a balloon pops and the pin is gone', () => {
    const { F } = loadGame({ seed: 4 }); F.play(idx2, true); const d = F.debug(), RT = d.RT;
    const roads = RT.cells.map((c, i) => i).filter(i => RT.cells[i].k === 'road');
    for (const i of roads) RT.cells[i].rot = 0; for (const c of RT.cells) if (c.pin) c.rot = c.sol;
    const p = roads[roads.length - 1], q = roads[0]; RT.cells[p].pin = true; // a pin on the route itself
    RT.cells[q].rot = 3; F.mode().tap(d.cx(q), d.cy(q)); // the last turn joins it to the warehouse
    assert.equal(F.lives, 2); assert.ok(!RT.cells[p].pin, 'pin swept away');
  });
  it('a pin turned to its safe direction can never be reached, whatever the other tiles do', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { F } = loadGame({ seed }); F.play(LEVELS.findIndex(l => l.type === 'route' && l.li === 2), true); const d = F.debug(), RT = d.RT;
      for (const c of RT.cells) if (c.pin) c.rot = c.sol;
      for (let k = 0; k < 200; k++) { for (const c of RT.cells) if (d.turnable(c) && !c.pin) c.rot = Math.floor(Math.random() * 4); assert.equal(d.reach().pin, -1); }
    }
  });
});

describe('winkelmandje', () => {
  const idx = LEVELS.findIndex(l => l.type === 'catch' && l.li === 0);
  const ready = () => { const { F } = loadGame({ seed: 1 }); F.play(idx, true); const d = F.debug(); d.CT.falling.length = 0; d.CT.spawnT = -1e9; return { F, d }; };
  const drop = (d, kind, dx, i = -1) => d.CT.falling.push({ kind, i, x0: d.CT.x + dx, x: d.CT.x + dx, y: d.consts.LINE - 1, v: 3, ph: 0, sway: 0 });
  it('catches a card that lands in the basket, and lets one land beside it', () => {
    const { F, d } = ready();
    drop(d, 'card', 10, 4); F.step(); assert.ok(F.items[4].got, 'card in the basket'); assert.equal(F.collected, 1);
    drop(d, 'card', d.consts.CATCH_W + 5, 5); for (let k = 0; k < 120; k++) F.step();
    assert.ok(!F.items[5].got); assert.equal(JSON.stringify(d.CT.missed), '[5]', 'a missed card is queued to fall again');
  });
  it('a pin in the basket pops a balloon, a pin beside it does not', () => {
    const { F, d } = ready();
    drop(d, 'pin', d.consts.PIN_W + 2); F.step(); assert.equal(F.lives, 3);
    drop(d, 'pin', 0); F.step(); assert.equal(F.lives, 2);
  });
  it('walks to a tapped spot; arrow keys win over the tap', () => {
    const { F, d } = ready(); const x0 = d.CT.x;
    F.mode().tap(x0 + 100, 300); for (let k = 0; k < 30; k++) F.step(); assert.equal(d.CT.x, x0 + 100);
    F.mode().tap(x0 + 300, 300); F.key('ArrowLeft', true); F.step(); F.key('ArrowLeft', false);
    assert.equal(d.CT.target, null); assert.ok(d.CT.x < x0 + 100, 'moved left');
  });
  it('after the tenth card the kassa rolls in and walking into it wins', () => {
    const { F, d } = ready();
    for (let i = 0; i < 10; i++) { drop(d, 'card', 0, i); F.step(); }
    assert.equal(F.collected, 10);
    for (let k = 0; k < 400 && F.state === 'play'; k++) { if (d.CT.kassa) F.mode().tap(d.CT.kassa.x + 32, 300); F.step(); }
    assert.equal(F.state, 'win');
  });
});

describe('level flow', () => {
  it('advances within a game and wraps to level 1 of the same game after level 3', () => {
    const { F, sandbox } = loadGame({ seed: 1 });
    F.play(3, true); F.win(); assert.equal(F.state, 'win');
    sandbox.document.getElementById('btnAgain').onclick(); assert.equal(F.lvIdx, 4);
    F.win(); sandbox.document.getElementById('btnAgain').onclick(); assert.equal(F.lvIdx, 5);
    F.win(); sandbox.document.getElementById('btnAgain').onclick(); assert.equal(F.lvIdx, 3);
  });
  it('receipt of the last level of a game shows the game total', () => {
    const { F, sandbox } = loadGame({ seed: 1 });
    F.play(2, true); F.win();
    const html = sandbox.document.getElementById('receipt').innerHTML;
    assert.match(html, /Totaal De winkel/);
    assert.match(sandbox.document.getElementById('btnAgain').textContent, /vanaf level 1/);
  });
});

describe('anonymous statistics', () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
  const hitsOf = sandbox => { const hits = []; sandbox.navigator.sendBeacon = u => { hits.push(decodeURIComponent(u)); return true; }; return hits; };
  it('without a count address nothing is sent', () => {
    const { F, sandbox } = loadGame({ seed: 1 }); const hits = hitsOf(sandbox);
    F.play(0, true); F.win();
    assert.deepEqual(hits, []);
  });
  it('with one: start, outcome, duration and stars per level, and nothing that identifies a player', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', '..', 'artifact.html'), 'utf8');
    assert.equal(html.split("/*STATS-URL*/''").length, 2);
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'feest-')), 'artifact.html');
    fs.writeFileSync(tmp, html.replace("/*STATS-URL*/''", "'https://x.goatcounter.com/count'"));
    const storage = memStorage();
    const { F, sandbox } = loadGame({ seed: 1, html: tmp, storage }); const hits = hitsOf(sandbox);
    F.play(0, true); F.win();
    const id = F.LV.game.id, names = hits.map(u => /[?&]p=([^&]*)/.exec(u)[1]);
    assert.deepEqual(names, [`spel/${id}/1/start`, `spel/${id}/1/gehaald`, `duur/${id}/1/gehaald/0-30s`, `sterren/${id}/1/1`]);
    for (const u of hits) { assert.ok(u.startsWith('https://x.goatcounter.com/count?'), u); assert.match(u, /[?&]e=true/); }
    assert.deepEqual([...storage.data.keys()], ['feestrun:v1:records']);
  });
});
