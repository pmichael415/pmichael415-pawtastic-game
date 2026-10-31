// One level being played: moves, goal, score, stars and boosters.

import { createRng } from './rng.js';
import { parseLayout, fillEmpty, cellAt, isMovable } from './grid.js';
import { canSwap, resolveSwap } from './resolve.js';
import { hasValidMove, reshuffle, ensurePlayable } from './shuffle.js';

const BONUS_PER_MOVE = 500;

export const KIND_NAMES = {
  bone: ['Bone', 'Bones'],
  ball: ['Tennis Ball', 'Tennis Balls'],
  paw: ['PAWtastic Paw', 'PAWtastic Paws'],
  frisbee: ['Frisbee', 'Frisbees'],
  biscuit: ['Biscuit', 'Biscuits'],
  duck: ['Rubber Duck', 'Rubber Ducks'],
  pinecone: ['Pinecone', 'Pinecones'],
  lantern: ['Camp Lantern', 'Camp Lanterns'],
};

function countMud(grid) {
  return grid.cells.reduce((sum, cell) => sum + (cell ? cell.mud : 0), 0);
}

function countLeash(grid) {
  return grid.cells.reduce((sum, cell) => sum + (cell?.leash > 0 ? cell.leash : 0), 0);
}

export function createGame(level, seed, { grid } = {}) {
  const rng = createRng(seed);
  let board = grid;
  if (!board) {
    board = parseLayout(level.layout);
    fillEmpty(board, rng, level.kinds, { avoidMatches: true });
    ensurePlayable(board, rng, level.kinds);
  }
  const mudTotal = countMud(board);
  const leashTotal = countLeash(board);
  return {
    level, grid: board, rng,
    movesLeft: level.moves, movesMade: 0, score: 0, collected: 0,
    mudTotal, mudLeft: mudTotal, leashTotal, leashLeft: leashTotal,
    status: 'playing', stars: 0, bonus: 0,
  };
}

// A level in progress as plain data, so it can be saved and picked up later exactly as it was.
export function snapshotGame(game) {
  return {
    levelId: game.level.id,
    grid: structuredClone(game.grid),
    rngState: game.rng.getState(),
    movesLeft: game.movesLeft, movesMade: game.movesMade, score: game.score, collected: game.collected,
    mudTotal: game.mudTotal, mudLeft: game.mudLeft, leashTotal: game.leashTotal, leashLeft: game.leashLeft, status: game.status,
  };
}

// The game a snapshot describes, or null when it isn't a usable snapshot of this level.
export function restoreGame(level, snap) {
  const board = snap?.grid;
  const ok = snap?.levelId === level.id && board && Array.isArray(board.cells)
    && board.rows > 0 && board.cols > 0 && board.cells.length === board.rows * board.cols
    && Number.isInteger(snap.rngState) && Number.isInteger(snap.movesLeft) && (snap.status === 'playing' || snap.status === 'lost');
  if (!ok) return null;
  const rng = createRng(0);
  rng._setState(snap.rngState);
  return {
    level, grid: structuredClone(board), rng,
    movesLeft: snap.movesLeft, movesMade: snap.movesMade, score: snap.score, collected: snap.collected,
    mudTotal: snap.mudTotal, mudLeft: snap.mudLeft,
    leashTotal: snap.leashTotal ?? countLeash(board), leashLeft: snap.leashLeft ?? countLeash(board),
    status: snap.status, stars: 0, bonus: 0,
  };
}

export function goalProgress(game) {
  const { goal } = game.level;
  let current, target;
  if (goal.type === 'attack') return { current: game.score, target: 0, remaining: 0, done: false };
  if (goal.type === 'score') { current = game.score; target = goal.target; }
  else if (goal.type === 'collect') { current = game.collected; target = goal.count; }
  else if (goal.type === 'leash') { current = game.leashTotal - game.leashLeft; target = game.leashTotal; }
  else { current = game.mudTotal - game.mudLeft; target = game.mudTotal; }
  const remaining = Math.max(0, target - current);
  return { current, target, remaining, done: remaining === 0 };
}

