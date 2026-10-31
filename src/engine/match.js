// Finding matches and deciding which special piece a match makes.

import { cellAt } from './grid.js';

const SPECIAL_FOR_SHAPE = {
  line3: null, line4H: 'zoomieH', line4V: 'zoomieV', LT: 'bomb', line5: 'blaster',
};

function kindAt(grid, r, c) {
  const cell = cellAt(grid, r, c);
  if (!cell || cell.crate > 0 || !cell.tile) return null;
  return cell.tile.kind;
}

function collectRuns(grid) {
  const runs = [];
  const scan = (outer, inner, at, horizontal) => {
    for (let i = 0; i < outer; i++) {
      let start = 0;
      for (let j = 1; j <= inner; j++) {
        const prev = at(i, j - 1);
        const cur = j < inner ? at(i, j) : null;
        if (cur !== null && cur === prev) continue;
        const length = j - start;
        if (prev !== null && length >= 3) {
          const cells = [];
          for (let k = start; k < j; k++) cells.push(horizontal ? { r: i, c: k } : { r: k, c: i });
          runs.push({ kind: prev, cells, horizontal });
        }
        start = j;
      }
    }
  };
  scan(grid.rows, grid.cols, (r, c) => kindAt(grid, r, c), true);
  scan(grid.cols, grid.rows, (c, r) => kindAt(grid, r, c), false);
  return runs;
}

function shapeOf(runs) {
  if (runs.some(run => run.cells.length >= 5)) return 'line5';
  const hasH = runs.some(run => run.horizontal);
  const hasV = runs.some(run => !run.horizontal);
  if (hasH && hasV) return 'LT';
  const run = runs[0];
  if (run.cells.length === 4) return run.horizontal ? 'line4H' : 'line4V';
  return 'line3';
}

export function findMatches(grid) {
  const runs = collectRuns(grid);
  // Union runs that share a cell into one group.
  const parent = runs.map((_, i) => i);
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const owner = new Map();
  runs.forEach((run, i) => {
    for (const { r, c } of run.cells) {
      const key = r * grid.cols + c;
      if (owner.has(key)) parent[find(i)] = find(owner.get(key));
      else owner.set(key, i);
    }
  });
  const groups = new Map();
  runs.forEach((run, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(run);
  });
  return [...groups.values()].map(groupRuns => {
    const seen = new Set();
    const cells = [];
    for (const run of groupRuns) {
      for (const p of run.cells) {
        const key = p.r * grid.cols + p.c;
        if (!seen.has(key)) { seen.add(key); cells.push(p); }
      }
    }
    return { kind: groupRuns[0].kind, cells, shape: shapeOf(groupRuns) };
  });
}

export function specialForShape(shape) {
  return SPECIAL_FOR_SHAPE[shape] ?? null;
}

export function placementCell(group, swap) {
  const has = p => p && group.cells.some(q => q.r === p.r && q.c === p.c);
  if (swap && has(swap.b)) return { r: swap.b.r, c: swap.b.c };
  if (swap && has(swap.a)) return { r: swap.a.r, c: swap.a.c };
  let best = group.cells[0];
  for (const p of group.cells) {
    if (p.r > best.r || (p.r === best.r && p.c < best.c)) best = p;
  }
  return { r: best.r, c: best.c };
}
