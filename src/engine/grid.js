// The board: cells, tiles and layouts.
//
// Cell = null (blocked) | { tile: Tile|null, crate: 0|1|2, mud: 0|1|2, leash?: 0|1|2 }
// A tangled leash holds its piece in place (no swapping, no falling); any clear there unties one knot.
// Tile = { id, kind: string|null, special: null|'zoomieH'|'zoomieV'|'bomb'|'blaster' }

export const KINDS = ['bone', 'ball', 'paw', 'frisbee', 'biscuit', 'duck', 'pinecone', 'lantern'];

// A level's pieces: a count (the first N of KINDS) or a list of kind names (Summer Camp).
export function kindList(kinds) {
  return Array.isArray(kinds) ? kinds : KINDS.slice(0, kinds);
}

const DEFAULT_LAYOUT = Array(8).fill('........');
const LAYOUT_CHARS = {
  '.': { crate: 0, mud: 0, leash: 0 },
  c: { crate: 1, mud: 0, leash: 0 },
  C: { crate: 2, mud: 0, leash: 0 },
  m: { crate: 0, mud: 1, leash: 0 },
  M: { crate: 0, mud: 2, leash: 0 },
  l: { crate: 0, mud: 0, leash: 1 },
  L: { crate: 0, mud: 0, leash: 2 },
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
      cells.push({ tile: null, crate: spec.crate, mud: spec.mud, leash: spec.leash });
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
  return !!cell && cell.crate === 0 && !(cell.leash > 0) && cell.tile !== null;
}

export function isLeashed(cell) {
  return !!cell && cell.leash > 0;
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
  const kinds = kindList(kindCount);
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
