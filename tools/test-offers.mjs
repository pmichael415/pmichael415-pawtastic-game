// Owner's rules for store moments: a loss is never a sales moment, and the Starter Pack is
// suggested once, after the first area's last level is won.
//   node --test tools/test-offers.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWallet } from '../src/economy/wallet.js';

const memory = () => { let v = null; return { load: () => v, save: o => { v = structuredClone(o); } }; };
const wallet = () => createWallet({ storage: memory(), now: () => Date.now() });
const play = (w, levelId, won) => {
  assert.equal(w.startLevel(levelId).ok, true);
  return w.endLevel({ levelId, won, stars: won ? 1 : 0, score: won ? 1200 : 300, movesMade: 20 });
};

test('losing a level never triggers the Starter Pack offer', () => {
  const w = wallet();
  for (const lv of [1, 2, 3, 5, 6]) assert.equal(play(w, lv, false).starterPackOffer, false, `loss on level ${lv}`);
  assert.equal(w.state.starterPack.offerShown, false);
});

test('winning level 5 offers the Starter Pack once, and never again after that', () => {
  const w = wallet();
  for (const lv of [1, 2, 3, 4]) assert.equal(play(w, lv, true).starterPackOffer, false, `win on level ${lv}`);
  assert.equal(play(w, 5, true).starterPackOffer, true);
  assert.equal(w.state.starterPack.offerShown, true);
  assert.equal(play(w, 5, true).starterPackOffer, false, 'replaying level 5');
  assert.equal(play(w, 6, false).starterPackOffer, false, 'a later loss');
});

test('a player who already bought the Starter Pack is never offered it', () => {
  const w = wallet();
  assert.equal(w.applyPurchase('pi_test_starter', 'starter').ok, true);
  assert.equal(w.state.starterPack.bought, true);
  assert.equal(play(w, 5, true).starterPackOffer, false);
});
