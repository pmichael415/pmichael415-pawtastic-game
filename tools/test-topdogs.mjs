// The staff page's "Top Dogs" post (owner, 10 Nov 2026): the top 3 dog names at each location, ready to post.
//   node --test tools/test-topdogs.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { topDogsLines } from '../src/staff/top-dogs.js';

const board = (names) => names.map((dogName, i) => ({ rank: i + 1, dogName, score: 10000 - i * 1000 }));
test('top 3 per location, best first, dog names only', () => {
  const t = topDogsLines({ seasonName: 'Season 1: Top Dog', chapter: 2, boards: { hawthorne: board(['Biscuit', 'Max', 'Bella', 'Rex']), hillsdale: board(['Luna']) } });
  assert.equal(t.title, 'Top Dogs');
  assert.equal(t.subtitle, 'Season 1: Top Dog · Chapter 2 standings');
  assert.deepEqual(t.locations, [
    { name: 'Hawthorne', dogs: ['1. Biscuit', '2. Max', '3. Bella'] },
    { name: 'Hillsdale', dogs: ['1. Luna', '2. Your pup?', '3. Your pup?'] },
  ]);
  assert.equal(t.cta, 'Play free at play.pawtasticacademy.com');
  assert.equal(t.fine, 'No purchase necessary. Top 3 at each location win when the season ends.');
});
test('names are cleaned and kept short; an empty board still invites players', () => {
  const t = topDogsLines({ seasonName: 'Season 1: Top Dog', chapter: 1, boards: { hawthorne: [{ rank: 1, dogName: '  Sir Barks-a-Lot the Third of Hawthorne  ' }], hillsdale: [] } });
  assert.equal(t.locations[0].dogs[0], '1. Sir Barks-a-Lot the Thir…');
  assert.deepEqual(t.locations[1].dogs, ['1. Your pup?', '2. Your pup?', '3. Your pup?']);
});
