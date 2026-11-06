// The server's clock (audit item 8): a phone whose clock is wrong (hours or days, ahead or behind) must never make a
// player play or submit the wrong chapter, or see a wrong countdown. The game keeps an offset from the server's
// `serverNow` (midpoint of send/receive), counts down by Date.now() + offset, plays and submits the SERVER's week from
// GET /challenge, and sends a pending run with the week it was played in.
//   node --test tools/test-server-clock.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { noteServerTime, serverNow, serverClockKnown, resetServerClock } from '../src/net/server-clock.js';
import { openPayments } from '../src/net/pay-api.js';
import { weekKey, weekEndsAt } from '../src/engine/challenge.js';

// localStorage for the game's pending-run store.
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
const compete = await import('../src/ui/compete.js');
const season = await import('../src/ui/season.js');

const H = 3600000, D = 24 * H;
const LINEUP = [{ rank: 1, label: 'A free night of boarding' }, { rank: 2, label: 'A free day of daycare and a free exit bath' }, { rank: 3, label: 'A free exit bath' }];
// What the server answers to GET /challenge at `at` (an ISO time), for the week it says it is.
function serverAnswer(at, { week = weekKey(Date.parse(at)), status = 'running', prizesConfirmed = true } = {}) {
  const chapters = ['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'];
  const inSeason = chapters.includes(week);
  const end = '2026-12-06T04:59:59.999Z';
  return {
    ok: true, week, serverNow: at, moves: 25, next: null, rules: { version: 1, challenges: ['high-score'], from: null },
    endsAt: inSeason && week === '2026-11-30' ? end : new Date(weekEndsAt(week)).toISOString(),
    prizes: inSeason ? (prizesConfirmed ? LINEUP : []) : [{ rank: 1, label: 'A free day of daycare' }, { rank: 2, label: 'A free bath' }, { rank: 3, label: 'A free bath' }],
    season: inSeason ? { id: 's1', name: 'Season 1: Top Dog', chapter: chapters.indexOf(week) + 1, chapters: 4, endsAt: end, ended: Date.parse(at) > Date.parse(end), prizes: prizesConfirmed ? LINEUP : null, prizesConfirmed, status } : null,
  };
}
// A phone whose clock is `skew` ms off the server's, asking the server at server time `at`.
async function askAt(at, skew) {
  const phone = Date.parse(at) + skew;
  const app = { services: { pay: { challengeWeek: async () => { noteServerTime(at, phone - 40, phone + 40); return serverAnswer(at); } } } };
  await compete.loadWeekPrizes(app);
  return phone;
}

beforeEach(() => { resetServerClock(); compete.forgetServerWeek(); mem.clear(); });

test('the offset is the server time minus the midpoint of send and receive; the phone clock until the first answer', () => {
  const phone = Date.parse('2026-11-21T15:00:00Z');
  assert.equal(serverClockKnown(), false);
  assert.equal(serverNow(phone), phone, 'no answer yet: the phone clock');
  assert.equal(noteServerTime('2026-11-18T15:00:00.000Z', phone - 300, phone + 100), true);
  assert.equal(serverClockKnown(), true);
  assert.equal(serverNow(phone - 100), Date.parse('2026-11-18T15:00:00.000Z'), 'the answer is placed halfway through the round trip');
  assert.equal(serverNow(phone + 3600000 - 100), Date.parse('2026-11-18T16:00:00.000Z'), 'and runs on with the phone');
  for (const bad of [null, undefined, '', 'nonsense', 12345]) assert.equal(noteServerTime(bad, phone, phone), false, `ignored: ${bad}`);
  assert.equal(noteServerTime('2026-11-18T15:00:00Z', phone, phone - 5), false, 'a receive before the send is ignored');
  assert.equal(serverNow(phone - 100), Date.parse('2026-11-18T15:00:00.000Z'), 'a bad answer keeps the last good offset');
});

