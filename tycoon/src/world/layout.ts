// Fictional game floor plan shared by Hawthorne and Hillsdale. It follows the owner's described flow
// (lobby → playrooms grouped by size + temperament → individual boarding rooms) but it is NOT a real
// floor plan: room sizes, counts and positions are invented for play.
// Units are metres. +x = east, +z = south (towards the entrance), y = up.
import type { GroupId } from "@/game/engine";
import { GROUPS, SUITES_PER_SITE } from "@/game/engine";

export type Rect = { x0: number; z0: number; x1: number; z1: number };
export type Pt = { x: number; z: number };
export type AreaKind = "lobby" | "room" | "suite" | "bath" | "recovery" | "corridor";
export type Area = {
  key: string;
  kind: AreaKind;
  rect: Rect;
  label: string;
  /** Point just inside the doorway and just outside it (in the corridor), for simple path-finding. */
  doorIn: Pt;
  doorOut: Pt;
  floor: string;
  group?: GroupId;
  index?: number;
};

export const BOUNDS: Rect = { x0: -16, z0: -6, x1: 16, z1: 13 };
export const CORRIDOR: Rect = { x0: -16, z0: 2.5, x1: 16, z1: 5.5 };
export const CORRIDOR_Z = 4;
export const ENTRANCE_IN: Pt = { x: 0, z: 11.6 };
export const ENTRANCE_OUT: Pt = { x: 0, z: 16.5 };
export const STREET: Pt = { x: 0, z: 21 };
export const DESK = { x: 0, z: 8.4, w: 5, d: 1 };
export const TUB: Pt = { x: 8.5, z: 9.2 };

export const GROUP_COLORS: Record<GroupId, { floor: string; accent: string }> = {
  "small-gentle": { floor: "#ffe4ee", accent: "#e46a96" },
  "small-active": { floor: "#fff1c4", accent: "#e0a100" },
  "large-gentle": { floor: "#dcf4e4", accent: "#2f9e5b" },
  "large-active": { floor: "#dbeaff", accent: "#0057A7" },
};

const ROOM_W = 8;
export const ROOMS: Area[] = GROUPS.map((g, i) => {
  const x0 = -16 + i * ROOM_W;
  const cx = x0 + ROOM_W / 2;
  return {
    key: `room:${g.id}`,
    kind: "room" as const,
    group: g.id,
    rect: { x0, z0: -6, x1: x0 + ROOM_W, z1: 2.5 },
    label: g.name,
    doorIn: { x: cx, z: 1.4 },
    doorOut: { x: cx, z: CORRIDOR_Z },
    floor: GROUP_COLORS[g.id].floor,
  };
});

const SUITE_W = 10 / SUITES_PER_SITE;
export const SUITES: Area[] = Array.from({ length: SUITES_PER_SITE }, (_, i) => {
  const x0 = -16 + i * SUITE_W;
  const cx = x0 + SUITE_W / 2;
  return {
    key: `suite:${i}`,
    kind: "suite" as const,
    index: i,
    rect: { x0, z0: 5.5, x1: x0 + SUITE_W, z1: 13 },
    label: `Suite ${i + 1}`,
    doorIn: { x: cx, z: 6.6 },
    doorOut: { x: cx, z: CORRIDOR_Z },
    floor: "#ecd9b8",
  };
});

export const LOBBY: Area = { key: "lobby", kind: "lobby", rect: { x0: -6, z0: 5.5, x1: 6, z1: 13 }, label: "Lobby & check-in", doorIn: { x: 0, z: 6.4 }, doorOut: { x: 0, z: CORRIDOR_Z }, floor: "#f3f6fb" };
export const BATH: Area = { key: "bath", kind: "bath", rect: { x0: 6, z0: 5.5, x1: 11, z1: 13 }, label: "Bath & exit-bath area", doorIn: { x: 8.5, z: 6.6 }, doorOut: { x: 8.5, z: CORRIDOR_Z }, floor: "#d6f1f4" };
export const RECOVERY: Area = { key: "recovery", kind: "recovery", rect: { x0: 11, z0: 5.5, x1: 16, z1: 13 }, label: "Staff-only recovery room", doorIn: { x: 13.5, z: 6.6 }, doorOut: { x: 13.5, z: CORRIDOR_Z }, floor: "#ebe5fa" };
export const CORRIDOR_AREA: Area = { key: "corridor", kind: "corridor", rect: CORRIDOR, label: "Hallway", doorIn: { x: 0, z: CORRIDOR_Z }, doorOut: { x: 0, z: CORRIDOR_Z }, floor: "#e9eef5" };

export const AREAS: Area[] = [...ROOMS, ...SUITES, LOBBY, BATH, RECOVERY, CORRIDOR_AREA];
export const areaByKey = (k: string) => AREAS.find((a) => a.key === k);

/** Waiting spots inside the lobby's dog pen (west side of the lobby). */
export const LOBBY_SPOTS: Pt[] = [
  { x: -4.6, z: 7.2 }, { x: -3.2, z: 7.6 }, { x: -4.6, z: 9.0 }, { x: -3.2, z: 9.4 },
  { x: -4.6, z: 10.8 }, { x: -3.2, z: 11.2 },
];
export const LOBBY_PEN: Rect = { x0: -5.6, z0: 6.2, x1: -2.4, z1: 12.2 };

