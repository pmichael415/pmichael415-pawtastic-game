// A bot that plays levels many times, to tune moves and star scores.
//
//   node tools/simulate.mjs [--levels 41-80] [--seeds 120] [--skill 0.55]
//   node tools/simulate.mjs --tune --levels 41-80     suggest moves that land each level in its win band
//   node tools/simulate.mjs --stars --levels 41-80    suggest star scores from the winning scores
//
// The bot looks one move ahead without seeing which pieces will drop in (its lookahead uses a
// different random stream), and with probability (1 - skill) it plays a random legal move instead,
// so it plays roughly like a casual player rather than a perfect one. Boosters are never used:
// every level must be winnable without paying.

import { LEVELS, getLevel, winBand, starShares } from '../src/engine/levels.js';
import { createGame, trySwap, goalProgress } from '../src/engine/game.js';
import { cloneGrid } from '../src/engine/grid.js';
import { canSwap } from '../src/engine/resolve.js';
import { createRng } from '../src/engine/rng.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const flag = name => args.includes(`--${name}`);
// --levels 41-44,51,54-55
const IDS = String(opt('levels', `1-${LEVELS.length}`)).split(',').flatMap(part => {
  const [a, b = a] = part.split('-').map(Number);
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
});
const SEEDS = Number(opt('seeds', 120));
const SKILL = Number(opt('skill', 0.55));

function validSwaps(grid) {
  const out = [];
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const a = { r, c }, b = { r: r + dr, c: c + dc };
        if (canSwap(grid, a, b)) out.push([a, b]);
      }
    }
  }
  return out;
}

function value(game, before, steps) {
  const p = goalProgress(game);
  let v = (p.current - before.current) * (game.level.goal.type === 'score' ? 1 / 60 : 3);
  if (p.done) v += 1000;
  for (const s of steps) {
    v += s.cleared.length * 0.1 + s.crates.length * 0.6 + s.created.length * 1.5;
  }
  return v;
}

function chooseMove(game, rng) {
  const swaps = validSwaps(game.grid);
  if (!swaps.length) return null;
  if (rng.next() > SKILL) return rng.pick(swaps);
  const before = goalProgress(game);
  let best = null, bestV = -Infinity;
  for (const [a, b] of swaps) {
    const trial = { ...game, grid: cloneGrid(game.grid), rng: createRng(rng.int(2 ** 31)) };
    const res = trySwap(trial, a, b);
    if (!res.ok) continue;
    const v = value(trial, before, res.steps) + rng.next() * 0.05;
    if (v > bestV) { bestV = v; best = [a, b]; }
  }
  return best;
}

export function playOnce(level, seed, moves = level.moves) {
  const game = createGame({ ...level, moves }, seed);
  const bot = createRng(seed * 7919 + 13);
  while (game.status === 'playing') {
    const move = chooseMove(game, bot);
    if (!move) break;
    trySwap(game, move[0], move[1]);
  }
  return { won: game.status === 'won', score: game.score, progress: goalProgress(game) };
}

function runLevel(level, moves, seeds = SEEDS) {
  const results = [];
  for (let s = 1; s <= seeds; s++) results.push(playOnce(level, s * 1000 + level.id, moves));
  const wins = results.filter(r => r.won);
  return { rate: wins.length / results.length, wins, results };
}

const pct = n => `${Math.round(n * 100)}%`;
const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)))];

for (const id of IDS) {
  const level = getLevel(id);
  const [bandLo, bandHi] = winBand(id);
  if (flag('tune')) {
    // Fewest moves whose win rate reaches the middle of the band.
    const target = (bandLo + bandHi) / 2;
    let m = Math.max(8, Math.round(level.moves * 0.6));
    let run = runLevel(level, m, Math.round(SEEDS / 2));
    while (run.rate < target && m < 80) { m += run.rate < target - 0.25 ? 4 : 1; run = runLevel(level, m, Math.round(SEEDS / 2)); }
    const check = runLevel(level, m);
    console.log(`L${id} moves ${level.moves} -> ${m}  win ${pct(check.rate)} (band ${pct(bandLo)}-${pct(bandHi)})`);
  } else if (flag('stars')) {
    const run = runLevel(level, level.moves);
    const scores = run.wins.map(w => w.score).sort((a, b) => a - b);
    const { two, three } = starShares(id);
    const round = n => Math.round(n / 500) * 500;
    const s2 = scores.length ? round(quantile(scores, 1 - two)) : 0;
    const s3 = scores.length ? Math.max(s2 + 500, round(quantile(scores, 1 - three))) : 0;
    console.log(`L${id} stars [${level.stars.join(', ')}] -> [${s2}, ${s3}]  (win ${pct(run.rate)}, ${run.wins.length} wins)`);
  } else {
    const run = runLevel(level, level.moves);
    const flagTxt = run.rate < bandLo ? ' HARD' : run.rate > bandHi ? ' EASY' : '';
    const avgLeft = run.results.reduce((s, r) => s + r.progress.remaining / Math.max(1, r.progress.target), 0) / run.results.length;
    console.log(`L${id} ${level.goal.type.padEnd(7)} moves ${String(level.moves).padStart(2)}  win ${pct(run.rate).padStart(4)} band ${pct(bandLo)}-${pct(bandHi)}${flagTxt}  avg left ${pct(avgLeft)}`);
  }
}
