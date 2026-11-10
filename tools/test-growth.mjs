// Growth helpers (owner, 10 Nov 2026): readable prize dates in New York time, the expiry reminder, the free-evaluation
// booking links, and (task 7) how close a player is to a prize. Pure functions only.
//   node --test tools/test-growth.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekLabel, nyDate, nyLongDate, expiringSoon, evalLink, EVAL_LINKS } from '../src/ui/growth.js';

const DAY = 86400000;

test('prize weeks read like people talk: "Week of Oct 26"', () => {
  assert.equal(weekLabel('2026-10-26'), 'Week of Oct 26');
  assert.equal(weekLabel('2026-11-02'), 'Week of Nov 2');
  assert.equal(weekLabel('not a week'), 'Weekly Challenge');
});

test('prize dates are New York days', () => {
  assert.equal(nyDate('2026-12-09T05:00:00Z'), 'Dec 9'); // midnight in New York
  assert.equal(nyDate('2026-12-09T04:30:00Z'), 'Dec 8'); // still the evening before
  assert.equal(nyLongDate('2026-12-09T05:00:00Z'), 'Wed, Dec 9');
});

test('a won prize is "expiring soon" in its last 7 days only', () => {
  const now = Date.parse('2026-12-02T15:00:00Z');
  const p = days => ({ status: 'won', expiresAt: new Date(now + days * DAY).toISOString() });
  assert.equal(expiringSoon(p(6), now), true);
  assert.equal(expiringSoon(p(7), now), true);
  assert.equal(expiringSoon(p(8), now), false);
  assert.equal(expiringSoon(p(-0.1), now), false); // expired
  assert.equal(expiringSoon({ ...p(3), status: 'redeemed' }, now), false);
  assert.equal(expiringSoon({ status: 'won', expiresAt: 'nope' }, now), false);
});

test('free evaluation links go to each location\'s booking page, tagged so bookings are counted', () => {
  assert.equal(EVAL_LINKS.hawthorne, 'https://pawtasticacademy.com/booking-page-ht');
  assert.equal(EVAL_LINKS.hillsdale, 'https://pawtasticacademy.com/booking-page');
  assert.equal(evalLink('hillsdale', 'prize'), 'https://pawtasticacademy.com/booking-page?utm_source=graduation_day&utm_medium=game&utm_campaign=free_evaluation&utm_content=prize-hillsdale');
  assert.equal(evalLink('nowhere', 'prize'), 'https://pawtasticacademy.com/booking-page-ht?utm_source=graduation_day&utm_medium=game&utm_campaign=free_evaluation&utm_content=prize-hawthorne');
});

test('the map reminds about the won prize that expires first, within 7 days only', async () => {
  const { expiringPrize } = await import('../src/ui/growth.js');
  const now = Date.parse('2026-12-02T15:00:00Z');
  const at = d => new Date(now + d * DAY).toISOString();
  const prizes = [
    { id: 'a', status: 'won', expiresAt: at(20) },
    { id: 'b', status: 'won', expiresAt: at(5) },
    { id: 'c', status: 'won', expiresAt: at(3) },
    { id: 'd', status: 'redeemed', expiresAt: at(1) },
  ];
  assert.equal(expiringPrize(prizes, now)?.id, 'c');
  assert.equal(expiringPrize([prizes[0], prizes[3]], now), null);
  assert.equal(expiringPrize(null, now), null);
});

