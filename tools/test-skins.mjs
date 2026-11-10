// Season skins (owner, 10 Nov 2026: "like Fortnite, different skins every season at the shop ... use that skin in any
// game"): sold for Treats during their season, kept forever, worn as the dog's whole look.
//   node --test tools/test-skins.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWallet, defaultState } from '../src/economy/wallet.js';
import { SKINS } from '../src/economy/catalog.js';

const IN_SEASON = Date.parse('2026-11-12T17:00:00Z'); // Season 1, chapter 1
const AFTER = Date.parse('2026-12-07T17:00:00Z'); // the season is over
function wallet(t = IN_SEASON, treats = 300, extra = {}) {
  let saved = { ...defaultState(), treats: { free: treats, converted: 0, paid: 0 }, ...extra };
  const storage = { load: () => structuredClone(saved), save: o => { saved = structuredClone(o); } };
  let now = t;
  const w = createWallet({ storage, now: () => now });
  return { w, at: ms => { now = ms; }, saved: () => saved };
}

test('Season 1 has three skins, priced in Treats', () => {
  assert.deepEqual(SKINS.map(s => [s.id, s.price, s.season]), [['s1-snow-day', 100, 's1'], ['s1-varsity-star', 120, 's1'], ['s1-top-dog', 200, 's1']]);
  for (const s of SKINS) assert.ok(s.name && s.coat && s.pattern && s.piece, s.id);
});

test('a skin is bought with Treats during its season, once', () => {
  const { w } = wallet();
  assert.deepEqual(w.buySkin('s1-varsity-star'), { ok: true });
  const st = w.state;
  assert.equal(st.treats.free, 180);
  assert.deepEqual(st.inventory.skins, ['s1-varsity-star']);
  assert.deepEqual(w.buySkin('s1-varsity-star'), { ok: false, error: 'owned' });
  assert.deepEqual(w.buySkin('nope'), { ok: false, error: 'unknown-skin' });
  assert.deepEqual(w.buySkin('s1-top-dog'), { ok: false, error: 'insufficient' }); // 180 left, 200 needed
});

test('after its season a skin is no longer sold, and one already bought is kept', () => {
  const { w, at } = wallet();
  w.buySkin('s1-snow-day');
  at(AFTER);
  assert.deepEqual(w.buySkin('s1-varsity-star'), { ok: false, error: 'not-on-sale' });
  assert.deepEqual(w.state.inventory.skins, ['s1-snow-day']);
  assert.deepEqual(w.wearSkin('s1-snow-day'), { ok: true });
});

test('wearing: only an owned skin; null takes it off', () => {
  const { w } = wallet();
  assert.deepEqual(w.wearSkin('s1-snow-day'), { ok: false, error: 'not-owned' });
  w.buySkin('s1-snow-day');
  assert.deepEqual(w.wearSkin('s1-snow-day'), { ok: true });
  assert.equal(w.state.inventory.skin, 's1-snow-day');
  assert.deepEqual(w.wearSkin(null), { ok: true });
  assert.equal(w.state.inventory.skin, null);
});

test('a saved wallet keeps only known skins, and the worn skin only if owned', () => {
  const inventory = { ...defaultState().inventory, skins: ['bogus', 's1-snow-day', 's1-snow-day'], skin: 'bogus' };
  const { w } = wallet(IN_SEASON, 0, { inventory });
  assert.deepEqual(w.state.inventory.skins, ['s1-snow-day']);
  assert.equal(w.state.inventory.skin, null);
  const old = wallet(IN_SEASON, 0, { inventory: { boosters: { shuffle: 0, bomb: 0, blaster: 0 }, costumes: [], equipped: null } });
  assert.deepEqual(old.w.state.inventory.skins, []); // a wallet saved before skins existed
  assert.equal(old.w.state.inventory.skin, null);
});

test('skinsOnSale lists the current season\'s skins only while it runs', async () => {
  const { skinsOnSale } = await import('../src/economy/catalog.js');
  assert.deepEqual(skinsOnSale(IN_SEASON).map(s => s.id), ['s1-snow-day', 's1-varsity-star', 's1-top-dog']);
  assert.deepEqual(skinsOnSale(AFTER), []);
  assert.deepEqual(skinsOnSale(Date.parse('2026-11-01T17:00:00Z')), []); // before the season
});
