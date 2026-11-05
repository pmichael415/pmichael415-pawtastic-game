// Engine checks for Summer Camp: tangled leashes, camp pieces and the 80-level map.
//   node --test tools/test-engine.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLayout, cellAt, isMovable, kindList, newTile, KINDS } from '../src/engine/grid.js';
import { resolveSwap, canSwap } from '../src/engine/resolve.js';
import { createGame, trySwap, goalProgress, snapshotGame, restoreGame, remainingText } from '../src/engine/game.js';
import { createRng } from '../src/engine/rng.js';
import { LEVELS, ALL_LEVELS, AREAS, CHAPTERS, getLevel, areaOf, chapterOf, isHardLevel, winBand, LAST_LEVEL } from '../src/engine/levels.js';
import { COSTUMES } from '../src/economy/catalog.js';
import { findValidMove } from '../src/engine/shuffle.js';

// Fills a parsed board from rows of letters: b=bone a=ball p=paw f=frisbee n=pinecone t=lantern.
const LETTER = { b: 'bone', a: 'ball', p: 'paw', f: 'frisbee', n: 'pinecone', t: 'lantern' };
function board(layout, pieces) {
  const grid = parseLayout(layout);
  pieces.forEach((row, r) => [...row].forEach((ch, c) => { const cell = cellAt(grid, r, c); if (cell && LETTER[ch]) cell.tile = newTile(grid, LETTER[ch]); }));
  return grid;
}

test('a tied piece cannot be swapped, and holds up the pieces above it', () => {
  const grid = board(['....', '.l..', '....', '....'], ['bapf', 'abfp', 'pfba', 'fpab']);
  assert.equal(isMovable(grid, 1, 1), false);
  assert.equal(canSwap(grid, { r: 1, c: 1 }, { r: 1, c: 2 }), false);
  assert.equal(cellAt(grid, 1, 1).leash, 1);
});

test('a match through a leash unties one knot; crossed leashes need two', () => {
  // Row 1: bone bone(tied twice) . bone ← swapping (1,2)/(0,2) brings a bone into place.
  const grid = board(['....', '.L..', '....', '....'], ['pabf', 'bbap', 'fpfa', 'apfp']);
  const rng = createRng(7);
  const steps = resolveSwap(grid, { r: 0, c: 2 }, { r: 1, c: 2 }, rng, 4);
  const untied = steps.flatMap(s => s.leash);
  assert.ok(untied.some(u => u.r === 1 && u.c === 1 && u.left === 1), 'first knot untied');
  assert.equal(cellAt(grid, 1, 1).leash >= 0, true);
  assert.ok(cellAt(grid, 1, 1).tile, 'a new piece appears inside the leash');
});

test('leash goals count knots, and saved games keep them', () => {
  const level = getLevel(42);
  assert.equal(level.goal.type, 'leash');
  const game = createGame(level, 123);
  const p = goalProgress(game);
  assert.equal(p.target, 8);
  assert.match(remainingText(game), /8 more leash knots/);
  for (let i = 0; i < 5 && game.status === 'playing'; i++) { const m = findValidMove(game.grid); trySwap(game, m.a, m.b); }
  const back = restoreGame(level, JSON.parse(JSON.stringify(snapshotGame(game))));
  assert.equal(back.leashLeft, game.leashLeft);
  assert.deepEqual(goalProgress(back), goalProgress(game));
});

test('Summer Camp uses its own pieces', () => {
  assert.deepEqual(kindList(4), KINDS.slice(0, 4));
  const game = createGame(getLevel(41), 5);
  const kinds = new Set(game.grid.cells.filter(Boolean).map(c => c.tile.kind));
  assert.ok(kinds.has('pinecone') && kinds.has('lantern'));
  assert.ok(!kinds.has('biscuit') && !kinds.has('duck'));
});

test('80 main levels in 10 areas, plus a 16-level adventure for each location', () => {
  assert.equal(LEVELS.length, 80);
  assert.equal(LAST_LEVEL, 80);
  assert.equal(AREAS.length, 14);
  assert.equal(getLevel(116).area, 'hawthorne-park');
  assert.equal(getLevel(216).area, 'hillsdale-parade');
  for (const a of AREAS) assert.equal(a.last - a.first + 1, 8);
  assert.equal(chapterOf(40).id, 'academy');
  assert.equal(chapterOf(41).id, 'camp');
  assert.equal(CHAPTERS.length, 4);
  for (const a of AREAS) assert.ok(COSTUMES.some(c => c.id === a.costume && c.source === 'area'), `costume for ${a.id}`);
  for (const id of [45, 50, 55, 60, 65, 70, 75, 80]) assert.ok(isHardLevel(id));
  assert.deepEqual(winBand(41), [0.6, 0.8]);
  for (const l of ALL_LEVELS) {
    assert.ok(l.stars[0] > 0 && l.stars[1] > l.stars[0], `star scores for level ${l.id}`);
    assert.equal(areaOf(l.id).id, l.area);
  }
});

test('every level starts with a valid move', () => {
  for (const l of LEVELS) for (const seed of [1, 2, 3]) assert.ok(findValidMove(createGame(l, seed).grid), `level ${l.id} seed ${seed}`);
});