export function starsFor(level, score, won) {
  if (!won) return 0;
  const [s2, s3] = level.stars;
  return score >= s3 ? 3 : score >= s2 ? 2 : 1;
}

function checkEnd(game) {
  // Score attack (the Weekly Challenge): play every move; the score at the end is the result.
  if (game.level.goal.type === 'attack') {
    if (game.movesLeft === 0) { game.status = 'won'; game.bonus = 0; game.stars = starsFor(game.level, game.score, true); }
    return;
  }
  if (goalProgress(game).done) {
    game.status = 'won';
    game.bonus = BONUS_PER_MOVE * game.movesLeft;
    game.score += game.bonus;
    game.stars = starsFor(game.level, game.score, true);
  } else if (game.movesLeft === 0) {
    game.status = 'lost';
  }
}

export function trySwap(game, a, b) {
  if (game.status !== 'playing' || !canSwap(game.grid, a, b)) return { ok: false };
  const steps = resolveSwap(game.grid, a, b, game.rng, game.level.kinds);
  game.movesLeft -= 1;
  game.movesMade += 1;
  const goalKind = game.level.goal.type === 'collect' ? game.level.goal.kind : null;
  for (const step of steps) {
    game.score += step.points;
    if (goalKind) game.collected += step.cleared.filter(t => t.kind === goalKind).length;
    game.mudLeft -= step.mud.length;
    game.leashLeft -= step.leash?.length ?? 0;
  }
  checkEnd(game);
  let reshuffled = false;
  if (game.status === 'playing' && !hasValidMove(game.grid)) {
    reshuffle(game.grid, game.rng, game.level.kinds);
    reshuffled = true;
  }
  return { ok: true, steps, reshuffled, status: game.status };
}

export function addMoves(game, n = 5) {
  game.movesLeft += n;
  if (game.status === 'lost') game.status = 'playing';
}

function boosterTarget(game, cell) {
  const tile = cell && isMovable(game.grid, cell.r, cell.c) ? cellAt(game.grid, cell.r, cell.c).tile : null;
  return tile && !tile.special && tile.kind ? tile : null;
}

// Would useBooster succeed? Asks without changing the board.
export function canUseBooster(game, type, cell) {
  if (game.status !== 'playing') return false;
  if (type === 'shuffle') return true;
  return (type === 'bomb' || type === 'blaster') && !!boosterTarget(game, cell);
}

export function useBooster(game, type, cell) {
  if (game.status !== 'playing') return { ok: false, error: 'not-playing' };
  if (type === 'shuffle') {
    reshuffle(game.grid, game.rng, game.level.kinds);
    return { ok: true };
  }
  const tile = boosterTarget(game, cell);
  if (!tile) return { ok: false, error: 'bad-cell' };
  if (type === 'bomb') tile.special = 'bomb';
  else if (type === 'blaster') { tile.special = 'blaster'; tile.kind = null; }
  else return { ok: false, error: 'bad-cell' };
  return { ok: true };
}

export function remainingText(game) {
  const { remaining } = goalProgress(game);
  const { goal } = game.level;
  if (goal.type === 'attack') return `${game.movesLeft} ${game.movesLeft === 1 ? 'move' : 'moves'} left`;
  if (goal.type === 'score') return `${remaining.toLocaleString('en-US')} more points`;
  if (goal.type === 'collect') {
    const [one, many] = KIND_NAMES[goal.kind];
    return `${remaining} more ${remaining === 1 ? one : many}`;
  }
  if (goal.type === 'leash') return `${remaining} more leash ${remaining === 1 ? 'knot' : 'knots'}`;
  return `${remaining} more mud ${remaining === 1 ? 'spot' : 'spots'}`;
}
