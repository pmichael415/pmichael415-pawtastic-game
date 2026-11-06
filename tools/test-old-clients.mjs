// Old clients (audit item 12): a page that was already open before the fixed build (e152737 or the hooked 8b5e0a8
// build) may have kept a finished run to send after sign-in. The fixed build must read those runs exactly as stored,
// send them with the week they were played in, and keep the legacy POST body { week, moves } for the High score run.
// See docs/season-1-old-clients.md.
//   node --test tools/test-old-clients.mjs
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openPayments } from '../src/net/pay-api.js';
import { resetServerClock } from '../src/net/server-clock.js';

const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
const compete = await import('../src/ui/compete.js');
const KEY = 'pawtastic-gd-pending-run-v1';
const MOVES = [[3, 3, 3, 4], [5, 1, 6, 1]];

beforeEach(() => { mem.clear(); compete.forgetServerWeek(); resetServerClock(); });

async function sendWith(answer = { ok: true, score: 9000 }) {
  const sent = [];
  const state = { home: 'hillsdale', weekly: { week: null, best: 0, results: {} } };
  const app = { services: { pay: { signedIn: true, submitChallenge: async run => { sent.push(run); return answer; } }, backend: { state: () => state, markChallengeSent: () => {} } } };
  await compete.sendPendingRun(app);
  return sent;
}

test('the pending-run store is unchanged: same key, same shape (per challenge, with its week)', () => {
  compete.keepPendingRun({ week: '2026-11-16', moves: MOVES, challenge: 'high-score' });
  assert.deepEqual(JSON.parse(mem.get(KEY)), { 'high-score': { week: '2026-11-16', moves: MOVES, challenge: 'high-score' } });
  compete.keepPendingRun({ week: '2026-11-16', moves: MOVES }); // a caller that leaves out the challenge
  assert.deepEqual(JSON.parse(mem.get(KEY)), { 'high-score': { week: '2026-11-16', moves: MOVES, challenge: 'high-score' } });
});

test('a run kept by an already-open old build (e152737 / 8b5e0a8 shape) is sent with the week it was played in', async () => {
  mem.set(KEY, JSON.stringify({ 'high-score': { week: '2026-11-09', moves: MOVES, challenge: 'high-score' } }));
  assert.deepEqual(await sendWith(), [{ week: '2026-11-09', moves: MOVES, challenge: 'high-score' }]);
  assert.equal(mem.has(KEY), false, 'sent: dropped');
});

test('the oldest single-run shape { week, moves } still sends too', async () => {
  mem.set(KEY, JSON.stringify({ week: '2026-11-16', moves: MOVES }));
  assert.deepEqual(await sendWith(), [{ week: '2026-11-16', moves: MOVES, challenge: 'high-score' }]);
});

test('a pending run is kept when the server could not be reached, and dropped only on the server\'s final answers', async () => {
  mem.set(KEY, JSON.stringify({ 'high-score': { week: '2026-11-16', moves: MOVES, challenge: 'high-score' } }));
  await sendWith({ ok: false, error: 'offline' });
  assert.ok(mem.has(KEY), 'offline: kept for next time');
  await sendWith({ ok: false, error: 'server' });
  assert.ok(mem.has(KEY), 'server error: kept');
  await sendWith({ ok: false, error: 'week-over' });
  assert.equal(mem.has(KEY), false, 'week-over (the chapter or season is over): dropped');
});

test('the legacy POST body: { week, moves } for the High score run, { week, moves, challenge } for the others', async () => {
  const bodies = [];
  const fetchImpl = async (url, init = {}) => {
    if (url.endsWith('/config')) return { ok: true, status: 200, json: async () => ({ payments: false, authUrl: 'http://auth', authKey: 'k' }) };
    bodies.push({ url, method: init.method, body: init.body });
    return { ok: true, status: 200, json: async () => ({ score: 1, serverNow: '2026-11-18T15:00:00Z' }) };
  };
  const store = { load: () => ({ access_token: 't', refresh_token: 'r', expires_at: 4102444800, user_id: 'u', email: 'a@b.co' }), save: () => {} };
  const pay = await openPayments({ fetchImpl, base: '', loc: null, hist: null, store });
  await pay.submitChallenge({ week: '2026-11-16', moves: MOVES, challenge: 'high-score' });
  await pay.submitChallenge({ week: '2026-11-16', moves: MOVES });
  await pay.submitChallenge({ week: '2026-11-16', moves: MOVES, challenge: 'combo' });
  assert.deepEqual(bodies.map(b => [b.method, b.url, JSON.parse(b.body)]), [
    ['POST', '/api/public/game/challenge', { week: '2026-11-16', moves: MOVES }],
    ['POST', '/api/public/game/challenge', { week: '2026-11-16', moves: MOVES }],
    ['POST', '/api/public/game/challenge', { week: '2026-11-16', moves: MOVES, challenge: 'combo' }],
  ]);
});
