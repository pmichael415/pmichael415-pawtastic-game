// Weekly Challenge formats (Increment 2): versioned rules, the three challenges' scoring on replay, badge tiers,
// tips, week boundaries in New York time, the wallet's per-challenge results, badges and trophies, and the
// Beat My Pup link and caption (no score ever travels in a link).
//   node --test tools/test-challenge.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHALLENGES, CHALLENGE_IDS, COMBO_SCALE, CLEANUP, isChallengeId, rulesFor, replayChallenge, newChallengeGame, sampleRun, combinedTotal,
  tierOf, tipFor, CHALLENGE_TIPS, movesFor, weekKey, nextWeek, weekEndsAt, isWeekKey, TIER_ORDER, cleanupScore, comboOf,
} from '../src/engine/challenge.js';
import { trySwap } from '../src/engine/game.js';
import { createWallet, TROPHIES } from '../src/economy/wallet.js';
import { resultCaption, beatLink } from '../src/ui/share-card.js';
import { gameLink, gameSite } from '../src/net/embed.js';

const memory = () => { let v = null; return { load: () => v, save: o => { v = structuredClone(o); } }; };
const WEEK = '2026-11-02';
const NEXT = '2026-11-09';

// ---------- rules ----------
test('version 1 until the scheduled Monday, version 2 from it on; weeks before it never change', () => {
  assert.deepEqual(rulesFor(WEEK, null), { version: 1, challenges: ['high-score'], combined: false, from: null });
  assert.equal(rulesFor(WEEK, NEXT).version, 1);
  assert.equal(rulesFor(WEEK, NEXT).from, NEXT, 'the teaser knows the date');
  assert.equal(rulesFor(NEXT, NEXT).version, 2);
  assert.deepEqual(rulesFor('2026-11-16', NEXT).challenges, ['high-score', 'combo', 'cleanup']);
  assert.equal(rulesFor(WEEK, 'not-a-week').version, 1, 'garbage never switches the format');
  assert.equal(rulesFor(WEEK, '2026-11-03').version, 1, 'a non-Monday is not a week key');
});

test('challenge ids and move counts', () => {
  assert.deepEqual(CHALLENGE_IDS, ['high-score', 'combo', 'cleanup']);
  assert.equal(movesFor('high-score'), 25); assert.equal(movesFor('combo'), 20); assert.equal(movesFor('cleanup'), 30);
  assert.equal(isChallengeId('combo'), true); assert.equal(isChallengeId('boss'), false); assert.equal(isChallengeId(null), false);
  for (const id of CHALLENGE_IDS) assert.deepEqual(CHALLENGES[id].tiers, [15000, 25000, 38000], 'one tier ladder for all, since scores are normalized');
});

// ---------- replay ----------
test('every format replays deterministically to the same normalized score, and the live counters agree', () => {
  for (const challenge of CHALLENGE_IDS) {
    const run = sampleRun(WEEK, challenge);
    const a = replayChallenge(WEEK, run.moves, challenge);
    const b = replayChallenge(WEEK, run.moves, challenge);
    assert.equal(a.ok, true, `${challenge} sample replays`);
    assert.deepEqual(a, b, `${challenge} is deterministic`);
    // Play it again by hand and check the HUD's live arithmetic against the replay.
    const game = newChallengeGame(WEEK, challenge);
    let combo = 0, bestChain = 0;
    for (const [r1, c1, r2, c2] of run.moves) {
      const res = trySwap(game, { r: r1, c: c1 }, { r: r2, c: c2 });
      assert.equal(res.ok, true);
      combo += comboOf(res.steps); bestChain = Math.max(bestChain, res.steps.length);
    }
    if (challenge === 'high-score') assert.equal(a.score, game.score);
    if (challenge === 'combo') { assert.equal(a.score, Math.round(combo * COMBO_SCALE)); assert.equal(a.raw, combo); assert.equal(a.bestChain, bestChain); }
    if (challenge === 'cleanup') { assert.equal(a.score, cleanupScore(game)); assert.equal(typeof a.clean, 'boolean'); assert.equal(a.cleaned <= a.total, true); }
  }
});

