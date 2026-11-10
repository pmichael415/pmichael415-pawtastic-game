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

// The skin is the whole look: its coat, its pattern and its signature piece; a costume waits underneath.
test('dogSVG draws a worn skin over the dog\'s own coat and hides the costume', async () => {
  const { dogSVG } = await import('../src/ui/art.js');
  const plain = dogSVG({ breed: 'lab', coat: '#123456', costume: 'bandana', label: 'Biscuit' });
  assert.equal(dogSVG({ breed: 'lab', coat: '#123456', costume: 'bandana', skin: null, label: 'Biscuit' }), plain);
  assert.equal(dogSVG({ breed: 'lab', coat: '#123456', costume: 'bandana', skin: 'nope', label: 'Biscuit' }), plain); // unknown: none
  for (const s of SKINS) {
    const out = dogSVG({ breed: 'lab', coat: '#123456', costume: 'bandana', skin: s.id, label: 'Biscuit' });
    assert.ok(out.includes(s.coat), `${s.id} coat`);
    assert.ok(!out.includes('#123456'), `${s.id} hides the own coat`);
    assert.ok(out.includes(`data-skin="${s.id}"`), `${s.id} piece`);
    assert.ok(!out.includes('data-costume'), `${s.id} hides the costume`);
    assert.equal((out.match(/<svg/g) ?? []).length, 1);
    assert.doesNotMatch(out, /<script|on\w+=|javascript:|foreignObject|href=/i);
  }
});

test('dogLook takes the dog, the costume and the worn skin from the wallet', async () => {
  const { dogLook } = await import('../src/ui/look.js');
  const state = { dog: { name: 'Biscuit', breed: 'golden', coat: '#C98A4B' }, inventory: { equipped: 'bandana', skin: 's1-snow-day' } };
  assert.deepEqual(dogLook(state), { name: 'Biscuit', breed: 'golden', coat: '#C98A4B', costume: 'bandana', skin: 's1-snow-day', label: 'Biscuit' });
  assert.deepEqual(dogLook({ dog: null, inventory: {} }), { costume: null, skin: null, label: 'Your dog' });
});

// The hub (same site) shows "your pup" from this record: the dog's picture with its worn skin.
test('publishMyPup keeps the dog\'s picture, name and skin for the hub', async () => {
  const { publishMyPup, MY_PUP_KEY } = await import('../src/ui/look.js');
  assert.equal(MY_PUP_KEY, 'pawtastic-my-pup-v1');
  const m = new Map(); const store = { setItem: (k, v) => m.set(k, v), getItem: k => m.get(k) ?? null };
  const state = { dog: { name: 'Biscuit', breed: 'lab', coat: '#C98A4B' }, inventory: { equipped: null, skin: 's1-top-dog' } };
  publishMyPup(state, store, 1000);
  const rec = JSON.parse(m.get(MY_PUP_KEY));
  assert.equal(rec.v, 1); assert.equal(rec.name, 'Biscuit'); assert.equal(rec.skin, 's1-top-dog'); assert.equal(rec.at, 1000);
  assert.match(rec.svg, /^<svg[\s\S]*data-skin="s1-top-dog"[\s\S]*<\/svg>$/);
  assert.ok(rec.svg.length < 24 * 1024);
  // Review fix: another account (or a guest) without a dog must not keep showing the previous dog in the hub.
  const store2 = { setItem: (k, v) => m.set(k, v), getItem: k => m.get(k) ?? null, removeItem: k => m.delete(k) };
  publishMyPup({ dog: null, inventory: {} }, store2, 1000);
  assert.equal(m.get(MY_PUP_KEY), undefined);
});

// Review fixes, 10 Nov 2026.
test('buySkin follows the clock it is given (the server\'s), not the phone\'s', () => {
  const { w } = wallet(IN_SEASON); // the phone says Season 1
  assert.deepEqual(w.buySkin('s1-snow-day', AFTER), { ok: false, error: 'not-on-sale' }); // the server says it's over
  assert.deepEqual(w.buySkin('s1-snow-day', IN_SEASON), { ok: true });
});

test('a skin that is no longer sold has a plain message', async () => {
  const { errorText } = await import('../src/ui/screens/shop.js').catch(() => ({}));
  if (!errorText) return; // the shop module needs a browser; covered in e2e-skins
  assert.match(errorText('not-on-sale'), /Season 1 skins were sold until Sat 5 Dec/);
});

test('every change to the dog\'s look is published right away by the local game', async () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
  const { createLocalBackend, PAID_FEATURES } = await import('../src/backend/local.js');
  const { w } = wallet(IN_SEASON, 300);
  const b = createLocalBackend({ wallet: w, features: PAID_FEATURES, release: 'public', payments: {} });
  await b.setDog({ name: 'Biscuit', breed: 'lab', coat: '#C98A4B' });
  const pup = () => JSON.parse(mem.get('pawtastic-my-pup-v1') ?? 'null');
  assert.equal(pup()?.name, 'Biscuit');
  await b.buySkin('s1-snow-day'); await b.wearSkin('s1-snow-day');
  assert.equal(pup()?.skin, 's1-snow-day');
  await b.wearSkin(null);
  assert.equal(pup()?.skin, null);
  w.state.inventory.costumes; // eslint quiet
});

test('the game publishes the dog for the hub only in the public game, never in the customer app', async () => {
  const { pupPublisher } = await import('../src/ui/look.js');
  assert.equal(typeof pupPublisher({ serverMode: false }), 'function');
  assert.equal(pupPublisher({ serverMode: true }), null);
});
