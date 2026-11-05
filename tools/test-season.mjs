// Season 1: Top Dog (owner decision, 5 Nov 2026): one season of four chapters, 9 Nov – Sat 5 Dec 11:59 pm New York.
// The season is a constant in the engine so the server (which bundles this file) and the game agree on it.
//   node --test tools/test-season.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEASONS, seasonFor, chapterOf, seasonEndsAt, playEndsAt, weekKey, weekEndsAt, nextWeek, rulesFor } from '../src/engine/challenge.js';

const ny = ms => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(ms));

test('Season 1 is the constant the owner approved', () => {
  assert.equal(SEASONS.length, 1);
  assert.deepEqual(SEASONS[0], { id: 's1', name: 'Season 1: Top Dog', weeks: ['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'], endsAt: '2026-12-06T04:59:59.999Z' });
  assert.equal(Object.isFrozen(SEASONS) && Object.isFrozen(SEASONS[0]) && Object.isFrozen(SEASONS[0].weeks), true, 'nobody can change the season at run time');
});

test('seasonFor and chapterOf: the four chapters are ordinary weeks', () => {
  for (const [i, w] of SEASONS[0].weeks.entries()) {
    assert.equal(seasonFor(w), SEASONS[0]);
    assert.equal(chapterOf(w), i + 1);
  }
  for (const w of ['2026-11-02', '2026-12-07', '2026-10-26', 'nonsense', null]) {
    assert.equal(seasonFor(w), null, `${w} is outside the season`);
    assert.equal(chapterOf(w), null);
  }
  assert.equal(weekKey(Date.parse('2026-11-09T05:00:00Z')), '2026-11-09', 'chapter 1 starts Mon 9 Nov at midnight in New York');
  assert.equal(weekKey(Date.parse('2026-11-09T04:59:59Z')), '2026-11-02', 'a second earlier is the week before the season');
});

test('the season ends Sat 5 Dec at 11:59:59 pm New York: chapter 4 ends Saturday, not Sunday', () => {
  const end = seasonEndsAt(SEASONS[0]);
  assert.equal(end, Date.parse('2026-12-06T04:59:59.999Z'));
  assert.equal(seasonEndsAt('s1'), end, 'by id too');
  assert.ok(Number.isNaN(seasonEndsAt('s9')));
  assert.match(ny(end), /^Sat, Dec 5, 11:59:59\sPM$/);
  assert.match(ny(end + 1), /^Sun, Dec 6, 12:00:00\sAM$/);
  assert.equal(weekKey(end), '2026-11-30');
  assert.equal(playEndsAt('2026-11-30'), end, 'the last chapter stops at the season end');
  assert.ok(playEndsAt('2026-11-30') < weekEndsAt('2026-11-30'));
  for (const w of ['2026-11-09', '2026-11-16', '2026-11-23']) assert.equal(playEndsAt(w), weekEndsAt(w), 'the other chapters end on Monday like weeks');
  for (const w of ['2026-11-02', '2026-12-07']) assert.equal(playEndsAt(w), weekEndsAt(w), 'weeks outside the season are unchanged');
  assert.equal(nextWeek('2026-11-30'), '2026-12-07');
});

test('the rules engine itself is unchanged by the season (the server pins season weeks to version 1)', () => {
  assert.equal(rulesFor('2026-11-16', '2026-11-09').version, 2);
  assert.equal(rulesFor('2026-11-16', null).version, 1);
});
