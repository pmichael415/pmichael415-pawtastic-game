// Every price and reward in the game (spec section 6). Data only.
import { seasonFor, seasonEndsAt, weekKey } from '../engine/challenge.js';

export const TREAT_USD = 0.05;

export function treatsToUsd(treats) {
  return Math.round(treats * TREAT_USD * 100) / 100;
}

export function formatUsd(n) {
  return `$${n.toFixed(2)}`;
}

export function formatTreatPrice(treats) {
  return `${treats} Treats (≈ ${formatUsd(treatsToUsd(treats))})`;
}

export const PACKS = [
  { id: 'pack55', usd: 2.99, treats: 55 },
  { id: 'pack100', usd: 4.99, treats: 100 },
  { id: 'pack220', usd: 9.99, treats: 220 },
  { id: 'pack480', usd: 19.99, treats: 480 },
];

export const ITEMS = {
  moves5: { treats: 20, name: '+5 moves' },
  lives: { treats: 25, name: 'Refill lives' },
  shuffle: { treats: 10, name: 'Shuffle' },
  bomb: { treats: 15, name: 'Bone Bomb' },
  blaster: { treats: 20, name: 'Bubble Blaster' },
};

export const BOOSTERS = ['shuffle', 'bomb', 'blaster'];

// source: 'shop' (bought with Treats), 'area' (win-only), 'collection' (set bonus), 'pass' (Pup Pass reward)
export const COSTUMES = [
  { id: 'bandana', name: 'Bandana', price: 40, set: 'everyday', source: 'shop' },
  { id: 'bow-tie', name: 'Bow Tie', price: 60, set: 'everyday', source: 'shop' },
  { id: 'sunglasses', name: 'Sunglasses', price: 80, set: 'everyday', source: 'shop' },
  { id: 'raincoat', name: 'Raincoat', price: 60, set: 'weather', source: 'shop' },
  { id: 'academy-hoodie', name: 'Academy Hoodie', price: 80, set: 'academy', source: 'shop' },
  { id: 'varsity-jacket', name: 'PAWtastic Varsity Jacket', price: 100, set: 'academy', source: 'shop' },
  { id: 'superhero-cape', name: 'Superhero Cape', price: 120, set: null, source: 'shop' },
  { id: 'pumpkin-bandana', name: 'Pumpkin Bandana', price: 90, set: 'event', source: 'shop' },
  { id: 'student-id-collar', name: 'Student ID Collar', price: null, set: null, source: 'area' },
  { id: 'recess-bandana', name: 'Recess Bandana', price: null, set: null, source: 'area' },
  { id: 'spa-robe', name: 'Spa Robe', price: null, set: null, source: 'area' },
  { id: 'pajamas', name: 'Pajamas', price: null, set: null, source: 'area' },
  { id: 'cap-and-gown', name: 'Cap & Gown', price: null, set: null, source: 'area' },
  { id: 'camp-bandana', name: 'Camp Bandana', price: null, set: null, source: 'area' },
  { id: 'life-vest', name: 'Life Vest', price: null, set: null, source: 'area' },
  { id: 'ranger-hat', name: 'Ranger Hat', price: null, set: null, source: 'area' },
  { id: 'cozy-flannel', name: 'Cozy Flannel', price: null, set: null, source: 'area' },
  { id: 'camp-medal', name: 'Camp Champion Medal', price: null, set: null, source: 'area' },
  { id: 'hawthorne-scarf', name: 'Hawthorne Team Scarf', price: null, set: null, source: 'area' },
  { id: 'hawthorne-jersey', name: 'Hawthorne Jersey', price: null, set: null, source: 'area' },
  { id: 'hillsdale-scarf', name: 'Hillsdale Team Scarf', price: null, set: null, source: 'area' },
  { id: 'hillsdale-jersey', name: 'Hillsdale Jersey', price: null, set: null, source: 'area' },
  { id: 'gold-collar', name: 'Gold Collar', price: null, set: null, source: 'collection' },
  { id: 'letterman-scarf', name: 'Letterman Scarf', price: null, set: null, source: 'collection' },
  { id: 'honor-roll-sash', name: 'Honor Roll Sash', price: null, set: null, source: 'pass' },
];

