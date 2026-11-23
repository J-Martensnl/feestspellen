// Structural checks: games/levels shape, map well-formedness, monotonic difficulty.
// Run: node --test tools/test/static.test.js
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../harness.js');
const { loadSegs } = require('../solver.js');

const { F } = loadGame({ seed: 1 });
const GAMES = F.GAMES, LEVELS = F.LEVELS;

describe('games and levels', () => {
  it('every game has 3 levels (all of them in artifact mode)', () => {
    assert.ok(GAMES.length >= 5);
    for (const g of GAMES) assert.equal(g.levels.length, 3, g.id);
    assert.equal(LEVELS.length, GAMES.length * 3);
    assert.equal(F.FIXED_GAME, null);
  });
  it('every level has a name, a sub (makkelijk/gemiddeld/moeilijk) and a diff object', () => {
    for (const lv of LEVELS) {
      assert.ok(lv.name && lv.name.length > 2, lv.name);
      assert.equal(lv.sub, ['makkelijk', 'gemiddeld', 'moeilijk'][lv.li]);
      assert.equal(typeof lv.diff, 'object');
      assert.ok(lv.game && typeof lv.gi === 'number' && typeof lv.li === 'number');
    }
  });
  it('level names are unique within a game and game ids are unique', () => {
    assert.equal(new Set(GAMES.map(g => g.id)).size, GAMES.length);
    for (const g of GAMES) assert.equal(new Set(g.levels.map(l => l.name)).size, 3, g.id);
  });
});

describe('built pages', () => {
  // every page of the upload package must at least parse (the tests themselves run artifact.html)
  const fs = require('fs'), path = require('path'), vm = require('vm');
  const dir = path.join(__dirname, '..', '..', 'dist', 'feestspellen', 'feestrun');
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.html')) : []) {
    it(`${f} has scripts that parse`, () => {
      const html = fs.readFileSync(path.join(dir, f), 'utf8');
      for (const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(m[1], { filename: f });
    });
  }
});

describe('seasonal theme', () => {
  const pick = (y, m, d, q = '') => F.pickTheme(new Date(y, m - 1, d), q);
  it('follows the date: sint 10 Nov – 5 Dec, kerst 6 Dec – 6 Jan, none otherwise', () => {
    const cases = [[2026, 11, 9, null], [2026, 11, 10, 'sint'], [2026, 12, 5, 'sint'], [2026, 12, 6, 'kerst'], [2026, 12, 31, 'kerst'],
      [2027, 1, 1, 'kerst'], [2027, 1, 6, 'kerst'], [2027, 1, 7, null], [2026, 7, 15, null]];
    for (const [y, m, d, want] of cases) assert.equal(pick(y, m, d), want, `${d}-${m}-${y}`);
  });
  it('carnaval: the two weeks before Aswoensdag, which moves with Easter', () => {
    const cases = [[2027, 1, 26, null], [2027, 1, 27, 'carnaval'], [2027, 2, 9, 'carnaval'], [2027, 2, 10, null], // Easter 28 Mar 2027
      [2026, 2, 3, null], [2026, 2, 4, 'carnaval'], [2026, 2, 17, 'carnaval'], [2026, 2, 18, null]]; // Easter 5 Apr 2026
    for (const [y, m, d, want] of cases) assert.equal(pick(y, m, d), want, `${d}-${m}-${y}`);
    assert.match(F.seasonLine(new Date(2027, 1, 3), 'carnaval'), /Nog 3 nachtjes slapen tot carnaval/);
    assert.match(F.seasonLine(new Date(2027, 1, 7), 'carnaval'), /Alaaf! Het is carnaval/);
  });
  it('pasen: the two weeks before Easter up to Easter Monday', () => {
    const cases = [[2027, 3, 14, null], [2027, 3, 15, 'pasen'], [2027, 3, 28, 'pasen'], [2027, 3, 29, 'pasen'], [2027, 3, 30, null], // Easter 28 Mar 2027
      [2026, 3, 22, null], [2026, 3, 23, 'pasen'], [2026, 4, 6, 'pasen'], [2026, 4, 7, null]]; // Easter 5 Apr 2026
    for (const [y, m, d, want] of cases) assert.equal(pick(y, m, d), want, `${d}-${m}-${y}`);
    assert.match(F.seasonLine(new Date(2027, 2, 25), 'pasen'), /Nog 3 nachtjes slapen tot Pasen/);
    assert.match(F.seasonLine(new Date(2027, 2, 29), 'pasen'), /Vrolijk Pasen/);
  });
  it('every theme has its own tune with the right shape', () => {
    for (const t of ['sint', 'kerst', 'carnaval', 'pasen']) {
      const S = F.SONGS[t]; assert.ok(S, t);
      assert.equal(S.mel.length, 64, t); assert.equal(S.harm.length, 64, t); assert.equal(S.bass.length, 32, t);
      assert.ok(S.mel[0] > 0, `${t} starts on a note`);
    }
  });
  it('?thema= overrides the date', () => {
    assert.equal(pick(2026, 7, 15, '?thema=kerst'), 'kerst');
    assert.equal(pick(2026, 11, 22, '?thema=carnaval'), 'carnaval');
    assert.equal(pick(2026, 11, 22, '?thema=pasen'), 'pasen');
    assert.equal(pick(2026, 11, 22, '?level=2&thema=geen'), null);
    assert.equal(pick(2026, 7, 15, '?thema=sinterklaas'), null, 'unknown theme names are ignored');
  });
  it('the harness runs without a theme by default', () => { assert.equal(F.THEME, null); });
  it('the Sinterklaas title line counts the nights to pakjesavond', () => {
    const { F: S } = loadGame({ theme: 'sint' });
    assert.equal(S.THEME, 'sint');
    assert.match(S.seasonLine(new Date(2026, 10, 22), 'sint'), /Nog 13 nachtjes slapen tot pakjesavond/);
    assert.match(S.seasonLine(new Date(2026, 11, 4), 'sint'), /Nog 1 nachtje slapen/);
    assert.match(S.seasonLine(new Date(2026, 11, 5), 'sint'), /Vanavond is het pakjesavond/);
    assert.match(S.seasonLine(new Date(2026, 6, 15), 'sint'), /Sinterklaas is in het land/);
    assert.equal(F.seasonLine(new Date(2026, 10, 22), null), '');
  });
});

