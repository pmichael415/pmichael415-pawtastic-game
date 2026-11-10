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