test('a cleanup run may end early (clean board) but no run may be short, long, or use an impossible swap', () => {
  const hs = sampleRun(WEEK, 'high-score');
  assert.equal(replayChallenge(WEEK, hs.moves.slice(0, 24), 'high-score').ok, false, 'a 24-move high score run is unfinished');
  assert.equal(replayChallenge(WEEK, [...hs.moves, hs.moves[0]], 'high-score').ok, false, 'a 26th move is refused');
  const combo = sampleRun(WEEK, 'combo');
  assert.equal(combo.moves.length, 20);
  assert.equal(replayChallenge(WEEK, combo.moves, 'high-score').ok, false, 'a combo run is not a high score run');
  const clean = sampleRun(WEEK, 'cleanup');
  assert.equal(clean.moves.length <= 30, true);
  assert.equal(replayChallenge(WEEK, [...clean.moves, [0, 0, 0, 1]], 'cleanup').ok, false, 'a move after the board is finished is refused');
  assert.equal(replayChallenge(WEEK, [[0, 0, 7, 7], ...hs.moves.slice(1)], 'high-score').ok, false, 'a non-adjacent swap is a bad move');
  assert.equal(replayChallenge(WEEK, hs.moves, 'boss').ok, false, 'an unknown challenge is a bad run');
  assert.equal(replayChallenge(WEEK, 'moves', 'high-score').ok, false);
});

test('the same week gives different boards per challenge; different weeks give different boards', () => {
  const a = newChallengeGame(WEEK, 'high-score'), b = newChallengeGame(WEEK, 'combo'), c = newChallengeGame(NEXT, 'high-score');
  const sig = g => JSON.stringify(g.grid.cells.map(cell => cell?.tile?.kind ?? null));
  assert.notEqual(sig(a), sig(b));
  assert.notEqual(sig(a), sig(c));
  assert.equal(sig(a), sig(newChallengeGame(WEEK, 'high-score')), 'and the same week + challenge is identical for everyone');
  assert.equal(a.level.goal.type, 'attack'); assert.equal(b.level.goal.type, 'attack'); assert.equal(newChallengeGame(WEEK, 'cleanup').level.goal.type, 'cleanup');
  assert.equal(newChallengeGame(WEEK, 'cleanup').mudTotal + newChallengeGame(WEEK, 'cleanup').leashTotal > 0, true, 'a cleanup board has things to clean');
});

// ---------- scoring helpers ----------
test('combined totals add the best of each challenge and ignore junk', () => {
  assert.equal(combinedTotal({ 'high-score': 12000, combo: 9000.9, cleanup: 5000 }), 26000);
  assert.equal(combinedTotal({ 'high-score': 12000, boss: 99999 }), 12000);
  assert.equal(combinedTotal({ combo: -5, cleanup: 'x' }), 0);
  assert.equal(combinedTotal(null), 0);
});

test('badge tiers: bronze 15,000, silver 25,000, gold 38,000; none for zero', () => {
  assert.equal(tierOf('high-score', 0), null);
  assert.equal(tierOf('high-score', 14999), null);
  assert.equal(tierOf('combo', 15000), 'bronze');
  assert.equal(tierOf('cleanup', 24999), 'bronze');
  assert.equal(tierOf('cleanup', 25000), 'silver');
  assert.equal(tierOf('high-score', 38000), 'gold');
  assert.equal(tierOf('boss', 50000), null);
  assert.equal(TIER_ORDER.gold > TIER_ORDER.silver && TIER_ORDER.silver > TIER_ORDER.bronze, true);
  assert.equal(CLEANUP.perItem, 800);
});

test('a tip after every run, cycling through the challenge\'s tips', () => {
  for (const id of CHALLENGE_IDS) {
    const tips = CHALLENGE_TIPS[id];
    assert.equal(tips.length >= 3, true);
    assert.equal(tipFor(id, 1), tips[0]);
    assert.equal(tipFor(id, tips.length + 1), tips[0], 'wraps around');
    assert.equal(tipFor(id, 2), tips[1]);
    assert.equal(tipFor(id, 0), tips[0], 'a bad run number is harmless');
  }
  assert.equal(tipFor('boss', 1), CHALLENGE_TIPS['high-score'][0]);
});

// ---------- weeks (America/New_York) ----------
test('weeks turn at midnight Monday New York time, across the DST change too', () => {
  // Sunday 1 Nov 2026 is the DST end in New York (02:00 EDT → 01:00 EST).
  const sunNight = Date.parse('2026-11-02T04:30:00Z'); // Sun 1 Nov 23:30 EST
  const monMorning = Date.parse('2026-11-02T05:30:00Z'); // Mon 2 Nov 00:30 EST
  assert.equal(weekKey(sunNight), '2026-10-26');
  assert.equal(weekKey(monMorning), '2026-11-02');
  assert.equal(weekKey(Date.parse('2026-11-02T00:00:00Z')), '2026-10-26', 'UTC Monday midnight is still Sunday evening in New York');
  assert.equal(nextWeek('2026-10-26'), '2026-11-02');
  assert.equal(nextWeek('2026-12-28'), '2027-01-04', 'rolls over the year');
  assert.equal(weekEndsAt('2026-10-26'), Date.parse('2026-11-02T05:00:00Z'), 'the week ends at 00:00 EST Monday (05:00Z after DST ends)');
  assert.equal(weekEndsAt('2026-10-19'), Date.parse('2026-10-26T04:00:00Z'), 'and at 04:00Z while still on EDT');
  assert.equal(isWeekKey('2026-11-02'), true); assert.equal(isWeekKey('2026-11-03'), false); assert.equal(isWeekKey('2026-11-2'), false);
  assert.equal(weekKey(weekEndsAt('2026-10-26')), '2026-11-02', 'the end of a week is the start of the next');
  assert.equal(weekKey(weekEndsAt('2026-10-26') - 1), '2026-10-26');
});