describe('platformer maps', () => {
  const segsByName = loadSegs();
  const platLevels = LEVELS.filter(l => l.type === 'platform');
  it('has 3 platformer levels, each with its own map', () => {
    assert.equal(platLevels.length, 3);
    assert.equal(new Set(platLevels.map(l => JSON.stringify(l.segs))).size, 3, 'maps must differ');
  });
  for (const lv of platLevels) {
    it(`map of "${lv.name}" is well-formed`, () => {
      const rows = [];
      for (const seg of lv.segs) {
        assert.ok(seg.length <= 17, 'segment has more than 17 rows');
        for (let r = 0; r < 17; r++) { const row = (seg[r] || ''); assert.ok(row.length <= 30, `row longer than 30: ${row}`); rows[r] = (rows[r] || '') + row.padEnd(30, ' '); }
      }
      const all = rows.join('\n');
      for (const d of '0123456789') assert.equal(all.split(d).length - 1, 1, `card ${d} must appear exactly once`);
      assert.equal(all.split('@').length - 1, 1, 'exactly one start');
      assert.equal(all.split('K').length - 1, 1, 'exactly one kassa');
      const bad = all.replace(/[ #\-^@o0-9SPMNFK\n]/g, ''); assert.equal(bad, '', `unknown map characters: ${bad}`);
    });
    it(`map of "${lv.name}" is the one in src/segs.part`, () => {
      assert.ok(Object.values(segsByName).some(s => JSON.stringify(s) === JSON.stringify(lv.segs)));
    });
  }
});

describe('difficulty is strictly monotonic across the 3 levels', () => {
  // knob -> direction (+1 must increase, -1 must decrease) ; 0 = non-strict in that direction
  const RULES = {
    platformer: { enemySpd: 1, moverRate: 1 },
    flappy: { gapH: -1, gapMin: -1, gateDx: -1, speed0: 1, speedMax: 1 },
    snake: { speed0: -1, speedMin: -1, pinsPerItem: 1 },
    tetris: { interval0: -1, intervalMin: -1, lockDelay: -1 },
    memory: { peek: -1, flipBack: -1, missBudget: -1, pins: 1 },
    winkelmandje: { fall0: 1, fallMax: 1, spawnEvery: -1, pinShare: 1 },
    bezorgroute: { cols: 1, rows: 1, time: -1 },
    prikken: { rise: 1, spawnEvery: -1, decoyShare: 1, radius: -1, missBudget: -1 },
    vakkenvullen: { bins: 1, pinShare: 1, missBudget: -1 },
  };
  const SOFT = { snake: { coinEvery: -1 }, tetris: { garbage: 1 }, winkelmandje: { sway: 1 }, bezorgroute: { pins: 1, decoys: 1 }, prikken: { sway: 1 }, vakkenvullen: { pics: -1 } };
  for (const g of GAMES) {
    it(g.id, () => {
      const d = g.levels.map(l => l.diff);
      assert.ok(RULES[g.id], `${g.id}: add its difficulty knobs to RULES (which must rise or fall from level to level)`);
      for (const [k, dir] of Object.entries(RULES[g.id])) {
        for (let i = 1; i < 3; i++) assert.ok((d[i][k] - d[i - 1][k]) * dir > 0, `${g.id}.${k}: level ${i} (${d[i - 1][k]}) -> level ${i + 1} (${d[i][k]}) must ${dir > 0 ? 'increase' : 'decrease'}`);
      }
      for (const [k, dir] of Object.entries(SOFT[g.id] || {})) {
        for (let i = 1; i < 3; i++) assert.ok((d[i][k] - d[i - 1][k]) * dir >= 0, `${g.id}.${k} must not go the wrong way`);
      }
    });
  }
  it('platformer level 3 is the only night level', () => {
    assert.equal(JSON.stringify(GAMES[0].levels.map(l => !!l.night)), '[false,false,true]'); // vm arrays are another realm: compare by value
  });
});
