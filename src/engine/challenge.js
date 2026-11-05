// The Weekly Challenge: the same board for everyone each week (same layout, same pieces, same refills),
// no boosters and no extra moves, so only skill counts. Weeks start Monday 00:00 in America/New_York.
// The site's server replays a submitted run with this same code to work out its score, so a score
// can't be made up.
//
// Rules are versioned by week, so a competition already in progress never changes:
//   version 1 (every week until the owner schedules version 2): one High score run, 25 moves.
//   version 2 (from a future Monday the owner picks): three free challenges all week long — the High
//     score run, the Combo run and the Cleanup puzzle. A player's best validated result in each is
//     normalized to one scale and added up; the weekly leaderboard ranks that total.

import { createGame, trySwap } from './game.js';

export const CHALLENGE_MOVES = 25;
export const CHALLENGE_LEVEL_ID = 900;
const DAY_MS = 86400000;
const CAMP6 = ['bone', 'ball', 'paw', 'frisbee', 'pinecone', 'lantern'];

/** The three challenges (version 2). High score is version 1's run, unchanged. */
export const CHALLENGES = {
  'high-score': {
    id: 'high-score', levelId: 900, moves: 25, name: 'High score run', short: 'High score',
    goal: 'Score as much as you can in 25 moves.',
    scoring: 'Your points, as they are.',
    tiers: [15000, 25000, 38000],
  },
  combo: {
    id: 'combo', levelId: 901, moves: 20, name: 'Combo run', short: 'Combo',
    goal: 'Set off chain reactions in 20 moves.',
    scoring: 'Only chain reactions count: the points from every cascade after your swap, × 0.7 so a combo run counts like a high score run.',
    tiers: [15000, 25000, 38000],
  },
  cleanup: {
    id: 'cleanup', levelId: 902, moves: 30, name: 'Cleanup puzzle', short: 'Cleanup',
    goal: 'Wipe every muddy paw print and untie every leash in 30 moves or fewer.',
    scoring: '800 per cleanup; a clean board adds 5,000 plus 800 per move left; match points ÷ 10 break ties.',
    tiers: [15000, 25000, 38000],
  },
};
export const CHALLENGE_IDS = Object.keys(CHALLENGES);
export const COMBO_SCALE = 0.7;
export const CLEANUP = { perItem: 800, cleanBonus: 5000, perMoveLeft: 800, pointsDiv: 10 };
export const isChallengeId = v => typeof v === 'string' && Object.hasOwn(CHALLENGES, v);

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

