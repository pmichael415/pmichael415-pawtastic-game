// Measurement: batches, once-only events, the page-closing fallback — never personal data, never throwing.
//   node --test tools/test-measure.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMeasure, linkKind, EVENT_NAMES, nyDay } from '../src/net/measure.js';
import { deviceId } from '../src/net/player-count.js';

const memory = (value = null) => ({ load: () => value, save: v => { value = JSON.parse(JSON.stringify(v)); }, get value() { return value; } });
const DEVICE = 'k3Vb9_Qx-2LmZp7TfR4wYa';
const day1 = new Date(2026, 10, 6, 9, 0).getTime();
const day2 = new Date(2026, 10, 7, 9, 0).getTime();
const timers = () => {
  const pending = [];
  return {
    pending,
    schedule: (fn, ms) => { const id = { fn, ms }; pending.push(id); return id; },
    cancel: id => { const i = pending.indexOf(id); if (i >= 0) pending.splice(i, 1); },
    async run() { while (pending.length) { const t = pending.shift(); await t.fn(); } },
  };
};
const sender = (ok = true) => {
  const calls = [];
  return { calls, send: async body => { calls.push(JSON.parse(JSON.stringify(body))); if (ok === 'throw') throw new Error('offline'); return { ok }; } };
};

test('events are batched, carry only the device id, name and small props', async () => {
  const t = timers(); const { calls, send } = sender();
  const m = createMeasure({ send, device: DEVICE, store: memory(), now: () => day1, schedule: t.schedule, cancel: t.cancel });
  assert.equal(m.track('opened'), true);
  assert.equal(m.track('product_previewed', { product: 'pack55', email: 'x@y.z', nested: { a: 1 }, note: 'n'.repeat(200) }), true);
  assert.equal(calls.length, 0);
  await t.run();
  assert.equal(calls.length, 1);
  assert.deepEqual(Object.keys(calls[0]), ['device', 'events']);
  assert.equal(calls[0].device, DEVICE);
  assert.deepEqual(calls[0].events[0], { name: 'opened', props: { where: 'site' } });
  assert.equal(calls[0].events[1].props.product, 'pack55');
  assert.equal(calls[0].events[1].props.email, 'x@y.z'); // a string prop is allowed; the game never passes an email
  assert.equal(calls[0].events[1].props.nested, undefined);
  assert.equal(calls[0].events[1].props.note.length, 120);
});

test('first-time events go once ever, daily events once a day; the store remembers across opens', async () => {
  const store = memory(); const t = timers(); const { calls, send } = sender();
  const m = createMeasure({ send, device: DEVICE, store, now: () => day1, schedule: t.schedule, cancel: t.cancel });
  assert.equal(m.track('first_play_started'), true);
  assert.equal(m.track('first_play_started'), false);
  assert.equal(m.track('opened'), true);
  assert.equal(m.track('opened'), false);
  assert.equal(m.track('replay', { level: 3 }), true);
  assert.equal(m.track('replay', { level: 3 }), true);
  await t.run();
  assert.deepEqual(calls[0].events.map(e => e.name), ['first_play_started', 'opened', 'replay', 'replay']);
  const later = createMeasure({ send, device: DEVICE, store, now: () => day2, schedule: t.schedule, cancel: t.cancel });
  assert.equal(later.track('first_play_started'), false);
  assert.equal(later.track('opened'), true, 'a new day counts as a new open');
});

test('unknown names are ignored; a failed send is dropped, never thrown; no device means no measurement', async () => {
  const t = timers(); const bad = sender('throw');
  const m = createMeasure({ send: bad.send, device: DEVICE, store: memory(), now: () => day1, schedule: t.schedule, cancel: t.cancel });
  assert.equal(m.track('bought_something'), false);
  assert.equal(m.track('share', { kind: 'costume' }), true);
  await t.run();
  assert.equal(await m.flush(), false);
  const off = createMeasure({ send: bad.send, device: 'nope', store: memory(), now: () => day1 });
  assert.equal(off.track('opened'), false);
  assert.equal(await off.flush(), false);
  assert.equal(createMeasure({}).track('opened'), false);
});

test('a full batch sends at once; the page-closing stop hands the rest to the beacon', async () => {
  const t = timers(); const { calls, send } = sender();
  const beacons = [];
  const m = createMeasure({ send, device: DEVICE, store: memory(), now: () => day1, schedule: t.schedule, cancel: t.cancel, embed: true, beacon: body => { beacons.push(body); return true; } });
  for (let i = 0; i < 20; i++) m.track('replay', { level: i });
  await new Promise(r => setTimeout(r, 0));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].events.length, 20);
  assert.equal(calls[0].events[0].props.where, 'hub');
  m.track('share', { kind: 'invite' });
  m.stop();
  assert.equal(beacons.length, 1);
  assert.equal(beacons[0].events[0].name, 'share');
  assert.equal(m.pending, 0);
});

test('link kinds and the shared device id', () => {
  assert.equal(linkKind('?ref=ABCD1234'), 'invite');
  assert.equal(linkKind('?challenge=2026-11-02'), 'challenge');
  assert.equal(linkKind('?beat=abc&ref=x'), 'beat-my-pup');
  assert.equal(linkKind(''), null);
  const store = memory();
  const id = deviceId(store, () => new Uint8Array(16).map((_, i) => i * 7));
  assert.match(id, /^[A-Za-z0-9_-]{16,64}$/);
  assert.equal(deviceId(store), id, 'the saved id is reused');
  assert.equal(store.value.sent, null);
  assert.equal(EVENT_NAMES.length, 13);
  assert.equal(EVENT_NAMES.includes('challenge_run'), true);
  assert.match(nyDay(day1), /^\d{4}-\d{2}-\d{2}$/);
});
