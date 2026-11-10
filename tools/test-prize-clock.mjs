// Leftover, 10 Nov 2026: the prize card's "Use it by" note followed the phone's clock while the map reminder followed
// the server's; both now follow the server's clock.   node --test tools/test-prize-clock.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.data = String(t); } get textContent() { return this.data; } }
class FakeElement extends FakeNode {
  constructor(tag) { super(); this.tagName = tag.toUpperCase(); this.childNodes = []; this.attributes = {}; this.listeners = {}; this.style = {}; this.dataset = {}; }
  setAttribute(k, v) { this.attributes[k] = v; }
  addEventListener(k, f) { this.listeners[k] = f; }
  append(...c) { this.childNodes.push(...c); }
  appendChild(c) { this.childNodes.push(c); return c; }
  replaceChildren(...c) { this.childNodes = c; }
  set className(v) { this.attributes.class = v; }
  get textContent() { return this.childNodes.map(c => c.textContent).join(' '); }
  set textContent(v) { this.childNodes = [new FakeText(v)]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: t => new FakeElement(t), createTextNode: t => new FakeText(t) };

const { prizeCard } = await import('../src/ui/compete.js');
const { noteServerTime, resetServerClock } = await import('../src/net/server-clock.js');
const DAY = 86400000;

test('the prize card\'s last-days note follows the server\'s clock, not the phone\'s', () => {
  const phone = Date.now();
  const p = { id: 'p1', status: 'won', code: 'AB12CD', location: 'hawthorne', rank: 1, week: '2026-11-02', expiresAt: new Date(phone + 10 * DAY).toISOString() };
  resetServerClock();
  assert.doesNotMatch(prizeCard(p).textContent, /That is the last day/); // 10 days left by the phone
  noteServerTime(new Date(phone + 5 * DAY).toISOString(), phone, phone); // the server is 5 days ahead: 5 days left
  assert.match(prizeCard(p).textContent, /That is the last day/);
  resetServerClock();
});

// Leftover, 10 Nov 2026: the friend credit and "joined the board" waited for the LAST of several runs; now any accepted run counts.
test('sending waiting runs counts as joined when any of them was accepted', async () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
  const { sendPendingRun, playWeek } = await import('../src/ui/compete.js');
  const week = playWeek();
  const results = { combo: { best: 900, sentBest: 0, bestMoves: [[1, 2]] }, cleanup: { best: 800, sentBest: 0, bestMoves: [[3, 4]] } };
  const calls = [];
  const app = { services: {
    backend: { state: () => ({ home: 'hawthorne', weekly: { week, results } }), markChallengeSent: () => {} },
    pay: { signedIn: true, submitChallenge: async run => { calls.push(run.challenge); return run.challenge === 'combo' ? { ok: true, score: 900 } : { ok: false, error: 'server' }; } },
  } };
  const sent = await sendPendingRun(app);
  assert.deepEqual(calls, ['combo', 'cleanup']);
  assert.equal(sent?.ok, true);
});