// Combo runs: open boards with 5 kinds, where chains come easily.
const COMBO_LAYOUTS = [
  { kinds: 5, rows: ['........', '........', '........', '........', '........', '........', '........', '........'] },
  { kinds: 5, rows: ['#......#', '........', '........', '........', '........', '........', '........', '#......#'] },
  { kinds: 5, rows: ['........', '........', '...##...', '........', '........', '...##...', '........', '........'] },
  { kinds: 5, rows: ['........', '.#....#.', '........', '........', '........', '........', '.#....#.', '........'] },
];
// Cleanup puzzles: muddy paw prints (m wipes once, M twice) and tangled leashes (l one knot, L two).
const CLEANUP_LAYOUTS = [
  { kinds: 5, rows: ['mm....mm', 'm......m', '...ll...', '..l..l..', '..l..l..', '...ll...', 'm......m', 'mm....mm'] },
  { kinds: 5, rows: ['........', '.M....M.', '..mllm..', '..l..l..', '..l..l..', '..mllm..', '.M....M.', '........'] },
  { kinds: 5, rows: ['m......m', '.m....m.', '..l..l..', '...LL...', '...LL...', '..l..l..', '.m....m.', 'm......m'] },
  { kinds: 5, rows: ['..mMMm..', '........', 'l......l', 'l......l', 'l......l', 'l......l', '........', '..mMMm..'] },
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

// ---------- seasons ----------

/**
 * Seasons (owner decision, 5 Nov 2026). A season's weeks are its chapters: ordinary weeks, each with its own
 * board and its own best score, played under version 1 (the High score run). A player's season score is their
 * chapter scores added up. Prizes are given once, when the season ends (the lineup of the season's first week),
 * never on the Sundays inside it. The last chapter stops at the season's end, which may be before its Monday.
 * A constant here, so the server (which bundles this file) and the game always agree.
 */
export const SEASONS = Object.freeze([
  Object.freeze({ id: 's1', name: 'Season 1: Top Dog', weeks: Object.freeze(['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']), endsAt: '2026-12-06T04:59:59.999Z' }), // Sat 5 Dec, 11:59:59 pm New York
]);

/** The season a week (Monday key) belongs to, or null. */
export const seasonFor = week => SEASONS.find(s => s.weeks.includes(week)) ?? null;

/** The chapter (1-based) a week is in its season, or null outside a season. */
export function chapterOf(week) {
  const s = seasonFor(week);
  return s ? s.weeks.indexOf(week) + 1 : null;
}

/** The last moment of a season (a season or its id), as epoch ms. */
export function seasonEndsAt(season) {
  const s = typeof season === 'string' ? SEASONS.find(x => x.id === season) : season;
  return s ? Date.parse(s.endsAt) : NaN;
}

/** When play in a week stops counting: the week's end, or the season's end when that comes first (the last chapter). */
export function playEndsAt(week) {
  const s = seasonFor(week);
  return s ? Math.min(weekEndsAt(week), seasonEndsAt(s)) : weekEndsAt(week);
}

function hash(text) {
  let h = 2166136261;
  for (const ch of text) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---------- versioned rules ----------

/**
 * The rules for a week. `from` is the Monday (week key) version 2 starts, or null while the owner has
 * not scheduled it: every week before it plays version 1 exactly as before. Version 2 never applies
 * to a week that has already started when it is scheduled, because `from` must be a future week.
 */
export function rulesFor(week, from = null) {
  const v2 = isWeekKey(from) && week >= from;
  if (!v2) return { version: 1, challenges: ['high-score'], combined: false, from: isWeekKey(from) ? from : null };
  return { version: 2, challenges: CHALLENGE_IDS.slice(), combined: true, from };
}

const pick = (list, week) => {
  const n = Math.round(Date.parse(`${week}T12:00:00Z`) / (7 * DAY_MS));
  return list[((n % list.length) + list.length) % list.length];
};

/** A week's challenge level and seed. The High score run is the same whatever the rules version. */
export function challengeFor(week, challenge = 'high-score') {
  if (challenge === 'high-score') {
    const design = pick(LAYOUTS, week);
    const level = {
      id: CHALLENGE_LEVEL_ID, area: 'weekly', moves: CHALLENGE_MOVES, kinds: design.kinds,
      goal: { type: 'attack' }, stars: [20000, 30000], layout: design.rows, week, challenge,
    };
    return { level, seed: hash(`pawtastic-weekly-${week}`) };
  }
  const def = CHALLENGES[challenge];
  if (!def) throw new Error(`unknown challenge ${challenge}`);
  const design = pick(challenge === 'combo' ? COMBO_LAYOUTS : CLEANUP_LAYOUTS, week);
  const level = {
    id: def.levelId, area: 'weekly', moves: def.moves, kinds: design.kinds,
    goal: challenge === 'combo' ? { type: 'attack' } : { type: 'cleanup' }, stars: [20000, 30000], layout: design.rows, week, challenge,
  };
  return { level, seed: hash(`pawtastic-weekly-${challenge}-${week}`) };
}

export function newChallengeGame(week, challenge = 'high-score') {
  const { level, seed } = challengeFor(week, challenge);
  return createGame(level, seed);
}

/** The combo value of one move: the points of every cascade step after the swap's own clear. */
export const comboOf = steps => steps.slice(1).reduce((sum, st) => sum + st.points, 0);

/** The Cleanup puzzle's normalized score from a finished game. */
export function cleanupScore(game) {
  const total = game.mudTotal + game.leashTotal;
  const cleaned = total - game.mudLeft - game.leashLeft;
  const won = game.status === 'won';
  return cleaned * CLEANUP.perItem + (won ? CLEANUP.cleanBonus + game.movesLeft * CLEANUP.perMoveLeft : 0) + Math.floor((game.score - game.bonus) / CLEANUP.pointsDiv);
}

/**
 * Replays a run: moves are [r1, c1, r2, c2] swaps in order. Returns { ok: true, score, raw } for a
 * finished run — every move used, or, in the Cleanup puzzle, the board clean — or { ok: false, error }
 * when a move is not a legal swap, the run is unfinished, or it goes on after the end. `score` is the
 * normalized result (the High score run's is its points, exactly as in version 1).
 */
export function replayChallenge(week, moves, challenge = 'high-score') {
  if (!isChallengeId(challenge)) return { ok: false, error: 'bad-run' };
  const def = CHALLENGES[challenge];
  if (!Array.isArray(moves) || moves.length > def.moves || (challenge !== 'cleanup' && moves.length !== def.moves)) return { ok: false, error: 'unfinished' };
  const game = newChallengeGame(week, challenge);
  let combo = 0;
  let bestChain = 0;
  for (const m of moves) {
    if (!Array.isArray(m) || m.length !== 4 || !m.every(n => Number.isInteger(n) && n >= 0 && n < 16)) return { ok: false, error: 'bad-move' };
    const res = trySwap(game, { r: m[0], c: m[1] }, { r: m[2], c: m[3] });
    if (!res.ok) return { ok: false, error: 'bad-move' };
    combo += comboOf(res.steps);
    bestChain = Math.max(bestChain, res.steps.length);
  }
  if (game.status === 'playing') return { ok: false, error: 'unfinished' };
  if (challenge === 'high-score') return { ok: true, score: game.score, raw: game.score };
  if (challenge === 'combo') return { ok: true, score: Math.round(combo * COMBO_SCALE), raw: combo, bestChain };
  const total = game.mudTotal + game.leashTotal;
  return { ok: true, score: cleanupScore(game), raw: game.score - game.bonus, cleaned: total - game.mudLeft - game.leashLeft, total, clean: game.status === 'won', movesLeft: game.movesLeft };
}

/** The weekly total under version 2: the best normalized result in each challenge, added up. */
export function combinedTotal(bests) {
  return CHALLENGE_IDS.reduce((sum, id) => sum + Math.max(0, Math.floor(Number(bests?.[id]) || 0)), 0);
}

/** bronze / silver / gold (or null) for one challenge's normalized score. */
export function tierOf(challenge, score) {
  const tiers = CHALLENGES[challenge]?.tiers;
  if (!tiers || !(score > 0)) return null;
  return score >= tiers[2] ? 'gold' : score >= tiers[1] ? 'silver' : score >= tiers[0] ? 'bronze' : null;
}
export const TIER_NAMES = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };
export const TIER_ORDER = { bronze: 1, silver: 2, gold: 3 };
/** The moves a challenge allows (version 1's High score run keeps CHALLENGE_MOVES). */
export const movesFor = challenge => CHALLENGES[challenge]?.moves ?? CHALLENGE_MOVES;

/** One useful tip after each run, in turn (Professor Paws' school tone; no pressure, no selling). */
export const CHALLENGE_TIPS = {
  'high-score': [
    'Matches near the bottom of the board set off more cascades: new pieces fall through the gaps above.',
    'Line up 4 for a Zoomie or 5 for a Bubble Blaster: one special piece is worth many plain matches.',
    'Look for a swap that makes two matches at once. The second match is free points.',
    'Crates break when you match next to them, and the pieces that fall in can start a chain.',
  ],
  combo: [
    'Only the chain reactions count here: plan a match that leaves matching pieces lined up above it.',
    'Clearing low on the board drops more pieces, and falling pieces are what make cascades.',
    'A Zoomie across a full row empties a lot of space at once; what falls in often chains.',
    'Watch which colours sit above your match: three of a kind stacked up will fall into a line.',
  ],
  cleanup: [
    'Muddy paw prints wipe when you match on them; a dark print needs two matches.',
    'Tangled pieces can\'t move. Match two others next to a knot to untie it.',
    'Every move left when the board is clean adds a bonus, so clean fast rather than chasing points.',
    'Corner prints are the slow ones: start there while the middle still has plenty of swaps.',
  ],
};
export const tipFor = (challenge, runNumber = 1) => {
  const tips = CHALLENGE_TIPS[challenge] ?? CHALLENGE_TIPS['high-score'];
  return tips[(Math.max(1, runNumber) - 1) % tips.length];
};

/** A run made of the first legal swap each turn (for tests and examples; it plays badly on purpose). */
export function sampleRun(week, challenge = 'high-score') {
  const game = newChallengeGame(week, challenge);
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