// ---------- Walls ----------
// Each wall is an axis-aligned box: [x0, z0, x1, z1]. Gaps are doorways.
export type Wall = { x0: number; z0: number; x1: number; z1: number; exterior: boolean };
const T = 0.18;
function hWall(z: number, xa: number, xb: number, gaps: [number, number][], exterior = false): Wall[] {
  const out: Wall[] = [];
  let cur = xa;
  for (const [g0, g1] of [...gaps].sort((a, b) => a[0] - b[0])) {
    if (g0 > cur) out.push({ x0: cur, z0: z - T / 2, x1: g0, z1: z + T / 2, exterior });
    cur = Math.max(cur, g1);
  }
  if (cur < xb) out.push({ x0: cur, z0: z - T / 2, x1: xb, z1: z + T / 2, exterior });
  return out;
}
function vWall(x: number, za: number, zb: number, exterior = false): Wall {
  return { x0: x - T / 2, z0: za, x1: x + T / 2, z1: zb, exterior };
}
const gap = (cx: number, w: number): [number, number] => [cx - w / 2, cx + w / 2];

export const WALLS: Wall[] = [
  ...hWall(-6, -16, 16, [], true),
  ...hWall(2.5, -16, 16, ROOMS.map((r) => gap(r.doorIn.x, 1.8))),
  ...hWall(5.5, -16, 16, [...SUITES.map((s) => gap(s.doorIn.x, 1.2)), [-2.2, 2.2], gap(BATH.doorIn.x, 1.6), gap(RECOVERY.doorIn.x, 1.6)]),
  ...hWall(13, -16, 16, [[-1.5, 1.5]], true),
  vWall(-16, -6, 13, true),
  vWall(16, -6, 13, true),
  vWall(-8, -6, 2.5), vWall(0, -6, 2.5), vWall(8, -6, 2.5),
  ...SUITES.slice(1).map((s) => vWall(s.rect.x0, 5.5, 13)),
  vWall(-6, 5.5, 13), vWall(6, 5.5, 13), vWall(11, 5.5, 13),
];

/** Solid furniture the first-person player can't walk through. */
export const COLLIDERS: Rect[] = [
  { x0: DESK.x - DESK.w / 2, z0: DESK.z - DESK.d / 2, x1: DESK.x + DESK.w / 2, z1: DESK.z + DESK.d / 2 },
  { x0: TUB.x - 1.1, z0: TUB.z - 0.7, x1: TUB.x + 1.1, z1: TUB.z + 0.7 },
];

export function inRect(p: Pt, r: Rect, pad = 0) {
  return p.x >= r.x0 + pad && p.x <= r.x1 - pad && p.z >= r.z0 + pad && p.z <= r.z1 - pad;
}
export function areaAt(p: Pt): Area | null {
  for (const a of AREAS) if (inRect(p, a.rect)) return a;
  return null;
}
export function randomIn(r: Rect, pad: number, rand: () => number = Math.random): Pt {
  return { x: r.x0 + pad + rand() * (r.x1 - r.x0 - 2 * pad), z: r.z0 + pad + rand() * (r.z1 - r.z0 - 2 * pad) };
}

/** Moves a circle of radius `r` from `from` by (dx, dz), sliding along walls and furniture. */
export function collide(from: Pt, dx: number, dz: number, r = 0.3): Pt {
  const boxes: Rect[] = [...WALLS, ...COLLIDERS];
  const hit = (p: Pt) => boxes.some((b) => p.x > b.x0 - r && p.x < b.x1 + r && p.z > b.z0 - r && p.z < b.z1 + r);
  let p = { ...from };
  const nx = { x: p.x + dx, z: p.z };
  if (!hit(nx)) p = nx;
  const nz = { x: p.x, z: p.z + dz };
  if (!hit(nz)) p = nz;
  // keep the player inside the site (incl. the front walk)
  p.x = Math.max(BOUNDS.x0 + r, Math.min(BOUNDS.x1 - r, p.x));
  p.z = Math.max(BOUNDS.z0 + r, Math.min(STREET.z - 2, p.z));
  return p;
}

/** Area for a dog's game placement (the single source of truth is the engine's `place`). */
export function areaForPlace(place: { kind: string; group?: string; index?: number }): Area {
  if (place.kind === "room") return ROOMS.find((r) => r.group === place.group) ?? LOBBY;
  if (place.kind === "suite") return SUITES[place.index ?? 0] ?? RECOVERY;
  if (place.kind === "recovery") return RECOVERY;
  return LOBBY;
}

/** Waypoints between two areas through their doorways and the hallway. */
export function routeBetween(from: Pt, fromArea: Area | null, to: Area, target: Pt): Pt[] {
  const pts: Pt[] = [];
  if (fromArea && fromArea.key === to.key) return [target];
  if (!fromArea) {
    // outside → in through the front door
    if (from.z > 13) pts.push(ENTRANCE_IN);
    fromArea = LOBBY;
    if (to.key === LOBBY.key) return [...pts, target];
  }
  if (fromArea.kind !== "corridor") pts.push(fromArea.doorIn, fromArea.doorOut);
  if (to.kind !== "corridor") pts.push(to.doorOut, to.doorIn);
  pts.push(target);
  return pts;
}
