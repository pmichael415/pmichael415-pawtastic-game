// The staff page's season panel (audit item 10): the staff `season` object from the server (status, the reason in
// plain words with its details, lineup confirmed, winners, prize emails, the owner summary), "Send pending emails", and
// "Close season now" (only after the season end + 5 minutes, by the server's clock). The old code's trap
// ('prize-week-occupied') is shown as a warning whenever the server reports it, even while the season runs.
//   node --test tools/test-staff-season.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.data = String(t); } get textContent() { return this.data; } }
class FakeElement extends FakeNode {
  constructor(tag) { super(); this.tagName = tag.toUpperCase(); this.childNodes = []; this.attributes = {}; this.listeners = {}; }
  setAttribute(k, v) { this.attributes[k] = v; }
  addEventListener(k, f) { this.listeners[k] = f; }
  append(...c) { this.childNodes.push(...c); }
  replaceChildren(...c) { this.childNodes = c; }
  set className(v) { this.attributes.class = v; }
  get textContent() { return this.childNodes.map(c => c.textContent).join(' '); }
  set textContent(v) { this.childNodes = [new FakeText(v)]; }
  all(tag) { return this.childNodes.flatMap(c => (c instanceof FakeElement ? [...(c.tagName === tag ? [c] : []), ...c.all(tag)] : [])); }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: t => new FakeElement(t), createTextNode: t => new FakeText(t) };

const { seasonPanel, seasonStatusText, seasonReasonText, seasonEmailsText, canCloseSeason, SEASON_GRACE_MS } = await import('../src/staff/season-panel.js');
const norm = t => t.replace(/\s+/g, ' ').trim();
const END = '2026-12-06T04:59:59.999Z';
const base = {
  id: 's1', name: 'Season 1: Top Dog', status: 'running', reason: null, details: null, lineupConfirmed: true, endsAt: END, closedAt: null,
  prizeWeek: '2026-11-09', winners: 0, emails: { prizes: { total: 0, sent: 0, pending: 0, retrying: 0, suppressed: 0 }, summary: 'none' },
};
const OCCUPIED = { weeks: ['2026-11-09'], closed_weeks: ['2026-11-09'], prize_weeks: ['2026-11-09'], prizes: { total: 4, won: 2, redeemed: 1, void: 1, emailed: 3 }, redeemed: 1 };
const render = (season, now = Date.parse('2026-11-18T15:00:00Z')) => seasonPanel(season, { now, act: async () => {} });
const buttons = el => Object.fromEntries(el.all('BUTTON').map(b => [norm(b.textContent), b]));

test('running + prize-week-occupied: the warning, with its numbers and weeks, while the season still runs', () => {
  const s = { ...base, reason: 'prize-week-occupied', details: OCCUPIED };
  const warning = seasonReasonText(s);
  assert.equal(warning, 'Warning: the old game already gave prizes under a Season 1 week (4 prizes, 1 redeemed, weeks 2026-11-09). The season will not close until the owner follows docs/season-1-recovery.md.');
  const text = norm(render(s).textContent);
  assert.ok(text.includes(warning), text);
  assert.match(text, /Running/);
  assert.match(text, /4 prizes: 2 not used yet, 1 redeemed, 1 voided, 3 emailed/);
});

test('running + reason null: no warning', () => {
  assert.equal(seasonReasonText(base), null);
  const text = norm(render(base).textContent);
  assert.doesNotMatch(text, /Warning|recovery|blocked/i, text);
  assert.match(text, /Prize lineup \(week of 2026-11-09\): confirmed/);
});

test('every status in plain words; the reason shown whatever the status', () => {
  assert.match(seasonStatusText(base), /^Running: it ends Sat, Dec 5, 11:59 PM \(New York time\)\.$/);
  assert.match(seasonStatusText({ ...base, status: 'awaiting-close' }), /^Ended: waiting for the season close/);
  assert.match(seasonStatusText({ ...base, status: 'blocked', reason: 'lineup-not-confirmed' }), /^Ended, but the season close is blocked/);
  assert.match(seasonStatusText({ ...base, status: 'closed', closedAt: '2026-12-06T05:10:00Z', winners: 6 }), /^Closed on Sun, Dec 6, 12:10 AM \(New York time\): 6 winners\.$/);
  assert.equal(seasonReasonText({ ...base, status: 'blocked', reason: 'lineup-not-confirmed' }), "The season's prize lineup (week of 2026-11-09) is not approved in full, so the season can't close. Approve all three prizes for that week, then close the season.");
  for (const status of ['running', 'awaiting-close', 'blocked']) {
    const text = norm(render({ ...base, status, reason: 'prize-week-occupied', details: OCCUPIED }).textContent);
    assert.match(text, /Warning: the old game already gave prizes under a Season 1 week/, status);
  }
  assert.match(seasonReasonText({ ...base, status: 'blocked', reason: 'something-new', details: { a: 1 } }), /blocked \(something-new\)/);
  assert.match(norm(render({ ...base, lineupConfirmed: false }).textContent), /Prize lineup \(week of 2026-11-09\): not confirmed/);
});

test('winners, prize emails and the owner summary', () => {
  const s = { ...base, status: 'closed', closedAt: END, winners: 6, emails: { prizes: { total: 6, sent: 3, pending: 1, retrying: 1, suppressed: 1 }, summary: 'retrying' } };
  assert.equal(seasonEmailsText(s), 'Prize emails: 3 sent, 1 waiting, 1 retrying, 1 suppressed (will not be sent) of 6. Owner summary: retrying.');
  const text = norm(render(s, Date.parse(END) + 3600000).textContent);
  assert.match(text, /Winners: 6/);
  assert.match(text, /Prize emails: 3 sent, 1 waiting, 1 retrying/);
  assert.equal(seasonEmailsText(base), 'Prize emails: none yet (they go out after the season close). Owner summary: not yet.');
});

test('"Close season now" only after the season end + 5 minutes by the server clock, and never once closed', () => {
  const end = Date.parse(END);
  assert.equal(SEASON_GRACE_MS, 5 * 60000);
  assert.equal(canCloseSeason({ ...base, status: 'running' }, end - 1), false);
  assert.equal(canCloseSeason({ ...base, status: 'awaiting-close' }, end + SEASON_GRACE_MS - 1), false);
  assert.equal(canCloseSeason({ ...base, status: 'awaiting-close' }, end + SEASON_GRACE_MS), true);
  assert.equal(canCloseSeason({ ...base, status: 'blocked', reason: 'lineup-not-confirmed' }, end + 3600000), true);
  assert.equal(canCloseSeason({ ...base, status: 'closed' }, end + 3600000), false);
  const early = buttons(render({ ...base, status: 'awaiting-close' }, end + 60000));
  assert.equal(early['Close season now'].disabled, true);
  const late = buttons(render({ ...base, status: 'awaiting-close' }, end + SEASON_GRACE_MS + 1));
  assert.notEqual(late['Close season now'].disabled, true);
  assert.ok(late['Send pending emails'], 'the send button is always there');
});

test('the buttons send the contract\'s actions', async () => {
  const sent = [];
  const el = seasonPanel({ ...base, status: 'blocked', reason: 'lineup-not-confirmed' }, { now: Date.parse(END) + 3600000, act: async body => { sent.push(body); return { ok: true, season: { ...base, status: 'closed' } }; }, confirmFn: () => true });
  const b = buttons(el);
  await b['Close season now'].listeners.click();
  await b['Send pending emails'].listeners.click();
  assert.deepEqual(sent, [{ action: 'close-season' }, { action: 'send-emails' }]);
});