// How close a player is to a prize at their location (task 7). `entries` is the location's board, best first.
const board = scores => scores.map((score, i) => ({ rank: i + 1, score, dogName: `Dog ${i + 1}`, me: false }));
test('signed in and in the top 3: "You\'re in the prizes!"', async () => {
  const { prizeGap } = await import('../src/ui/growth.js');
  const g = prizeGap({ entries: board([900, 800, 700]), me: { rank: 2, score: 800 }, location: 'Hawthorne' });
  assert.equal(g.kind, 'in-prizes');
  assert.equal(g.text, "You're in the prizes! #2 at Hawthorne");
});
test('signed in, outside the prizes: places away, plus points when close to 3rd', async () => {
  const { prizeGap } = await import('../src/ui/growth.js');
  const near = prizeGap({ entries: board([900, 800, 700, 650, 600]), me: { rank: 5, score: 600 }, location: 'Hillsdale' });
  assert.equal(near.kind, 'places');
  assert.equal(near.text, '2 places from a prize at Hillsdale · 100 points from 3rd');
  const far = prizeGap({ entries: board([9000, 8000, 7000, 650]), me: { rank: 4, score: 650 }, location: 'Hillsdale' });
  assert.equal(far.text, '1 place from a prize at Hillsdale');
});
test('a guest gets the rank their best would have, ties going to whoever got there first', async () => {
  const { prizeGap } = await import('../src/ui/growth.js');
  const g = prizeGap({ entries: board([900, 800, 700, 600]), me: null, score: 700, location: 'Hawthorne' });
  assert.equal(g.rank, 4);
  assert.equal(g.text, "You'd be #4 at Hawthorne · 1 place from a prize");
  const top = prizeGap({ entries: board([900, 800, 700]), me: null, score: 850, location: 'Hawthorne' });
  assert.equal(top.rank, 2);
  assert.equal(top.text, "You'd be in the top 3 at Hawthorne!");
});
test('fewer than 3 players at the location: a guest is in the top 3', async () => {
  const { prizeGap } = await import('../src/ui/growth.js');
  const g = prizeGap({ entries: board([5000, 4000]), me: null, score: 10, location: 'Hillsdale' });
  assert.equal(g.kind, 'top3-open');
  assert.equal(g.rank, 3);
  assert.equal(g.text, "You'd be in the top 3 at Hillsdale!");
});
test('below the 50th entry the rank is unknown, never guessed', async () => {
  const { prizeGap } = await import('../src/ui/growth.js');
  const fifty = board(Array.from({ length: 50 }, (_, i) => 10000 - i * 10));
  const g = prizeGap({ entries: fifty, me: null, score: 5, location: 'Hawthorne' });
  assert.deepEqual(g, { kind: 'unknown', text: 'Join the leaderboard to see your rank', rank: null });
  assert.equal(prizeGap({ entries: fifty, me: null, score: 0, location: 'Hawthorne' }), null); // nothing played yet
});

// After signing in from the join card the page reloads; the game picks up where the player was (task 8).
const memStore = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
test('takeResume returns what was kept once, and nothing after 30 minutes', async () => {
  const { keepResume, takeResume, RESUME_KEY } = await import('../src/ui/growth.js');
  assert.equal(RESUME_KEY, 'pawtastic-gd-resume-v1');
  const store = memStore(); const t = Date.parse('2026-11-10T15:00:00Z');
  keepResume({ screen: 'leaderboard', board: 'season' }, store, t);
  assert.deepEqual(takeResume(t + 60000, store), { screen: 'leaderboard', board: 'season', at: t });
  assert.equal(takeResume(t + 60000, store), null); // read once
  keepResume({ screen: 'shop' }, store, t);
  assert.equal(takeResume(t + 31 * 60000, store), null); // too old
  store.setItem(RESUME_KEY, '{not json');
  assert.equal(takeResume(t, store), null);
  keepResume({ screen: 'somewhere-else' }, store, t);
  assert.equal(takeResume(t, store), null); // only known screens
});

// What a friend sees after the server answers their invite (task 9): calm, once, never a loop.
test('invite answers become one calm message, and only a network failure is retried', async () => {
  const { inviteMessage } = await import('../src/ui/referral.js');
  assert.deepEqual(inviteMessage({ ok: true, reward: 20, referrerRewarded: true }), { text: "Welcome! 20 Treats from your friend's invite are on their way.", done: true, joined: true });
  assert.deepEqual(inviteMessage({ ok: false, error: 'not-new' }), { text: 'Invite rewards are for new players. Have fun!', done: true, joined: false });
  for (const error of ['own-code', 'already-invited', 'unknown-code', 'not-on-board']) assert.deepEqual(inviteMessage({ ok: false, error }), { text: null, done: true, joined: false });
  for (const error of ['offline', 'server', 'signed-out']) assert.deepEqual(inviteMessage({ ok: false, error }), { text: null, done: false, joined: false });
});