test('every API answer with serverNow sets the offset (phone 3 days ahead)', async () => {
  const server = Date.parse('2026-11-18T15:00:00Z');
  const phone = server + 3 * D;
  const fetchImpl = async url => ({
    ok: true, status: 200,
    json: async () => (url.endsWith('/config') ? { payments: false, authUrl: 'http://auth', authKey: 'k' } : { ...serverAnswer('2026-11-18T15:00:00Z') }),
  });
  const pay = await openPayments({ fetchImpl, base: '', loc: null, hist: null, store: { load: () => null, save: () => {} }, now: () => phone });
  assert.equal(serverClockKnown(), false, 'the config answer has no serverNow');
  const r = await pay.challengeWeek();
  assert.equal(r.ok, true);
  assert.equal(serverClockKnown(), true);
  assert.equal(serverNow(phone), server, 'Date.now() + offset is the server time, not the phone\'s');
  await pay.leaderboard({ board: 'season' });
  assert.equal(serverNow(phone + 1000), server + 1000);
});

for (const [label, skew] of [['3 hours ahead', 3 * H], ['3 hours behind', -3 * H], ['6 days ahead', 6 * D], ['2 days behind', -2 * D], ['8 days ahead', 8 * D], ['9 days behind', -9 * D]]) {
  test(`phone ${label}: the chapter played, submitted and shown is the server's (Wed 18 Nov, chapter 2)`, async () => {
    const phone = await askAt('2026-11-18T15:00:00Z', skew);
    if (Math.abs(skew) > 2 * D) assert.notEqual(weekKey(phone), '2026-11-16', 'the phone alone would pick another chapter');
    assert.equal(compete.playWeek(serverNow(phone)), '2026-11-16');
    assert.equal(compete.weekSeason(compete.playWeek(serverNow(phone))).chapter, 2);
    assert.equal(season.seasonCountdown(compete.weekSeason('2026-11-16'), serverNow(phone)), 'Season ends in 17d 13h', 'counted down by the server clock');
  });
}

test('the default "now" is the server clock: Date.now() + offset', async () => {
  noteServerTime('2026-11-18T15:00:00Z', Date.now(), Date.now());
  await compete.loadWeekPrizes({ services: { pay: { challengeWeek: async () => serverAnswer('2026-11-18T15:00:00Z') } } });
  assert.equal(compete.playWeek(), '2026-11-16');
  assert.match(season.seasonCountdown(compete.weekSeason()), /^Season ends in 17d 1[23]h$/);
  assert.match(compete.endsInText('2026-11-16'), /^ends in 4d 1[34]h$/, 'the chapter countdown too (chapter 2 ends Mon 23 Nov)');
});

test('Monday chapter boundary: the server\'s chapter, whichever side of midnight the phone is on', async () => {
  // Mon 16 Nov 12:00:30 am New York; the phone is an hour behind (still Sunday, chapter 1).
  let phone = await askAt('2026-11-16T05:00:30Z', -H);
  assert.equal(weekKey(phone), '2026-11-09');
  assert.equal(compete.playWeek(serverNow(phone)), '2026-11-16');
  compete.forgetServerWeek(); resetServerClock();
  // Sun 15 Nov 11:30 pm New York; the phone is an hour ahead (already Monday, chapter 2).
  phone = await askAt('2026-11-16T04:30:00Z', H);
  assert.equal(weekKey(phone), '2026-11-16');
  assert.equal(compete.playWeek(serverNow(phone)), '2026-11-09');
  assert.equal(compete.weekSeason(compete.playWeek(serverNow(phone))).chapter, 1);
  // The page stays open past midnight by the server's clock: the next chapter, by the server's clock.
  assert.equal(compete.playWeek(serverNow(phone + 45 * 60000)), '2026-11-16');
});

