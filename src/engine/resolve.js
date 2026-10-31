// Resolving a swap: clearing, crates and mud, new specials, gravity, refill
// and cascades. Mutates the grid and returns one Step per cascade step.

import { cellAt, isMovable, isLeashed, newTile, fillEmpty } from './grid.js';
import { findMatches, specialForShape, placementCell } from './match.js';
import { expandClears, isComboSwap, comboClears } from './specials.js';

export const POINTS_PER_TILE = 60;
const MAX_STEPS = 50;
const NEIGHBOURS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

function areAdjacent(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}

function swapTiles(grid, a, b) {
  const ca = cellAt(grid, a.r, a.c);
  const cb = cellAt(grid, b.r, b.c);
  [ca.tile, cb.tile] = [cb.tile, ca.tile];
}

export function canSwap(grid, a, b) {
  if (!areAdjacent(a, b)) return false;
  if (!isMovable(grid, a.r, a.c) || !isMovable(grid, b.r, b.c)) return false;
  if (isComboSwap(grid, a, b)) return true;
  swapTiles(grid, a, b);
  const makesMatch = findMatches(grid).length > 0;
  swapTiles(grid, a, b);
  return makesMatch;
}

function emptyStep() {
  return { cleared: [], created: [], transformed: [], fell: [], spawned: [], crates: [], mud: [], leash: [], points: 0 };
}

// Clear the cells, hit crates, then place new specials from the match groups.
function applyClears(grid, step, stepNumber, { cells, groups, swap, crateCells }) {
  const crateKeys = new Set();
  const hitCrate = (r, c) => {
    const cell = cellAt(grid, r, c);
    if (!cell || cell.crate === 0) return;
    const key = r * grid.cols + c;
    if (crateKeys.has(key)) return;
    crateKeys.add(key);
    cell.crate -= 1;
    step.crates.push({ r, c, left: cell.crate });
  };

  for (const { r, c } of cells) {
    const cell = cellAt(grid, r, c);
    if (cell.crate > 0) { hitCrate(r, c); continue; }
    if (!cell.tile) continue;
    const { id, kind, special } = cell.tile;
    step.cleared.push({ r, c, id, kind, special });
    cell.tile = null;
    if (cell.mud > 0) {
      cell.mud -= 1;
      step.mud.push({ r, c, left: cell.mud });
    }
    if (cell.leash > 0) {
      cell.leash -= 1;
      step.leash.push({ r, c, left: cell.leash });
    }
  }
  for (const { r, c } of crateCells) {
    for (const [dr, dc] of NEIGHBOURS) hitCrate(r + dr, c + dc);
  }
  for (const group of groups) {
    const special = specialForShape(group.shape);
    if (!special) continue;
    // New specials never land inside a leash that is still tied.
    const free = q => { const cl = cellAt(grid, q.r, q.c); return cl && !cl.tile && !isLeashed(cl); };
    const p = [placementCell(group, swap), ...group.cells].find(free);
    if (!p) continue;
    const cell = cellAt(grid, p.r, p.c);
    cell.tile = newTile(grid, special === 'blaster' ? null : group.kind, special);
    step.created.push({ r: p.r, c: p.c, tile: cell.tile });
  }
  step.points = POINTS_PER_TILE * step.cleared.length * stepNumber;
}

// Per column, blocked cells, crates and tied leashes are walls; tiles fall within segments.
function applyGravity(grid, step) {
  for (let c = 0; c < grid.cols; c++) {
    let r = grid.rows - 1;
    while (r >= 0) {
      const isWall = rr => { const cell = cellAt(grid, rr, c); return !cell || cell.crate > 0 || cell.leash > 0; };
      if (isWall(r)) { r--; continue; }
      const bottom = r;
      let top = r;
      while (top - 1 >= 0 && !isWall(top - 1)) top--;
      let write = bottom;
      for (let read = bottom; read >= top; read--) {
        const cell = cellAt(grid, read, c);
        if (!cell.tile) continue;
        if (read !== write) {
          cellAt(grid, write, c).tile = cell.tile;
          cell.tile = null;
          step.fell.push({ id: cellAt(grid, write, c).tile.id, from: { r: read, c }, to: { r: write, c } });
        }
        write--;
      }
      r = top - 1;
    }
  }
}

function finishStep(grid, step, rng, kindCount) {
  applyGravity(grid, step);
  step.spawned = fillEmpty(grid, rng, kindCount);
}

export function settle(grid, rng, kindCount, firstStep = 1) {
  const steps = [];
  for (let n = firstStep; ; n++) {
    const groups = findMatches(grid);
    if (groups.length === 0) return steps;
    if (n - firstStep >= MAX_STEPS) throw new Error('cascade limit');
    const step = emptyStep();
    const seeds = groups.flatMap(g => g.cells);
    const { cells } = expandClears(grid, seeds, rng);
    applyClears(grid, step, n, { cells, groups, swap: undefined, crateCells: seeds });
    finishStep(grid, step, rng, kindCount);
    steps.push(step);
  }
}

export function resolveSwap(grid, a, b, rng, kindCount) {
  swapTiles(grid, a, b);
  const step = emptyStep();
  if (isComboSwap(grid, a, b)) {
    const combo = comboClears(grid, a, b, rng);
    for (const t of combo.transforms) {
      cellAt(grid, t.r, t.c).tile.special = t.special;
      step.transformed.push(t);
    }
    const fired = [a, b, ...combo.transforms];
    const { cells } = expandClears(grid, combo.cells, rng, fired);
    applyClears(grid, step, 1, { cells, groups: [], swap: { a, b }, crateCells: [] });
  } else {
    const groups = findMatches(grid);
    const seeds = groups.flatMap(g => g.cells);
    const { cells } = expandClears(grid, seeds, rng);
    applyClears(grid, step, 1, { cells, groups, swap: { a, b }, crateCells: seeds });
  }
  finishStep(grid, step, rng, kindCount);
  return [step, ...settle(grid, rng, kindCount, 2)];
}
