// PAWtastic Daycare Tycoon — walking routes for people in the 3D campus (staff design §8): through doors, never
// through walls. Pure. No route (a room without a door) → null, and the renderer walks straight there instead.
import { doorInside, doorOutside, inGrid, tileKey, type Tile } from "./grid";
import type { Facility } from "./types";

/** The room each tile belongs to (outside: absent). */
function roomMap(f: Facility): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of f.rooms) for (let c = r.c; c < r.c + r.w; c++) for (let rr = r.r; rr < r.r + r.d; rr++) m.set(tileKey(c, rr), r.uid);
  return m;
}
/** Door crossings, both ways: "c,r|c,r". */
function doorSet(f: Facility): Set<string> {
  const s = new Set<string>();
  for (const r of f.rooms)
    for (const d of r.doors) {
      const a = doorInside(r, d);
      const b = doorOutside(r, d);
      s.add(`${tileKey(a.c, a.r)}|${tileKey(b.c, b.r)}`);
      s.add(`${tileKey(b.c, b.r)}|${tileKey(a.c, a.r)}`);
    }
  return s;
}

/** The shortest route from one tile to another (both ends included), or null if walls are in the way. */
export function findPath(f: Facility, from: Tile, to: Tile): Tile[] | null {
  if (!inGrid(from.c, from.r) || !inGrid(to.c, to.r)) return null;
  if (from.c === to.c && from.r === to.r) return [from];
  const rooms = roomMap(f);
  const doors = doorSet(f);
  const start = tileKey(from.c, from.r);
  const goal = tileKey(to.c, to.r);
  const prev = new Map<string, string | null>([[start, null]]);
  const queue: Tile[] = [from];
  for (let i = 0; i < queue.length; i++) {
    const t = queue[i]!;
    const k = tileKey(t.c, t.r);
    if (k === goal) break;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = { c: t.c + dc, r: t.r + dr };
      if (!inGrid(n.c, n.r)) continue;
      const nk = tileKey(n.c, n.r);
      if (prev.has(nk)) continue;
      if (rooms.get(k) !== rooms.get(nk) && !doors.has(`${k}|${nk}`)) continue; // a wall
      prev.set(nk, k);
      queue.push(n);
    }
  }
  if (!prev.has(goal)) return null;
  const out: Tile[] = [];
  for (let k: string | null = goal; k; k = prev.get(k) ?? null) {
    const [c, r] = k.split(",").map(Number) as [number, number];
    out.push({ c, r });
  }
  return out.reverse();
}
