// Graduation Day's own site points players to the PAWtastic Games hub, the one stop (owner, 7 Nov 2026): the map's
// banner on the old site is the "now lives in PAWtastic Games" notice instead of "add to your Home Screen". Inside the
// hub (the game runs in the hub's frame) there is no notice.
//   node --test tools/test-hub-notice.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.data = String(t); } get textContent() { return this.data; } }
class FakeElement extends FakeNode {
  constructor(tag) { super(); this.tagName = tag.toUpperCase(); this.childNodes = []; this.attributes = {}; this.listeners = {}; }
  setAttribute(k, v) { this.attributes[k] = v; }
  getAttribute(k) { return this.attributes[k] ?? null; }
  addEventListener(k, f) { this.listeners[k] = f; }
  append(...c) { this.childNodes.push(...c); }
  replaceChildren(...c) { this.childNodes = c; }
  set className(v) { this.attributes.class = v; }
  get textContent() { return this.childNodes.map(c => c.textContent).join(' '); }
  set textContent(v) { this.childNodes = [new FakeText(v)]; }
  all(tag) { return this.childNodes.flatMap(c => (c instanceof FakeElement ? [...(c.tagName === tag ? [c] : []), ...c.all(tag)] : [])); }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: t => new FakeElement(t), createTextNode: t => new FakeText(t) };

const { hubCard, HUB_GRADUATION } = await import('../src/ui/hub-notice.js');
const norm = t => t.replace(/\s+/g, ' ').trim();
const standalone = { top: 1, self: 1 };
const framed = { top: 1, self: 2 };

test('on Graduation Day\'s own site: the notice, with a link to Graduation Day in the hub', () => {
  assert.equal(HUB_GRADUATION, 'https://play.pawtasticacademy.com/graduation');
  const card = hubCard(standalone);
  assert.ok(card, 'shown on the old site');
  const text = norm(card.textContent);
  assert.match(text, /Graduation Day now lives in PAWtastic Games, with all our games in one place\./);
  assert.match(text, /Sign in to keep your progress: it follows your account\./);
  const [link] = card.all('A');
  assert.equal(link.getAttribute('href'), HUB_GRADUATION);
  assert.equal(norm(link.textContent), 'Open');
  assert.match(card.getAttribute('class'), /hub-card/);
});
test('inside the hub (the game in the hub\'s frame): no notice', () => {
  assert.equal(hubCard(framed), null);
});