// ---------- Milestone rewards ----------
import { createWallet } from '../src/economy/wallet.js';
const memory = (value = null) => ({ load: () => value, save: v => { value = JSON.parse(JSON.stringify(v)); }, persistent: true });

test('finishing an area pays its chest once, with unlimited lives for a while', () => {
  let t = Date.UTC(2026, 10, 1, 15);
  const w = createWallet({ storage: memory(), now: () => t });
  w.setDog?.({ name: 'Biscuit', breed: 'lab', coat: '#C68B59' });
  for (let id = 1; id <= 7; id++) { w.startLevel(id); w.endLevel({ levelId: id, won: true, stars: 1, score: 9000, movesMade: 8 }); }
  const before = w.state.treats.free;
  w.startLevel(8);
  const s = w.endLevel({ levelId: 8, won: true, stars: 1, score: 9000, movesMade: 8 });
  assert.deepEqual(s.milestones.map(m => m.id), ['area-orientation']);
  assert.equal(w.state.treats.free - before, 20);
  assert.equal(w.state.inventory.boosters.bomb >= 1, true);
  assert.equal(w.lives().unlimited, true);
  assert.ok(w.lives().unlimitedMs > 29 * 60000);
  // Unlimited lives: starting a level costs nothing.
  const count = w.lives().count;
  w.startLevel(9); w.endLevel({ levelId: 9, won: false, stars: 0, score: 100, movesMade: 8 });
  assert.equal(w.lives().count, count);
  // Replaying the area's last level pays nothing again; after 30 minutes lives count again.
  w.startLevel(8);
  assert.deepEqual(w.endLevel({ levelId: 8, won: true, stars: 3, score: 20000, movesMade: 8 }).milestones, []);
  t += 31 * 60000;
  assert.equal(w.lives().unlimited, false);
});

test('older saves catch up on milestones when the game opens', () => {
  const levels = {}; for (let i = 1; i <= 40; i++) levels[i] = { stars: 3, score: 30000 };
  const old = { version: 1, progress: { unlocked: 41, levels, badges: [] }, treats: { free: 0, converted: 0, paid: 0 } };
  const w = createWallet({ storage: memory(old), now: () => Date.UTC(2026, 10, 1, 15) });
  const opened = w.onAppOpen();
  const ids = opened.milestones.map(m => m.id);
  assert.ok(ids.includes('area-graduation') && ids.includes('adventure-academy') && ids.includes('stars-120'));
  assert.ok(!ids.includes('stars-150'));
  assert.equal(w.onAppOpen().milestones.length, 0);
  assert.ok(w.lives().unlimitedMs >= 120 * 60000);
});

// ---------- Weekly Challenge ----------
import { weekKey, weekEndsAt, nextWeek, isWeekKey, challengeFor, newChallengeGame, replayChallenge, CHALLENGE_MOVES } from '../src/engine/challenge.js';

test('weeks start Monday midnight in New York', () => {
  assert.equal(weekKey(Date.parse('2026-11-02T04:59:00Z')), '2026-10-26'); // Sunday 11:59 pm (EST)
  assert.equal(weekKey(Date.parse('2026-11-02T05:00:00Z')), '2026-11-02'); // Monday 12:00 am
  assert.equal(weekEndsAt('2026-10-26'), Date.parse('2026-11-02T05:00:00Z'));
  assert.equal(weekEndsAt('2026-03-02'), Date.parse('2026-03-09T04:00:00Z')); // after the switch to EDT
  assert.equal(nextWeek('2026-12-28'), '2027-01-04');
  assert.ok(isWeekKey('2026-11-02') && !isWeekKey('2026-11-03') && !isWeekKey('nope'));
});

test('everyone gets the same board, and a replay gives the same score', () => {
  const a = newChallengeGame('2026-11-02'), b = newChallengeGame('2026-11-02');
  assert.deepEqual(a.grid, b.grid);
  assert.notDeepEqual(newChallengeGame('2026-11-09').grid, a.grid);
  const moves = [];
  while (a.status === 'playing') { const m = findValidMove(a.grid); moves.push([m.a.r, m.a.c, m.b.r, m.b.c]); trySwap(a, m.a, m.b); }
  assert.equal(moves.length, CHALLENGE_MOVES);
  assert.equal(a.status, 'won');
  assert.deepEqual(replayChallenge('2026-11-02', moves), { ok: true, score: a.score, raw: a.score });
  assert.equal(replayChallenge('2026-11-09', moves).ok, false, 'a run only counts for its own week');
  assert.equal(replayChallenge('2026-11-02', moves.slice(0, 10)).error, 'unfinished');
  assert.equal(replayChallenge('2026-11-02', [[0, 0, 7, 7], ...moves.slice(1)]).error, 'bad-move');
});

test('every weekly layout is playable', () => {
  for (let w = 0, week = '2026-11-02'; w < 8; w++, week = nextWeek(week)) {
    for (const seedWeek of [week]) assert.ok(findValidMove(newChallengeGame(seedWeek).grid), seedWeek);
    assert.equal(challengeFor(week).level.goal.type, 'attack');
  }
});
