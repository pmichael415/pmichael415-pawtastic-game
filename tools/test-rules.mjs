// The rules page (audit item 9): during Season 1: Top Dog it shows EXACTLY the owner-approved season paragraph and
// not the ordinary weekly-prize paragraph; outside the season the weekly-prize paragraph is shown unchanged.
// Rendered through the game's own DOM builder (src/ui/dom.js) into a tiny stand-in DOM; only whitespace is normalised.
//   node --test tools/test-rules.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.data = String(t); } get textContent() { return this.data; } }
class FakeElement extends FakeNode {
  constructor(tag) { super(); this.tagName = tag.toUpperCase(); this.childNodes = []; this.attributes = {}; }
  setAttribute(k, v) { this.attributes[k] = v; }
  addEventListener() {}
  append(...c) { this.childNodes.push(...c); }
  set className(v) { this.attributes.class = v; }
  set innerHTML(v) { this.childNodes = [new FakeText(String(v).replace(/<[^>]*>/g, ''))]; }
  get textContent() { return this.childNodes.map(c => c.textContent).join(''); }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: t => new FakeElement(t), createTextNode: t => new FakeText(t) };

const { competeTerms } = await import('../src/ui/screens/rules.js');
const { SEASON_1_RULES } = await import('../src/ui/season.js');
const norm = t => t.replace(/\s+/g, ' ').trim();
const paragraphs = week => competeTerms(week).filter(el => el.tagName === 'P').map(el => norm(el.textContent));
const headings = week => competeTerms(week).filter(el => el.tagName === 'H2').map(el => norm(el.textContent));

// The owner-approved wording (CONTRACT.md of the Season 1 fixes), character for character.
const APPROVED = "Season 1: Top Dog runs from Mon 9 Nov 2026, 12:00 am, to Sat 5 Dec 2026, 11:59 pm (New York), in four chapters. Your best score in each chapter is added up to make your season score; a chapter you don't play adds nothing. No purchase necessary, and buying anything never helps. No weekly prizes are given during the season. When it ends, the top 3 players at each location by season score win the season's prizes shown in the game, for one dog. Your location is the one of your first run in the season. Ties go to whoever reached their latest counted score first. The team bar compares the average of each location's top 10 season scores; it wins no PAWtastic prize.";
// The ordinary weekly-prize paragraph, as it was before the season (e152737), unchanged.
const WEEKLY_PRIZES = "To be ranked you sign in and pick your PAWtastic (Hawthorne or Hillsdale). When the week ends, the top 3 players at each location win that week's prizes, for one dog. Each week's prizes are shown in the game during that week (for example a free day of daycare or a free bath); a week without other prizes shown awards 1st place a free day of daycare and 2nd and 3rd place a free bath. Ties go to the player who reached the score first. Scores are checked by our server, which replays every move.";

test('the season paragraph is the owner-approved text, exactly', () => {
  assert.equal(SEASON_1_RULES, APPROVED);
});

for (const week of ['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']) {
  test(`during the season (week of ${week}): exactly the approved paragraph, and no weekly-prize paragraph`, () => {
    const ps = paragraphs(week);
    assert.equal(ps.filter(p => p === APPROVED).length, 1, 'the approved season paragraph, once, exactly');
    assert.equal(ps.filter(p => p.startsWith('Season 1: Top Dog')).length, 1, 'no other season wording');
    assert.equal(ps.some(p => p === WEEKLY_PRIZES || /When the week ends|a week without other prizes shown/.test(p)), false, 'no ordinary weekly prizes during the season');
    assert.equal(headings(week)[0], 'Season 1: Top Dog');
    for (const p of ps) assert.doesNotMatch(p, /streak|miss out|don.t lose|last chance|hurry/i, p);
  });
}

for (const week of ['2026-11-02', '2026-12-07', '2027-01-04']) {
  test(`outside the season (week of ${week}): the weekly-prize paragraph unchanged, no season paragraph`, () => {
    const ps = paragraphs(week);
    assert.equal(ps.filter(p => p === WEEKLY_PRIZES).length, 1);
    assert.equal(ps.some(p => /Season 1|season score/.test(p)), false);
    assert.equal(headings(week).includes('Season 1: Top Dog'), false);
  });
}
