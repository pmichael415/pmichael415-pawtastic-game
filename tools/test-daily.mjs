// The daily gift (owner's no-streak rule, 10 Nov 2026): one gift per day you play, a missed day just waits, the same
// seven gifts repeat, the welcome-back gift stays, and no player text says "streak", "attendance" or "Day N of 7".
//   node --test tools/test-daily.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWallet } from '../src/economy/wallet.js';
import { STREAK, WELCOME_BACK } from '../src/economy/catalog.js';
import { dailyGiftText } from '../src/ui/daily.js';

const DAY = 86400000;
const NOON = Date.parse('2026-11-10T17:00:00Z'); // noon in New York
const memory = () => { let v = null; return { load: () => v, save: o => { v = structuredClone(o); } }; };
function wallet() {
  let t = NOON;
  const w = createWallet({ storage: memory(), now: () => t });
  return { w, open: (days = 0) => { t += days * DAY; return w.onAppOpen(); } };
}
const gift = r => r.streak?.day;

test('the first open gives gift 1, and the same day gives nothing more', () => {
  const { open } = wallet();
  assert.equal(gift(open()), 1);
  assert.equal(open(0).streak, null);
});

test('a missed day does not reset the gift track', () => {
  const { open } = wallet();
  open(); open(1); open(1); // gifts 1, 2, 3
  assert.equal(gift(open(4)), 4); // four days later: gift 4, not gift 1
  assert.equal(gift(open(2)), 5);
});

test('after gift 7 the track starts again at gift 1', () => {
  const { open } = wallet();
  for (let i = 0; i < STREAK.length; i++) assert.equal(gift(open(i ? 1 : 0)), i + 1);
  assert.equal(gift(open(3)), 1);
});

test('the welcome-back gift after 7+ days away still comes, with the next daily gift', () => {
  const { open } = wallet();
  open(); open(1);
  const r = open(WELCOME_BACK.afterDays);
  assert.deepEqual(r.welcomeBack, WELCOME_BACK);
  assert.equal(gift(r), 3);
});

test('the daily gift sheet has no streak, attendance or "Day N of 7" wording', () => {
  for (const n of [1, 4, 7]) {
    const t = dailyGiftText({ gift: n, total: STREAK.length, reward: 'a Shuffle' });
    const all = [t.eyebrow, t.heading, t.listLabel, ...t.items, t.footer].join(' | ');
    assert.equal(t.eyebrow, 'Daily gift');
    assert.equal(t.heading, "Today's gift");
    assert.deepEqual(t.items, Array.from({ length: STREAK.length }, (_, i) => `Gift ${i + 1}`));
    assert.match(t.footer, /Next gift tomorrow\. Missed a day\? Your next gift waits for you\./);
    assert.doesNotMatch(all, /streak|attendance|day \d+ of|don.t lose|last chance|miss out|hurry/i, all);
  }
});
