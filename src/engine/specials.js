// Special pieces: what each one clears, chain reactions, and two-special combos.

import { KINDS, cellAt } from './grid.js';

const isZoomie = special => special === 'zoomieH' || special === 'zoomieV';

class CellSet {
  constructor(grid) { this.grid = grid; this.keys = new Set(); this.list = []; }
  add(r, c) {
    const cell = cellAt(this.grid, r, c);
    if (!cell) return false; // out of bounds or blocked
    const key = r * this.grid.cols + c;
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    this.list.push({ r, c });
    return true;
  }
  addAll(points) { for (const p of points) this.add(p.r, p.c); }
}

export function mostCommonKind(grid) {
  const counts = new Map();
  for (const cell of grid.cells) {
    const tile = cell?.tile;
    if (tile && tile.kind && !tile.special) counts.set(tile.kind, (counts.get(tile.kind) || 0) + 1);
  }
  let best = null;
  for (const kind of KINDS) {
    if ((counts.get(kind) || 0) > (best ? counts.get(best) : 0)) best = kind;
  }
  return best;
}

function rowCells(grid, r) {
  const out = [];
  for (let c = 0; c < grid.cols; c++) if (cellAt(grid, r, c)) out.push({ r, c });
  return out;
}

function colCells(grid, c) {
  const out = [];
  for (let r = 0; r < grid.rows; r++) if (cellAt(grid, r, c)) out.push({ r, c });
  return out;
}

function square(grid, r, c, radius) {
  const out = [];
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      if (cellAt(grid, r + dr, c + dc)) out.push({ r: r + dr, c: c + dc });
    }
  }
  return out;
}

function cellsOfKind(grid, kind) {
  const out = [];
  if (!kind) return out;
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      if (cellAt(grid, r, c)?.tile?.kind === kind) out.push({ r, c });
    }
  }
  return out;
}

export function effectArea(grid, r, c, tile, rng) {
  switch (tile.special) {
    case 'zoomieH': return rowCells(grid, r);
    case 'zoomieV': return colCells(grid, c);
    case 'bomb': return square(grid, r, c, 1);
    case 'blaster': return [...cellsOfKind(grid, mostCommonKind(grid)), { r, c }];
    default: return [{ r, c }];
  }
}

// `alreadyFired` lists special cells whose effect is already included in the
// seeds (e.g. the two pieces of a combo), so they don't fire a second time.
export function expandClears(grid, seeds, rng, alreadyFired = []) {
  const set = new CellSet(grid);
  set.addAll(seeds);
  const fired = new Set(alreadyFired.map(p => p.r * grid.cols + p.c));
  const triggered = [];
  for (let i = 0; i < set.list.length; i++) {
    const { r, c } = set.list[i];
    const tile = cellAt(grid, r, c)?.tile;
    const key = r * grid.cols + c;
    if (!tile || !tile.special || fired.has(key)) continue;
    fired.add(key);
    triggered.push({ r, c, special: tile.special });
    set.addAll(effectArea(grid, r, c, tile, rng));
  }
  return { cells: set.list, triggered };
}

export function isComboSwap(grid, a, b) {
  const ta = cellAt(grid, a.r, a.c)?.tile;
  const tb = cellAt(grid, b.r, b.c)?.tile;
  if (!ta || !tb) return false;
  return (!!ta.special && !!tb.special) || ta.special === 'blaster' || tb.special === 'blaster';
}

export function comboClears(grid, a, b, rng) {
  const ta = cellAt(grid, a.r, a.c).tile;
  const tb = cellAt(grid, b.r, b.c).tile;
  const set = new CellSet(grid);
  const transforms = [];

  if (ta.special === 'blaster' && tb.special === 'blaster') {
    for (let r = 0; r < grid.rows; r++) set.addAll(rowCells(grid, r));
  } else if (ta.special === 'blaster' || tb.special === 'blaster') {
    const other = ta.special === 'blaster' ? tb : ta;
    if (!other.special) {
      set.addAll(cellsOfKind(grid, other.kind));
    } else {
      for (const p of cellsOfKind(grid, mostCommonKind(grid))) {
        const tile = cellAt(grid, p.r, p.c).tile;
        if (tile.special) continue;
        const special = isZoomie(other.special) ? (rng.int(2) === 0 ? 'zoomieH' : 'zoomieV') : 'bomb';
        transforms.push({ r: p.r, c: p.c, special });
        set.addAll(effectArea(grid, p.r, p.c, { ...tile, special }, rng));
      }
    }
  } else if (isZoomie(ta.special) && isZoomie(tb.special)) {
    set.addAll(rowCells(grid, b.r));
    set.addAll(colCells(grid, b.c));
  } else if (ta.special === 'bomb' && tb.special === 'bomb') {
    set.addAll(square(grid, b.r, b.c, 2));
  } else {
    // zoomie + bomb: three full rows and three full columns around b.
    for (let d = -1; d <= 1; d++) {
      if (b.r + d >= 0 && b.r + d < grid.rows) set.addAll(rowCells(grid, b.r + d));
      if (b.c + d >= 0 && b.c + d < grid.cols) set.addAll(colCells(grid, b.c + d));
    }
  }
  set.add(a.r, a.c);
  set.add(b.r, b.c);
  return { cells: set.list, transforms };
}