test('Saturday 5 Dec season end and Sunday 6 Dec, with the phone a day off', async () => {
  // Sat 5 Dec 11:58 pm New York; the phone is a day behind (Friday).
  let phone = await askAt('2026-12-06T04:58:00Z', -D);
  const s = compete.weekSeason(compete.playWeek(serverNow(phone)));
  assert.equal(s.chapter, 4);
  assert.equal(season.seasonCountdown(s, serverNow(phone)), 'Season ends in 0h 1m', 'not "1d 0h"');
  assert.equal(season.seasonCountdown(s, serverNow(phone + 3 * 60000)), 'The season is over', 'over by the server clock');
  compete.forgetServerWeek(); resetServerClock();
  // Sun 6 Dec 12:06 am New York; the phone is two days behind (Friday): the season is over.
  phone = await askAt('2026-12-06T05:06:00Z', -2 * D);
  assert.equal(compete.playWeek(serverNow(phone)), '2026-11-30');
  assert.equal(season.seasonCountdown(compete.weekSeason('2026-11-30'), serverNow(phone)), 'The season is over');
  assert.equal(season.seasonOf('2026-11-30', null, serverNow(phone)).ended, true);
  compete.forgetServerWeek(); resetServerClock();
  // Sun 6 Dec with the phone a day ahead (Monday 7 Dec, a week outside the season): still the season's last week.
  phone = await askAt('2026-12-06T15:00:00Z', D);
  assert.equal(weekKey(phone), '2026-12-07');
  assert.equal(compete.playWeek(serverNow(phone)), '2026-11-30');
});

test('until the server answers, the phone\'s guess; then the server\'s week until it ends by the server clock', async () => {
  const phone = Date.parse('2026-11-24T15:00:00Z');
  assert.equal(compete.playWeek(serverNow(phone)), '2026-11-23', 'no answer: the phone');
  assert.equal(compete.serverWeekKnown(serverNow(phone)), false);
  await askAt('2026-11-18T15:00:00Z', 6 * D);
  assert.equal(compete.serverWeekKnown(serverNow(phone)), true);
  assert.equal(compete.playWeek(serverNow(phone)), '2026-11-16');
  assert.equal(compete.serverWeekKnown(serverNow(phone) + 5 * D), false, 'after the server\'s week ends (server clock) it must be asked again');
});

test('a pending run is sent with the week it was played in, whatever the phone clock says', async () => {
  // Played in chapter 1 before signing in; sent in chapter 2 with the phone 6 days ahead.
  compete.keepPendingRun({ week: '2026-11-09', moves: [[0, 0, 0, 1]], challenge: 'high-score' });
  await askAt('2026-11-18T15:00:00Z', 6 * D);
  const sent = [];
  const state = { home: 'hawthorne', weekly: { week: '2026-11-09', best: 0, results: {} } };
  const app = { services: { pay: { signedIn: true, submitChallenge: async run => { sent.push(run); return { ok: false, error: 'week-over' }; } }, backend: { state: () => state, markChallengeSent: () => {} } } };
  await compete.sendPendingRun(app);
  assert.deepEqual(sent, [{ week: '2026-11-09', moves: [[0, 0, 0, 1]], challenge: 'high-score' }]);
  assert.equal(localStorage.getItem('pawtastic-gd-pending-run-v1'), null, 'the server said week-over: dropped');
});

test('an unsent best of this chapter goes with the server\'s week, not the phone\'s', async () => {
  const phone = await askAt('2026-11-18T15:00:00Z', -9 * D);
  assert.equal(weekKey(phone), '2026-11-09');
  const sent = [];
  const state = { home: 'hawthorne', weekly: { week: '2026-11-16', best: 9000, bestMoves: [[1, 1, 1, 2]], sentBest: 0, results: {} } };
  const app = { services: { pay: { signedIn: true, submitChallenge: async run => { sent.push(run); return { ok: true, score: 9000 }; } }, backend: { state: () => state, markChallengeSent: () => {} } } };
  const realNow = Date.now; Date.now = () => phone;
  try { await compete.sendPendingRun(app); } finally { Date.now = realNow; }
  assert.deepEqual(sent, [{ week: '2026-11-16', moves: [[1, 1, 1, 2]], challenge: 'high-score' }]);
});