// ---------- wallet: results, badges, trophies ----------
function wallet() { return createWallet({ storage: memory(), now: () => Date.now() }); }
const MOVES = [[0, 0, 0, 1]];

test('results are kept per challenge; only a better run raises the best; totals come from bests', () => {
  const w = wallet();
  let r = w.recordChallenge(WEEK, 12000, MOVES, { challenge: 'high-score', tier: null });
  assert.deepEqual([r.best, r.bestScore, r.runs, r.newBadge, r.newTrophies], [true, 12000, 1, null, ['first-run']]);
  r = w.recordChallenge(WEEK, 9000, MOVES, { challenge: 'high-score', tier: null });
  assert.deepEqual([r.best, r.bestScore, r.runs], [false, 12000, 2]);
  r = w.recordChallenge(WEEK, 16000, MOVES, { challenge: 'combo', raw: 22857, tier: 'bronze' });
  assert.deepEqual([r.best, r.bestScore, r.newBadge, r.newTrophies], [true, 16000, 'bronze', ['first-bronze']]);
  const res = w.weeklyResults(WEEK);
  assert.equal(res['high-score'].best, 12000); assert.equal(res.combo.best, 16000); assert.equal(res.combo.raw, 22857); assert.equal(res.cleanup, undefined);
  assert.equal(w.state.weekly.best, 12000, 'the legacy high-score field still follows the High score run');
  assert.equal(combinedTotal({ 'high-score': res['high-score'].best, combo: res.combo.best }), 28000);
  assert.deepEqual(w.weeklyResults(NEXT), {}, 'another week has no results yet');
});

test('a new week starts fresh results but keeps the collection', () => {
  const w = wallet();
  w.recordChallenge(WEEK, 26000, MOVES, { challenge: 'cleanup', tier: 'silver', extra: { clean: true } });
  assert.deepEqual(w.state.collection.trophies, ['first-run', 'first-silver', 'clean-sweep']);
  w.recordChallenge(NEXT, 1000, MOVES, { challenge: 'high-score' });
  assert.deepEqual(w.weeklyResults(WEEK), {}, 'last week is gone from the weekly slot');
  assert.equal(w.weeklyResults(NEXT)['high-score'].best, 1000);
  assert.equal(w.state.collection.badges.length, 1, 'but the silver badge from last week stays');
  assert.equal(w.state.collection.badges[0].week, WEEK);
  assert.equal(w.state.collection.runs, 2);
});

test('badges only ever upgrade within a week; the same tier again earns nothing new', () => {
  const w = wallet();
  assert.equal(w.recordChallenge(WEEK, 40000, MOVES, { challenge: 'high-score', tier: 'gold' }).newBadge, 'gold');
  assert.equal(w.recordChallenge(WEEK, 16000, MOVES, { challenge: 'high-score', tier: 'bronze' }).newBadge, null, 'a bronze run after gold changes nothing');
  assert.equal(w.recordChallenge(WEEK, 41000, MOVES, { challenge: 'high-score', tier: 'gold' }).newBadge, null, 'gold again is not new');
  assert.equal(w.state.collection.badges.filter(b => b.week === WEEK && b.challenge === 'high-score').length, 1);
  assert.equal(w.state.collection.badges[0].score, 40000, 'the badge keeps the score that earned it');
});

test('trophies: all three formats, gold in all three, the 5-chain, ten runs', () => {
  const w = wallet();
  w.recordChallenge(WEEK, 40000, MOVES, { challenge: 'high-score', tier: 'gold' });
  w.recordChallenge(WEEK, 40000, MOVES, { challenge: 'combo', tier: 'gold', extra: { bestChain: 5 } });
  const r = w.recordChallenge(WEEK, 40000, MOVES, { challenge: 'cleanup', tier: 'gold', extra: { clean: false } });
  assert.deepEqual(r.newTrophies, ['three-formats', 'all-gold-week']);
  assert.equal(w.state.collection.trophies.includes('chain-5'), true);
  assert.equal(w.state.collection.trophies.includes('clean-sweep'), false, 'no clean sweep without a clean board');
  for (let i = 0; i < 7; i++) w.recordChallenge(WEEK, 100, MOVES, { challenge: 'high-score' });
  assert.equal(w.state.collection.trophies.includes('ten-runs'), true);
  assert.equal(w.state.collection.trophies.length, new Set(w.state.collection.trophies).size, 'no duplicates');
  for (const id of w.state.collection.trophies) assert.equal(TROPHIES.some(t => t.id === id), true);
});

