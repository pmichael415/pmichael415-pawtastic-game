// PAWtastic Daycare Tycoon — lot geometry (spec §4.1–§4.2). Tiles are 2 × 2 world units; "S" is +r (toward the road).
import { COLS, PARCELS, ROWS, TILE, WALL_PRICE, FLOOR_PRICE, thingSize } from "./catalog";
import type { Door, ParcelId, Room, Rot, Side } from "./types";

export type Tile = { c: number; r: number };

export const tileKey = (c: number, r: number) => `${c},${r}`;
export const inGrid = (c: number, r: number) => c >= 0 && c < COLS && r >= 0 && r < ROWS;

export function tileCenter(c: number, r: number): { x: number; z: number } {
  return { x: -36 + TILE * c + TILE / 2, z: -36 + TILE * r + TILE / 2 };
}

export function tileAtWorld(x: number, z: number): Tile | null {
  const c = Math.floor((x + 36) / TILE);
  const r = Math.floor((z + 36) / TILE);
  return inGrid(c, r) ? { c, r } : null;
}

export function rotatedSize(w: number, d: number, rot: Rot | number): { w: number; d: number } {
  return rot % 2 === 1 ? { w: d, d: w } : { w, d };
}

export function rectTiles(c: number, r: number, w: number, d: number): Tile[] {
  const out: Tile[] = [];
  for (let dr = 0; dr < d; dr++) for (let dc = 0; dc < w; dc++) out.push({ c: c + dc, r: r + dr });
  return out;
}

export function thingTiles(p: { kind: string; c: number; r: number; rot: Rot | number }): Tile[] {
  const base = thingSize(p.kind);
  const { w, d } = rotatedSize(base.w, base.d, p.rot);
  return rectTiles(p.c, p.r, w, d);
}

export const roomTiles = (room: Pick<Room, "c" | "r" | "w" | "d">): Tile[] => rectTiles(room.c, room.r, room.w, room.d);

/** Length of a room side in tiles. */
export const sideLength = (room: Pick<Room, "w" | "d">, side: Side) => (side === "N" || side === "S" ? room.w : room.d);

/** Every perimeter wall segment: the inside tile and the side it faces. */
export function roomOutline(room: Pick<Room, "c" | "r" | "w" | "d">): { c: number; r: number; side: Side }[] {
  const out: { c: number; r: number; side: Side }[] = [];
  for (let i = 0; i < room.w; i++) {
    out.push({ c: room.c + i, r: room.r, side: "N" });
    out.push({ c: room.c + i, r: room.r + room.d - 1, side: "S" });
  }
  for (let i = 0; i < room.d; i++) {
    out.push({ c: room.c, r: room.r + i, side: "W" });
    out.push({ c: room.c + room.w - 1, r: room.r + i, side: "E" });
  }
  return out;
}

export function isCornerDoor(room: Pick<Room, "w" | "d">, door: Door): boolean {
  return door.i <= 0 || door.i >= sideLength(room, door.side) - 1;
}

export function doorInRange(room: Pick<Room, "w" | "d">, door: Door): boolean {
  return Number.isInteger(door.i) && door.i >= 0 && door.i < sideLength(room, door.side);
}

/** The tile just inside a door. */
export function doorInside(room: Pick<Room, "c" | "r" | "w" | "d">, door: Door): Tile {
  switch (door.side) {
    case "N":
      return { c: room.c + door.i, r: room.r };
    case "S":
      return { c: room.c + door.i, r: room.r + room.d - 1 };
    case "W":
      return { c: room.c, r: room.r + door.i };
    case "E":
      return { c: room.c + room.w - 1, r: room.r + door.i };
  }
}

const STEP: Record<Side, Tile> = { N: { c: 0, r: -1 }, S: { c: 0, r: 1 }, W: { c: -1, r: 0 }, E: { c: 1, r: 0 } };
export const OPPOSITE: Record<Side, Side> = { N: "S", S: "N", E: "W", W: "E" };
export const stepFrom = (t: Tile, side: Side): Tile => ({ c: t.c + STEP[side].c, r: t.r + STEP[side].r });

/** The tile just outside a door. */
export function doorOutside(room: Pick<Room, "c" | "r" | "w" | "d">, door: Door): Tile {
  return stepFrom(doorInside(room, door), door.side);
}

export function parcelAt(c: number, r: number): ParcelId | null {
  return PARCELS.find((p) => c >= p.c0 && c < p.c1 && r >= p.r0 && r < p.r1)?.id ?? null;
}

export function isOwned(land: ParcelId[], c: number, r: number): boolean {
  const p = parcelAt(c, r);
  return p !== null && land.includes(p);
}

/** Walls (20 per outline segment) plus floor (10 per tile). */
export function roomPrice(w: number, d: number): number {
  return (2 * w + 2 * d) * WALL_PRICE + w * d * FLOOR_PRICE;
}

export const containsTile = (room: Pick<Room, "c" | "r" | "w" | "d">, t: Tile) =>
  t.c >= room.c && t.c < room.c + room.w && t.r >= room.r && t.r < room.r + room.d;
