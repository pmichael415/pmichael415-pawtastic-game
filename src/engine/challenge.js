// The Weekly Challenge: the same board for everyone each week (same layout, same pieces, same refills),
// score attack in a fixed number of moves, no boosters and no extra moves, so only skill counts.
// Weeks start Monday 00:00 in America/New_York. The site's server replays a submitted run with this
// same code to work out its score, so a score can't be made up.

import { createGame, trySwap } from './game.js';

export const CHALLENGE_MOVES = 25;
export const CHALLENGE_LEVEL_ID = 900;
const DAY_MS = 86400000;
const CAMP6 = ['bone', 'ball', 'paw', 'frisbee', 'pinecone', 'lantern'];

// One layout a week, in turn ('#' blocked, c/C crates, l/L leashes; mud adds nothing to a score run).
const LAYOUTS = [
  { kinds: 5, rows: ['........', '........', '..c..c..', '........', '........', '..c..c..', '........', '........'] },
  { kinds: 6, rows: ['##....##', '#......#', '........', '...ll...', '...ll...', '........', '#......#', '##....##'] },
  { kinds: CAMP6, rows: ['........', '.l....l.', '........', '..cCCc..', '........', '........', '.l....l.', '........'] },
  { kinds: 5, rows: ['........', '........', '#......#', '##....##', '##....##', '#......#', '........', '........'] },
  { kinds: 6, rows: ['........', '.c....c.', '..l..l..', '........', '........', '..l..l..', '.c....c.', '........'] },
  { kinds: CAMP6, rows: ['###..###', '##....##', '#......#', '........', '........', '...cc...', '........', '........'] },
  { kinds: 5, rows: ['........', '........', '...##...', '..l##l..', '..l##l..', '...##...', '........', '........'] },
  { kinds: 6, rows: ['##......', '#.......', '..c.....', '...ll...', '...ll...', '.....c..', '.......#', '......##'] },
];

const nyDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
const WEEKDAYS = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/** The Monday (YYYY-MM-DD, New York calendar) of the week holding `ms`. */
export function weekKey(ms) {
  const parts = Object.fromEntries(nyDay.formatToParts(new Date(ms)).map(p => [p.type, p.value]));
  const day = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  return new Date(day - WEEKDAYS[parts.weekday] * DAY_MS).toISOString().slice(0, 10);
}

/** The week after `key`. */
export function nextWeek(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + 7 * DAY_MS).toISOString().slice(0, 10);
}

/** When the week starting `key` ends: the next Monday at midnight in New York, as epoch ms. */
export function weekEndsAt(key) {
  const next = nextWeek(key);
  // Midnight in New York is 04:00 or 05:00 UTC; take the one that New York calls the next Monday.
  for (const hour of [4, 5]) {
    const ms = Date.parse(`${next}T0${hour}:00:00Z`);
    if (weekKey(ms) === next && weekKey(ms - 3600000) !== next) return ms;
  }
  return Date.parse(`${next}T05:00:00Z`);
}

export const isWeekKey = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && weekKey(Date.parse(`${v}T12:00:00Z`)) === v;

function hash(text) {
  let h = 2166136261;
  for (const ch of text) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** This week's challenge level and its seed. */
export function challengeFor(week) {
  const n = Math.round(Date.parse(`${week}T12:00:00Z`) / (7 * DAY_MS));
  const design = LAYOUTS[((n % LAYOUTS.length) + LAYOUTS.length) % LAYOUTS.length];
  const level = {
    id: CHALLENGE_LEVEL_ID, area: 'weekly', moves: CHALLENGE_MOVES, kinds: design.kinds,
    goal: { type: 'attack' }, stars: [20000, 30000], layout: design.rows, week,
  };
  return { level, seed: hash(`pawtastic-weekly-${week}`) };
}

export function newChallengeGame(week) {
  const { level, seed } = challengeFor(week);
  return createGame(level, seed);
}

/**
 * Replays a run: moves are [r1, c1, r2, c2] swaps in order. Returns { ok: true, score } for a finished
 * run (every move used), or { ok: false, error } when a move is not a legal swap or the run is unfinished.
 */
export function replayChallenge(week, moves) {
  if (!Array.isArray(moves) || moves.length !== CHALLENGE_MOVES) return { ok: false, error: 'unfinished' };
  const game = newChallengeGame(week);
  for (const m of moves) {
    if (!Array.isArray(m) || m.length !== 4 || !m.every(n => Number.isInteger(n) && n >= 0 && n < 16)) return { ok: false, error: 'bad-move' };
    const res = trySwap(game, { r: m[0], c: m[1] }, { r: m[2], c: m[3] });
    if (!res.ok) return { ok: false, error: 'bad-move' };
  }
  if (game.status !== 'won') return { ok: false, error: 'unfinished' };
  return { ok: true, score: game.score };
}

/** A run made of the first legal swap each turn (for tests and examples; it plays badly on purpose). */
export function sampleRun(week) {
  const game = newChallengeGame(week);
  const moves = [];
  while (game.status === 'playing') {
    let found = null;
    for (let r = 0; r < game.grid.rows && !found; r++) {
      for (let c = 0; c < game.grid.cols && !found; c++) {
        for (const [dr, dc] of [[0, 1], [1, 0]]) {
          if (found) break;
          const probe = { ...game, grid: structuredClone(game.grid), rng: game.rng.clone() };
          if (trySwap(probe, { r, c }, { r: r + dr, c: c + dc }).ok) found = [r, c, r + dr, c + dc];
        }
      }
    }
    if (!found) break;
    moves.push(found);
    trySwap(game, { r: found[0], c: found[1] }, { r: found[2], c: found[3] });
  }
  return { moves, score: game.score };
}
