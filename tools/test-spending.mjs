// Graduation Day's monthly spending limit: none by default (owner, 2 Nov); a player can still choose one.
//   node --test tools/test-spending.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWallet, wouldExceed } from '../src/economy/wallet.js';

const memory = (init = null) => { let v = init; return { load: () => v, save: o => { v = structuredClone(o); } }; };
const fresh = () => createWallet({ storage: memory(), now: () => Date.now() });
const saved = extra => {
  const w = fresh();
  w.setSpendingLimit(null);
  const raw = { ...JSON.parse(JSON.stringify(w.state)), ...extra };
  delete raw.limitChosen;
  return createWallet({ storage: memory({ ...raw, ...extra }), now: () => Date.now() });
};

test('a new wallet has no monthly limit', () => {
  assert.equal(fresh().spendingLimit, null);
});
test('an old save with the old default ($100, never chosen) loads with no limit', () => {
  assert.equal(saved({ spendingLimit: 100 }).spendingLimit, null);
});
test('a limit the player chose is kept: one marked as chosen, or any old value other than the old default', () => {
  assert.equal(saved({ spendingLimit: 100, limitChosen: true }).spendingLimit, 100);
  assert.equal(saved({ spendingLimit: 25 }).spendingLimit, 25);
  assert.equal(saved({ spendingLimit: 'lots' }).spendingLimit, null);
});
test('the player can pick no limit or $1–$100, and the choice is saved', () => {
  const store = memory();
  const w = createWallet({ storage: store, now: () => Date.now() });
  assert.equal(w.setSpendingLimit(20).ok, true);
  assert.equal(createWallet({ storage: store, now: () => Date.now() }).spendingLimit, 20);
  assert.equal(w.setSpendingLimit(null).ok, true);
  assert.equal(createWallet({ storage: store, now: () => Date.now() }).spendingLimit, null);
  assert.equal(w.setSpendingLimit(0).ok, false);
  assert.equal(w.setSpendingLimit(101).ok, false);
});
test('with no limit a $150 month is not blocked; with $100 chosen it is', () => {
  assert.equal(wouldExceed(null, 140, 9.99), false);
  assert.equal(wouldExceed(100, 95, 9.99), true);
  assert.equal(wouldExceed(100, 90, 9.99), false);
});