// Season skins (owner, 10 Nov 2026): the dog's whole look (coat, pattern, signature piece), sold for Treats while their
// season runs and kept forever. Drawn in code (ui/art.js SKIN_ART); worn in every game (published as "your pup").
export const SKINS = [
  { id: 's1-snow-day', name: 'Snow Day', season: 's1', price: 100, coat: '#EEF2F7', pattern: 'snowflakes', piece: 'earmuffs' },
  { id: 's1-varsity-star', name: 'Varsity Star', season: 's1', price: 120, coat: '#1F4FB8', pattern: 'star', piece: 'letter-sweater' },
  { id: 's1-top-dog', name: 'Top Dog Legend', season: 's1', price: 200, coat: '#E2B33C', pattern: 'shine', piece: 'crown' },
];

/** The skins sold at a moment: those of the season running then (Season 1: 9 Nov - 5 Dec 2026, New York). */
export function skinsOnSale(nowMs) {
  const s = seasonFor(weekKey(nowMs));
  if (!s || nowMs > seasonEndsAt(s)) return [];
  return SKINS.filter(k => k.season === s.id);
}

export const SETS = [
  { id: 'everyday', name: 'Everyday', costumes: ['bandana', 'bow-tie', 'sunglasses'], bonus: 'gold-collar' },
  { id: 'academy', name: 'Academy', costumes: ['academy-hoodie', 'varsity-jacket'], bonus: 'letterman-scarf' },
];

export const STARTER_PACK = { usd: 1.99, treats: 60, boosters: { shuffle: 1, bomb: 1, blaster: 1 }, costume: 'bandana' };

// Inclusive America/New_York dates. Change these to demo the event on other dates.
export const EVENT = { id: 'howloween', name: 'Howl-o-ween Week', start: '2026-10-23', end: '2026-11-08', costume: 'pumpkin-bandana' };

export const LIVES = { max: 5, regenMs: 30 * 60 * 1000 };
export const COINS = { min: 20, demoStart: 100 };
// Monthly spending limit: none by default (owner, 2 Nov 2026); a player can still choose $1–$100.
export const SPENDING_LIMIT = { default: null, min: 1, max: 100 };

// Pup Pass: 20 tiers of 100 Paw Points. Points come from playing, never from winning.
export const PASS = {
  usd: 4.99,
  tiers: 20,
  pointsPerTier: 100,
  points: { first: 20, each: 5, maxLevelsPerDay: 10, minMoves: 5 },
  free: {
    2: { treats: 10 }, 4: { booster: 'shuffle' }, 6: { treats: 10 }, 8: { booster: 'bomb' },
    10: { treats: 15 }, 12: { booster: 'shuffle' }, 14: { treats: 15 }, 16: { booster: 'blaster' },
    18: { treats: 20 }, 20: { treats: 25 },
  },
  // Premium tiers 1–19 use premiumCycle[(tier - 1) % 6]; tier 20 is premiumTop.
  premiumCycle: [{ treats: 15 }, { booster: 'bomb' }, { treats: 15 }, { booster: 'shuffle' }, { treats: 20 }, { booster: 'blaster' }],
  premiumTop: { costume: 'honor-roll-sash' },
};

export const STREAK = [
  { treats: 5 }, { treats: 5 }, { treats: 10 }, { booster: 'shuffle' },
  { treats: 10 }, { treats: 15 }, { treats: 25, booster: 'bomb' },
];

// Milestone rewards (asked for by the owner, 31 Oct 2026): a chest for each area finished, a bigger
// one for finishing each adventure (levels 40 and 80), and the Star Road for star totals. Each is
// granted once. unlimitedMin: minutes of unlimited lives, so a good run can keep going.
export const MILESTONES = {
  area: { treats: 20, booster: 'bomb', unlimitedMin: 30 },
  adventure: { treats: 60, boosters: ['shuffle', 'bomb', 'blaster'], unlimitedMin: 120 },
  starRoad: [
    [30, { treats: 10 }], [60, { booster: 'shuffle' }], [90, { unlimitedMin: 60 }], [120, { treats: 15 }],
    [150, { booster: 'blaster' }], [180, { unlimitedMin: 60 }], [210, { treats: 20 }], [240, { treats: 25, booster: 'bomb' }],
  ],
};

export const WELCOME_BACK = { afterDays: 7, treats: 20, booster: 'shuffle' };

// [minimum stars out of 24, grade, Professor Paws' comment]
export const REPORT_GRADES = [
  [22, 'A+', 'Top of the class! Valedictorian material.'],
  [19, 'A', 'Excellent work — a model student.'],
  [16, 'B', 'Great progress — keep fetching!'],
  [12, 'C', 'Solid effort. Extra recess recommended.'],
  [0, 'Pass', 'Passed! Every pup learns at their own pace.'],
];
