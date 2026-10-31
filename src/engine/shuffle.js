// Finding a valid move, and reshuffling a board that has none.

import { cellAt, isMovable, fillEmpty } from './grid.js';
import { findMatches } from './match.js';
import { canSwap } from './resolve.js';

const ATTEMPTS = 100;

export function findValidMove(grid) {
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const a = { r, c }, b = { r: r + dr, c: c + dc };
        if (canSwap(grid, a, b)) return { a, b };
      }
    }
  }
  return null;
}

export function hasValidMove(grid) {
  return findValidMove(grid) !== null;
}

function movableCells(grid) {
  const cells = [];
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) if (isMovable(grid, r, c)) cells.push(cellAt(grid, r, c));
  }
  return cells;
}

function playable(grid) {
  return findMatches(grid).length === 0 && hasValidMove(grid);
}

function shuffleTiles(cells, rng) {
  const tiles = cells.map(cell => cell.tile);
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  cells.forEach((cell, i) => { cell.tile = tiles[i]; });
}

export function reshuffle(grid, rng, kindCount) {
  const cells = movableCells(grid);
  for (let i = 0; i < ATTEMPTS; i++) {
    shuffleTiles(cells, rng);
    if (playable(grid)) return;
  }
  // Fall back to fresh tiles (specials keep their place).
  for (let i = 0; i < ATTEMPTS; i++) {
    for (const cell of cells) if (!cell.tile.special) cell.tile = null;
    fillEmpty(grid, rng, kindCount, { avoidMatches: true });
    if (playable(grid)) return;
  }
  throw new Error('unplayable board');
}

export function ensurePlayable(grid, rng, kindCount) {
  if (playable(grid)) return false;
  reshuffle(grid, rng, kindCount);
  return true;
}
