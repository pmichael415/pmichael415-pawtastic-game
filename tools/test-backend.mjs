// Purchase safety on the public site: paid things come only from the server (Stripe), never from the browser.
//   node --test tools/test-backend.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWallet } from '../src/economy/wallet.js';
import { createLocalBackend, PAID_FEATURES, FREE_PLAY_FEATURES, DEMO_FEATURES } from '../src/backend/local.js';

const memory = () => { let v = null; return { load: () => v, save: o => { v = structuredClone(o); } }; };
const backend = (release, features) => {
  const wallet = createWallet({ storage: memory(), now: () => Date.now() });
  return { wallet, backend: createLocalBackend({ wallet, features, release, payments: release === 'public' ? {} : null }) };
};
const total = w => w.balance().total;

for (const [name, features] of [['with payments on', PAID_FEATURES], ['in free play', FREE_PLAY_FEATURES]]) {
  test(`public site ${name}: the browser can't grant Treat packs, the Starter Pack or the Pup Pass`, async () => {
    const { wallet, backend: b } = backend('public', features);
    const before = total(wallet);
    for (const res of [await b.buyPack('pack55'), await b.buyStarterPack(), await b.startPass()]) {
      assert.equal(res.ok, false);
    }
    assert.equal(total(wallet), before);
    assert.equal(wallet.state.starterPack.bought, false);
    assert.equal(b.passStatus().active, false);
    assert.equal(wallet.monthSpendUsd(), 0);
  });
}

test('public site: a purchase the server confirmed is still added, once', async () => {
  const { wallet, backend: b } = backend('public', PAID_FEATURES);
  const before = total(wallet);
  assert.equal(b.applyPurchase('pi_1', 'pack55').ok, true);
  assert.equal(b.applyPurchase('pi_1', 'pack55').duplicate, true);
  assert.equal(total(wallet), before + 55);
});

test('claude.ai demo: simulated purchases still work', async () => {
  const { wallet, backend: b } = backend('demo', DEMO_FEATURES);
  const before = total(wallet);
  assert.equal((await b.buyPack('pack55')).ok, true);
  assert.equal(total(wallet), before + 55);
});
