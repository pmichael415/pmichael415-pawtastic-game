// How the Weekly Challenge's normalization constants were chosen: three bots (random, first legal
// swap, one-move greedy) play every challenge over 8 weeks; the constants in src/engine/challenge.js
// are set so a bot of one strength scores about the same in each challenge (so no challenge dominates).
//   node tools/calibrate-challenge.mjs
import { CHALLENGE_IDS, newChallengeGame, replayChallenge, comboOf, nextWeek } from '../src/engine/challenge.js';
import { trySwap } from '../src/engine/game.js';
import { createRng } from '../src/engine/rng.js';

const legalMoves = game => {
  const out = [];
  for (let r = 0; r < game.grid.rows; r++) for (let c = 0; c < game.grid.cols; c++) for (const [dr, dc] of [[0, 1], [1, 0]]) {
    const probe = { ...game, grid: structuredClone(game.grid), rng: game.rng.clone() };
    const res = trySwap(probe, { r, c }, { r: r + dr, c: c + dc });
    if (res.ok) out.push({ move: [r, c, r + dr, c + dc], probe, res });
  }
  return out;
};
const gainOf = (challenge, before, { probe, res }) => {
  if (challenge === 'combo') return comboOf(res.steps);
  if (challenge === 'cleanup') return ((before.mudLeft - probe.mudLeft) + (before.leashLeft - probe.leashLeft)) * 1000 + (probe.score - before.score) / 10;
  return probe.score - before.score;
};
function play(week, challenge, strategy, rng) {
  const game = newChallengeGame(week, challenge);
  const moves = [];
  while (game.status === 'playing') {
    const options = legalMoves(game);
    if (!options.length) break;
    let choice;
    if (strategy === 'first') choice = options[0];
    else if (strategy === 'random') choice = options[rng.int(options.length)];
    else choice = options.reduce((best, o) => (gainOf(challenge, game, o) > gainOf(challenge, game, best) ? o : best), options[0]);
    moves.push(choice.move);
    trySwap(game, { r: choice.move[0], c: choice.move[1] }, { r: choice.move[2], c: choice.move[3] });
  }
  return replayChallenge(week, moves, challenge);
}
const weeks = []; let w = '2026-11-16'; for (let i = 0; i < 8; i++) { weeks.push(w); w = nextWeek(w); }
const rows = [];
for (const strategy of ['random', 'first', 'greedy']) {
  for (const challenge of CHALLENGE_IDS) {
    const rng = createRng(7);
    const scores = weeks.map(week => play(week, challenge, strategy, rng).score);
    const mean = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    rows.push({ strategy, challenge, mean, min: Math.min(...scores), max: Math.max(...scores) });
  }
}
console.table(rows);
