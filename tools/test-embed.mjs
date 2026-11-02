// Inside the PAWtastic Games hub: which server the game talks to, and how checkout leaves the frame.
//   node --test tools/test-embed.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { API_BASES, apiBase, embedded, openOutside } from '../src/net/embed.js';

const docWith = content => ({ querySelector: sel => (sel === 'meta[name="pawtastic-api"]' && content !== null ? { content } : null) });

test('the server address comes only from the allowlist', () => {
  assert.deepEqual(API_BASES, ['https://pawtastic-graduation.lovable.app']);
  assert.equal(apiBase(docWith('https://pawtastic-graduation.lovable.app')), 'https://pawtastic-graduation.lovable.app');
  assert.equal(apiBase(docWith('https://attacker.invalid')), '');
  assert.equal(apiBase(docWith('https://pawtastic-graduation.lovable.app.attacker.invalid')), '');
  assert.equal(apiBase(docWith(null)), '');
});

test('knows when it runs inside a frame', () => {
  const self = {};
  assert.equal(embedded({ top: self, self }), false);
  assert.equal(embedded({ top: {}, self }), true);
  const blocked = { self };
  Object.defineProperty(blocked, 'top', { get() { throw new Error('cross-origin'); } });
  assert.equal(embedded(blocked), true);
});

test('checkout opens in this tab when not framed', () => {
  const seen = [];
  const win = { location: { assign: u => seen.push(['here', u]) } };
  win.top = win; win.self = win;
  openOutside('https://checkout.stripe.com/c/pay/x', win);
  assert.deepEqual(seen, [['here', 'https://checkout.stripe.com/c/pay/x']]);
});

test('inside the hub it takes over the whole tab (Stripe refuses to run in a frame)', () => {
  const seen = [];
  const top = { location: { assign: u => seen.push(['top', u]) } };
  const win = { top, location: { assign: u => seen.push(['frame', u]) }, open: u => seen.push(['new tab', u]) };
  win.self = win;
  openOutside('https://checkout.stripe.com/c/pay/x', win);
  assert.deepEqual(seen, [['top', 'https://checkout.stripe.com/c/pay/x']]);
});

test('when the page around it is another site, it opens a new tab instead', () => {
  const seen = [];
  const top = {};
  Object.defineProperty(top, 'location', { get() { throw new Error('cross-origin'); } });
  const win = { top, location: { assign: u => seen.push(['frame', u]) }, open: (u, t) => seen.push(['new tab', u, t]) };
  win.self = win;
  openOutside('https://billing.stripe.com/p/x', win);
  assert.deepEqual(seen, [['new tab', 'https://billing.stripe.com/p/x', '_blank']]);
});