test('sent marks are per challenge, and a reload keeps results, badges and trophies but drops junk', () => {
  const store = memory();
  const w = createWallet({ storage: store, now: () => Date.now() });
  w.recordChallenge(WEEK, 12000, MOVES, { challenge: 'high-score' });
  w.recordChallenge(WEEK, 16000, MOVES, { challenge: 'combo', tier: 'bronze' });
  w.markChallengeSent(WEEK, 16000, 'combo');
  assert.equal(w.weeklyResults(WEEK).combo.sentBest, 16000);
  assert.equal(w.weeklyResults(WEEK)['high-score'].sentBest, 0);
  w.markChallengeSent(NEXT, 999, 'combo');
  assert.equal(w.weeklyResults(WEEK).combo.sentBest, 16000, 'another week\'s mark is ignored');
  // Tamper with storage: a fake badge, a fake trophy, a fake result, a bogus challenge.
  const saved = store.load();
  saved.collection.badges.push({ week: WEEK, challenge: 'cleanup', tier: 'diamond', score: 'lots' });
  saved.collection.trophies.push('free-money', 42);
  saved.weekly.results.boss = { best: 99999, raw: 0, bestMoves: null, sentBest: 0, runs: 1 };
  saved.weekly.results.combo.best = 'NaN';
  const again = createWallet({ storage: store, now: () => Date.now() });
  assert.equal(again.state.collection.badges.length, 1);
  assert.deepEqual(again.state.collection.trophies, ['first-run', 'first-bronze'], 'unknown trophies are dropped');
  assert.equal(again.weeklyResults(WEEK).boss, undefined);
  assert.equal(again.weeklyResults(WEEK).combo.best, 0, 'a corrupt best resets to 0');
  assert.equal(again.weeklyResults(WEEK)['high-score'].best, 12000);
});

// ---------- Beat My Pup ----------
test('the Beat My Pup link opens the game itself and carries only the challenge and the week — never a score', () => {
  const doc = { querySelector: () => ({ content: 'https://pawtastic-graduation.lovable.app' }) };
  const hub = { protocol: 'https:', origin: 'https://play.pawtasticacademy.com' };
  assert.equal(gameSite(doc, hub), 'https://pawtastic-graduation.lovable.app', 'inside the hub the game\'s own site is used (the hub does not serve /play)');
  assert.equal(gameSite({ querySelector: () => null }, hub), 'https://play.pawtasticacademy.com');
  assert.equal(gameSite({ querySelector: () => ({ content: 'https://evil.example' }) }, hub), 'https://play.pawtasticacademy.com', 'only the allowlisted server counts');
  assert.equal(gameSite({ querySelector: () => null }, { protocol: 'file:' }), 'https://pawtastic-graduation.lovable.app');
  const link = beatLink({ challenge: 'combo', week: WEEK }, { doc: { querySelector: () => null }, loc: hub });
  assert.equal(link, 'https://play.pawtasticacademy.com/play/index.html?beat=combo&week=2026-11-02');
  assert.equal(beatLink({ challenge: 'boss', week: 'tuesday' }, { doc: { querySelector: () => null }, loc: hub }), 'https://play.pawtasticacademy.com/play/index.html?beat=high-score');
  assert.equal(/score|pts|=\d{4,}/.test(link.replace(/week=\d{4}-\d{2}-\d{2}/, '')), false, 'no score in the link');
  assert.equal(gameLink('', { querySelector: () => null }, hub), 'https://play.pawtasticacademy.com/play/index.html');
});

test('the caption names the pup, the verified score and the challenge', () => {
  assert.equal(resultCaption({ dogName: 'Biscuit', challenge: 'combo', score: 23400, tier: 'bronze' }),
    "Biscuit scored 23,400 in this week's Combo run at PAWtastic Academy (Bronze badge). Can your pup beat it?");
  assert.equal(resultCaption({ dogName: '', challenge: 'cleanup', score: 5 }), "My pup scored 5 in this week's Cleanup puzzle at PAWtastic Academy. Can your pup beat it?");
});
