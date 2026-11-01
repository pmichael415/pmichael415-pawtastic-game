// Player counter: one anonymous hello a day, never blocking the game.
//   node --test tools/test-player-count.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sayHello, startPlayerCount, localDay, HELLO_PATH } from '../src/net/player-count.js';

const memory = (value = null) => ({ load: () => value, save: v => { value = JSON.parse(JSON.stringify(v)); }, get value() { return value; } });
const recorder = (ok = true) => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); if (ok === 'throw') throw new Error('offline'); return { ok }; };
  return { calls, fetchImpl };
};
const day1 = new Date(2026, 10, 6, 9, 0).getTime();
const day2 = new Date(2026, 10, 7, 0, 5).getTime();

test('sends one hello a day with only a random id', async () => {
  const store = memory(); const { calls, fetchImpl } = recorder();
  assert.equal(await sayHello({ fetchImpl, store, now: () => day1 }), true);
  assert.equal(await sayHello({ fetchImpl, store, now: () => day1 + 3600e3 }), false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, HELLO_PATH);
  assert.deepEqual(Object.keys(calls[0].body), ['device']);
  assert.match(calls[0].body.device, /^[A-Za-z0-9_-]{16,64}$/);
  assert.equal(calls[0].init.credentials, 'omit');
  assert.equal(calls[0].init.headers.authorization, undefined);
  assert.deepEqual(store.value, { id: calls[0].body.device, sent: localDay(day1) });
});

test('the same id is used again the next day', async () => {
  const store = memory(); const { calls, fetchImpl } = recorder();
  await sayHello({ fetchImpl, store, now: () => day1 });
  assert.equal(await sayHello({ fetchImpl, store, now: () => day2 }), true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.device, calls[1].body.device);
});

test('a failed hello is tried again on the next open, keeping the id', async () => {
  for (const mode of [false, 'throw']) {
    const store = memory(); const bad = recorder(mode);
    assert.equal(await sayHello({ fetchImpl: bad.fetchImpl, store, now: () => day1 }), false);
    assert.equal(store.value.sent, null);
    const good = recorder();
    assert.equal(await sayHello({ fetchImpl: good.fetchImpl, store, now: () => day1 }), true);
    assert.equal(good.calls[0].body.device, bad.calls[0].body.device);
  }
});

test('a damaged saved id is replaced; no fetch or broken storage never throws', async () => {
  const store = memory({ id: 'bad id!', sent: localDay(day1) }); const { calls, fetchImpl } = recorder();
  assert.equal(await sayHello({ fetchImpl, store, now: () => day1 }), true);
  assert.notEqual(calls[0].body.device, 'bad id!');
  assert.equal(await sayHello({ fetchImpl: undefined, store: memory(), now: () => day1 }), false);
  const broken = { load() { throw new Error('denied'); }, save() { throw new Error('denied'); } };
  assert.equal(await sayHello({ fetchImpl, store: broken, now: () => day1 }), true);
});

test('a game left open says hello again when it comes back on a new day', async () => {
  let t = day1; const store = memory(); const { calls, fetchImpl } = recorder();
  const listeners = [];
  const doc = { hidden: false, addEventListener: (name, fn) => listeners.push([name, fn]) };
  const run = startPlayerCount({ doc, fetchImpl, store, now: () => t });
  await run();
  doc.hidden = true; listeners[0][1](); doc.hidden = false; listeners[0][1](); await run();
  assert.equal(calls.length, 1);
  t = day2; listeners[0][1](); await run();
  assert.equal(calls.length, 2);
});
