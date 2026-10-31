// The board: cells, tiles and layouts.
//
// Cell = null (blocked) | { tile: Tile|null, crate: 0|1|2, mud: 0|1|2 }
// Tile = { id, kind: string|null, special: null|'zoomieH'|'zoomieV'|'bomb'|'blaster' }

export const KINDS = ['bone', 'ball', 'paw', 'frisbee', 'biscuit', 'duck'];

const DEFAULT_LAYOUT = Array(8).fill('........');
const LAYOUT_CHARS = {
  '.': { crate: 0, mud: 0 },
  c: { crate: 1, mud: 0 },
  C: { crate: 2, mud: 0 },
  m: { crate: 0, mud: 1 },
  M: { crate: 0, mud: 2 },
};

export function parseLayout(rows = DEFAULT_LAYOUT) {
  const cols = rows[0].length;
  const cells = [];
  for (const row of rows) {
    if (row.length !== cols) throw new Error('Layout rows must all be the same length');
    for (const ch of row) {
      if (ch === '#') { cells.push(null); continue; }
      const spec = LAYOUT_CHARS[ch];
      if (!spec) throw new Error(`Unknown layout character "${ch}"`);
      cells.push({ tile: null, crate: spec.crate, mud: spec.mud });
    }
  }
  return { rows: rows.length, cols, cells, nextId: 1 };
}

export function cellAt(grid, r, c) {
  if (r < 0 || c < 0 || r >= grid.rows || c >= grid.cols) return undefined;
  return grid.cells[r * grid.cols + c];
}

export function isMovable(grid, r, c) {
  const cell = cellAt(grid, r, c);
  return !!cell && cell.crate === 0 && cell.tile !== null;
}

export function newTile(grid, kind, special = null) {
  return { id: grid.nextId++, kind, special };
}

function makesRun(grid, r, c, kind) {
  const kindAt = (rr, cc) => cellAt(grid, rr, cc)?.tile?.kind ?? null;
  return (kindAt(r, c - 1) === kind && kindAt(r, c - 2) === kind)
    || (kindAt(r - 1, c) === kind && kindAt(r - 2, c) === kind);
}

export function fillEmpty(grid, rng, kindCount, { avoidMatches = false } = {}) {
  const kinds = KINDS.slice(0, kindCount);
  const spawned = [];
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const cell = cellAt(grid, r, c);
      if (!cell || cell.crate > 0 || cell.tile) continue;
      let choices = kinds;
      if (avoidMatches) {
        const allowed = kinds.filter(k => !makesRun(grid, r, c, k));
        if (allowed.length) choices = allowed;
      }
      cell.tile = newTile(grid, rng.pick(choices));
      spawned.push({ r, c, tile: cell.tile });
    }
  }
  return spawned;
}

export function cloneGrid(grid) {
  return {
    rows: grid.rows,
    cols: grid.cols,
    nextId: grid.nextId,
    cells: grid.cells.map(cell => cell && { ...cell, tile: cell.tile && { ...cell.tile } }),
  };
}
