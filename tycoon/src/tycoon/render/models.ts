// Low-poly models for the new Daycare Tycoon: rooms (Sims-style cutaway walls), furniture, outdoor items and paths.
// Built from the shared geometries and cached materials in src/world/models.ts. Pure presentation.
import * as THREE from "three";
import { GEO, makeSign, makeTag, mat, part } from "@/world/models";
import { GROUP_COLORS } from "@/world/layout";
import { groupName } from "@/game/engine";
import { ROOM_TYPE_NAMES, thingSize } from "../catalog";
import { TILE } from "../catalog";
import { roomOutline, tileCenter } from "../grid";
import type { RoomStatus } from "../connect";
import type { FloorStyle, Room, Side, ThingKind } from "../types";

export const WALL_H = 1.1;
const WALL_T = 0.16;
const FLOOR_COLORS: Record<FloorStyle, string> = { wood: "#d8b083", tile: "#e8eef3", rubber: "#9fcdb0", carpet: "#cbb8e2" };
const GREY = "#b9bfc7";

/** A canonical key for a wall edge: "v:c:r" is the west edge of tile (c, r); "h:c:r" is its north edge. */
export function edgeKey(c: number, r: number, side: Side): string {
  switch (side) {
    case "N":
      return `h:${c}:${r}`;
    case "S":
      return `h:${c}:${r + 1}`;
    case "W":
      return `v:${c}:${r}`;
    case "E":
      return `v:${c + 1}:${r}`;
  }
}
/** Edge keys of every door on these rooms. */
export function doorEdgeKeys(rooms: Room[]): Set<string> {
  const out = new Set<string>();
  for (const room of rooms)
    for (const d of room.doors) {
      const along = d.side === "N" || d.side === "S";
      const c = room.c + (along ? d.i : d.side === "E" ? room.w - 1 : 0);
      const r = room.r + (along ? (d.side === "S" ? room.d - 1 : 0) : d.i);
      out.add(edgeKey(c, r, d.side));
    }
  return out;
}

/** World centre of the edge on `side` of tile (c, r), and whether it runs along x. */
function edgeCenter(c: number, r: number, side: Side): { x: number; z: number; alongX: boolean } {
  const t = tileCenter(c, r);
  const h = TILE / 2;
  if (side === "N") return { x: t.x, z: t.z - h, alongX: true };
  if (side === "S") return { x: t.x, z: t.z + h, alongX: true };
  if (side === "W") return { x: t.x - h, z: t.z, alongX: false };
  return { x: t.x + h, z: t.z, alongX: false };
}

function blend(a: string, b: string, k: number) {
  return "#" + new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString();
}

/** Counts wall segments and door frames in a built room (for tests and QA). */
export function wallCount(g: THREE.Object3D): { walls: number; doors: number } {
  let walls = 0;
  let doors = 0;
  g.traverse((o) => {
    if (o.userData["wall"]) walls++;
    if (o.userData["doorFrame"]) doors++;
  });
  return { walls, doors };
}

/**
 * A room as a cutaway: floor in its style (playrooms get a stripe in their group colour), low walls in its colour,
 * door gaps with frames, a name tag, and a grey reason badge when it isn't working. Walls already in `drawnEdges`
 * (a neighbour drew them) are skipped; edges in `doorEdges` (a door from either room) become a frame.
 */
export function buildRoom(room: Room, status: RoomStatus, drawnEdges: Set<string> = new Set(), doorEdges: Set<string> = doorEdgeKeys([room])): THREE.Group {
  const g = new THREE.Group();
  g.userData["room"] = room.uid;
  const x0 = -36 + TILE * room.c;
  const z0 = -36 + TILE * room.r;
  const W = TILE * room.w;
  const D = TILE * room.d;
  const cx = x0 + W / 2;
  const cz = z0 + D / 2;
  const greyed = !status.working;
  const floorColor = greyed ? blend(FLOOR_COLORS[room.floor], GREY, 0.55) : FLOOR_COLORS[room.floor];
  const floor = part(GEO.box, floorColor, W - 0.04, 0.06, D - 0.04, cx, 0.03, cz);
  floor.userData["pick"] = { kind: "room", uid: room.uid };
  g.add(floor);
  if (room.type === "playroom" && room.group) {
    const accent = GROUP_COLORS[room.group].accent;
    g.add(part(GEO.box, greyed ? blend(accent, GREY, 0.5) : accent, W - 0.6, 0.02, 0.18, cx, 0.07, z0 + D - 0.45));
  }
  const wallColor = greyed ? blend(room.wall, GREY, 0.45) : room.wall;
  const trim = blend(room.wall, "#5a4a3a", 0.35);
  for (const seg of roomOutline(room)) {
    const key = edgeKey(seg.c, seg.r, seg.side);
    if (drawnEdges.has(key)) continue;
    drawnEdges.add(key);
    const e = edgeCenter(seg.c, seg.r, seg.side);
    const sx = e.alongX ? TILE + WALL_T : WALL_T;
    const sz = e.alongX ? WALL_T : TILE + WALL_T;
    if (doorEdges.has(key)) {
      const frame = new THREE.Group();
      frame.userData["doorFrame"] = true;
      const off = TILE / 2 - 0.12;
      const px = e.alongX ? off : 0;
      const pz = e.alongX ? 0 : off;
      frame.add(part(GEO.box, trim, 0.2, WALL_H + 0.25, 0.2, e.x - px, (WALL_H + 0.25) / 2, e.z - pz));
      frame.add(part(GEO.box, trim, 0.2, WALL_H + 0.25, 0.2, e.x + px, (WALL_H + 0.25) / 2, e.z + pz));
      frame.add(part(GEO.box, trim, e.alongX ? TILE : 0.2, 0.18, e.alongX ? 0.2 : TILE, e.x, WALL_H + 0.25, e.z));
      frame.add(part(GEO.box, "#c9b48f", e.alongX ? TILE - 0.3 : 0.5, 0.03, e.alongX ? 0.5 : TILE - 0.3, e.x, 0.05, e.z)); // threshold
      g.add(frame);
      continue;
    }
    const wall = part(GEO.box, wallColor, sx, WALL_H, sz, e.x, WALL_H / 2, e.z);
    wall.userData["wall"] = true;
    g.add(wall);
    g.add(part(GEO.box, trim, sx, 0.06, sz, e.x, WALL_H + 0.03, e.z)); // cap
  }
  const tag = makeTag(2.1);
  const title = room.type ? ROOM_TYPE_NAMES[room.type] : "New room";
  const sub = room.type === "playroom" && room.group ? groupName(room.group) : room.type ? "" : "Pick a type";
  tag.set(title, greyed ? status.reason ?? sub : sub, greyed ? "calm" : "default");
  tag.sprite.position.set(cx, WALL_H + 1.2, z0 + 0.6);
  g.add(tag.sprite);
  g.userData["dispose"] = () => tag.dispose();
  if (greyed && status.reason) {
    g.userData["badge"] = status.reason;
    g.add(part(GEO.cylLo, "#8e96a0", 0.5, 0.1, 0.5, cx, 0.12, cz));
  }
  return g;
}

/** A flat path tile at its square. */
export function buildPath(c: number, r: number): THREE.Group {
  const g = new THREE.Group();
  const t = tileCenter(c, r);
  g.add(part(GEO.box, "#e4d8c3", TILE - 0.06, 0.04, TILE - 0.06, t.x, 0.02, t.z));
  g.add(part(GEO.box, "#d3c4aa", TILE - 0.5, 0.02, 0.08, t.x, 0.045, t.z));
  return g;
}

// ---------- things ----------

type Make = (g: THREE.Group, W: number, D: number, level: 1 | 2 | 3) => void;
const add = (g: THREE.Group, ...m: THREE.Object3D[]) => m.forEach((x) => g.add(x));

const cushion = (g: THREE.Group, color: string, rim: string, s: number) => {
  add(g, part(GEO.cyl, rim, 1.5 * s, 0.28, 1.5 * s, 0, 0.14, 0), part(GEO.cyl, color, 1.2 * s, 0.3, 1.2 * s, 0, 0.18, 0));
};
const couch = (g: THREE.Group, W: number, color: string, leg: string) => {
  add(
    g,
    part(GEO.box, color, W - 0.4, 0.45, 1.1, 0, 0.42, 0.1),
    part(GEO.box, color, W - 0.4, 0.75, 0.3, 0, 0.6, -0.45),
    part(GEO.box, color, 0.3, 0.6, 1.1, -(W - 0.4) / 2, 0.5, 0.1),
    part(GEO.box, color, 0.3, 0.6, 1.1, (W - 0.4) / 2, 0.5, 0.1),
    part(GEO.box, leg, W - 0.5, 0.15, 1.0, 0, 0.1, 0.1),
  );
};
const tub = (g: THREE.Group, W: number, trim: string) => {
  add(
    g,
    part(GEO.box, "#ffffff", W - 0.5, 0.75, 1.3, 0, 0.38, 0),
    part(GEO.box, "#8fd3f4", W - 0.8, 0.06, 1.0, 0, 0.74, 0),
    part(GEO.box, trim, W - 0.45, 0.08, 1.35, 0, 0.78, 0),
    part(GEO.cylLo, "#c0c6cc", 0.1, 0.5, 0.1, (W - 0.8) / 2, 1.0, -0.5),
  );
};

const MAKERS: Record<ThingKind, Make> = {
  front_counter: (g, W) => add(g, part(GEO.box, "#7a5134", W - 0.3, 1.0, 1.1, 0, 0.5, 0), part(GEO.box, "#f2e6d0", W - 0.1, 0.08, 1.3, 0, 1.04, 0), part(GEO.box, "#0057A7", 0.5, 0.35, 0.05, 0.4, 0.75, 0.56), part(GEO.box, "#2a2f36", 0.5, 0.35, 0.05, -0.6, 1.25, -0.2)),
  bench: (g, W) => add(g, part(GEO.box, "#a8743f", W - 0.4, 0.12, 0.8, 0, 0.5, 0), part(GEO.box, "#a8743f", W - 0.4, 0.5, 0.1, 0, 0.8, -0.35), part(GEO.box, "#5d4126", 0.12, 0.45, 0.6, -(W - 0.7) / 2, 0.22, 0), part(GEO.box, "#5d4126", 0.12, 0.45, 0.6, (W - 0.7) / 2, 0.22, 0)),
  dog_bed: (g) => cushion(g, "#f5d4a8", "#c46b4a", 1),
  play_mat: (g, W, D) => add(g, part(GEO.box, "#ffcf4d", W - 0.3, 0.06, D - 0.3, 0, 0.04, 0), part(GEO.box, "#4cc3a0", (W - 0.3) / 2, 0.07, (D - 0.3) / 2, -(W - 0.3) / 4, 0.05, -(D - 0.3) / 4), part(GEO.box, "#e46a96", (W - 0.3) / 2, 0.07, (D - 0.3) / 2, (W - 0.3) / 4, 0.05, (D - 0.3) / 4)),
  water_bowl: (g) => add(g, part(GEO.cyl, "#5aa0d8", 0.7, 0.2, 0.7, 0, 0.1, 0), part(GEO.cyl, "#bfe6ff", 0.55, 0.05, 0.55, 0, 0.21, 0)),
  rug: (g, W, D) => add(g, part(GEO.cyl, "#c95b5b", W * 0.85, 0.03, D * 0.6, 0, 0.02, 0), part(GEO.cyl, "#f0d9a8", W * 0.6, 0.035, D * 0.4, 0, 0.025, 0)),
  plant: (g) => add(g, part(GEO.cylLo, "#c4703f", 0.55, 0.5, 0.55, 0, 0.25, 0), part(GEO.sphereLo, "#4f9e48", 0.9, 1.0, 0.9, 0, 0.95, 0), part(GEO.sphereLo, "#62b55a", 0.6, 0.6, 0.6, 0.2, 1.35, 0.1)),
  toy_bin: (g) => add(g, part(GEO.box, "#3a86d1", 1.1, 0.6, 0.9, 0, 0.3, 0), part(GEO.sphereLo, "#ffd34d", 0.3, 0.3, 0.3, -0.2, 0.68, 0), part(GEO.sphereLo, "#e4433a", 0.28, 0.28, 0.28, 0.2, 0.66, 0.1), part(GEO.torus, "#4cc3a0", 0.5, 0.5, 0.5, 0.1, 0.7, -0.15)),
  bath_tub: (g, W) => tub(g, W, "#9fb8c8"),
  boarding_bed: (g) => add(g, part(GEO.box, "#8a5a33", 1.5, 0.3, 1.6, 0, 0.15, 0), part(GEO.box, "#cfe1f5", 1.3, 0.2, 1.4, 0, 0.38, 0.05), part(GEO.box, "#ffffff", 0.9, 0.18, 0.4, 0, 0.55, -0.5), part(GEO.box, "#8a5a33", 1.5, 0.6, 0.12, 0, 0.45, -0.75)),
  couch: (g, W) => couch(g, W, "#5b7fb8", "#3b4d6b"),
  hurdles: (g, W) => {
    for (const x of [-(W - 0.8) / 2, (W - 0.8) / 2]) add(g, part(GEO.cylLo, "#ffffff", 0.08, 0.8, 0.08, x, 0.4, -0.5), part(GEO.cylLo, "#ffffff", 0.08, 0.8, 0.08, x, 0.4, 0.5), part(GEO.box, "#e4433a", 0.06, 0.08, 1.0, x, 0.6, 0));
    add(g, part(GEO.box, "#ffd34d", W - 0.6, 0.06, 0.12, 0, 0.35, 0));
  },
  deluxe_bed: (g) => {
    cushion(g, "#fff1c4", "#c9a227", 1.05);
    add(g, part(GEO.torus, "#c9a227", 1.3, 1.3, 1.3, 0, 0.3, 0));
  },
  staff_couch: (g, W) => couch(g, W, "#4cae7d", "#2d6b4c"),
  deluxe_tub: (g, W) => {
    tub(g, W, "#c9a227");
    add(g, part(GEO.sphereLo, "#ffffff", 0.35, 0.25, 0.35, -0.3, 0.85, 0.1), part(GEO.sphereLo, "#ffffff", 0.25, 0.2, 0.25, 0.1, 0.84, -0.1));
  },
  play_yard: (g, W, D, lv) => {
    add(g, part(GEO.box, "#7cc46a", W - 0.2, 0.05, D - 0.2, 0, 0.03, 0));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) add(g, part(GEO.cylLo, "#ffffff", 0.08, 0.6, 0.08, x * (W / 2 - 0.2), 0.3, z * (D / 2 - 0.2)));
    add(g, part(GEO.sphereLo, "#ffd34d", 0.3, 0.3, 0.3, 0.6, 0.18, 0.4));
    if (lv >= 2) add(g, part(GEO.box, "#e46a96", 0.9, 0.9, 0.9, -0.8, 0.45, -0.8), part(GEO.box, "#4cc3a0", 0.4, 0.06, 1.6, -0.8, 0.5, 0.2));
    if (lv >= 3) add(g, part(GEO.cylLo, "#8a5a33", 0.12, 2.2, 0.12, 1.4, 1.1, -1.4), part(GEO.box, "#0057A7", 0.7, 0.45, 0.04, 1.75, 1.95, -1.4), part(GEO.box, "#ffd34d", 0.8, 0.9, 0.8, 0.9, 0.45, -0.9));
  },
  ball_pit: (g, W, D, lv) => {
    add(g, part(GEO.box, "#3a86d1", W - 0.3, 0.5, D - 0.3, 0, 0.25, 0));
    const colors = ["#e4433a", "#ffd34d", "#4cc3a0", "#e46a96"];
    const n = 6 + lv * 4;
    for (let i = 0; i < n; i++) add(g, part(GEO.sphereLo, colors[i % 4]!, 0.32, 0.32, 0.32, Math.cos(i * 2.4) * (W / 2 - 0.6) * ((i % 3) / 3 + 0.3), 0.55 + (i % 2) * 0.1, Math.sin(i * 2.4) * (D / 2 - 0.6) * ((i % 4) / 4 + 0.3)));
    if (lv >= 3) add(g, part(GEO.box, "#ffffff", 0.2, 1.4, 0.2, W / 2 - 0.3, 0.7, -(D / 2 - 0.3)), part(GEO.box, "#e46a96", 0.25, 0.06, 1.8, W / 2 - 0.5, 0.9, 0));
  },
  splash_pool: (g, W, D, lv) => {
    add(g, part(GEO.cyl, "#5ec2f0", W - 0.3 + lv * 0.1, 0.35, D - 0.3 + lv * 0.1, 0, 0.17, 0), part(GEO.cyl, "#bfeaff", W - 0.7, 0.37, D - 0.7, 0, 0.19, 0));
    if (lv >= 2) add(g, part(GEO.cylLo, "#ffffff", 0.1, 1.0 + lv * 0.2, 0.1, 0, 0.5 + lv * 0.1, 0), part(GEO.sphereLo, "#9fe6ff", 0.6, 0.3, 0.6, 0, 1.2 + lv * 0.2, 0));
  },
  agility: (g, W, D, lv) => {
    add(g, part(GEO.box, "#c9e7b8", W - 0.2, 0.04, D - 0.2, 0, 0.02, 0));
    const ramp = part(GEO.box, "#e0a100", 1.6, 0.1, 0.9, -1.4, 0.4, 0);
    ramp.rotation.z = 0.45;
    add(g, ramp);
    for (let i = 0; i < 3 + lv; i++) add(g, part(GEO.cylLo, i % 2 ? "#ffffff" : "#e4433a", 0.08, 0.9, 0.08, 0.2 + i * 0.45, 0.45, (i % 2 ? 0.3 : -0.3)));
    if (lv >= 2) add(g, part(GEO.torus, "#0057A7", 0.9, 0.9, 0.9, 1.9, 0.8, 0));
    if (lv >= 3) add(g, part(GEO.box, "#e46a96", 1.0, 1.0, 1.0, 1.9, 0.5, -0.9));
  },
  water: (g, _W, _D, lv) => add(g, part(GEO.cylLo, "#8fa3b5", 0.35, 0.9 + lv * 0.1, 0.35, 0, 0.45, 0), part(GEO.cyl, "#5aa0d8", 0.9 + lv * 0.1, 0.18, 0.9 + lv * 0.1, 0, 0.12, 0.25), part(GEO.cyl, "#bfe6ff", 0.7, 0.05, 0.7, 0, 0.22, 0.25)),
  shade_tree: (g, _W, _D, lv) => add(g, part(GEO.cylLo, "#8a5a33", 0.3, 1.2 + lv * 0.3, 0.3, 0, 0.6 + lv * 0.15, 0), part(GEO.sphereLo, "#5fb35a", 1.4 + lv * 0.3, 1.3 + lv * 0.3, 1.4 + lv * 0.3, 0, 1.6 + lv * 0.4, 0)),
  nap_cabana: (g, W, D, lv) => {
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) add(g, part(GEO.cylLo, "#f5f1e6", 0.1, 1.6, 0.1, x * (W / 2 - 0.3), 0.8, z * (D / 2 - 0.3)));
    add(g, part(GEO.box, lv >= 3 ? "#e46a96" : lv === 2 ? "#4cc3a0" : "#ffd34d", W - 0.2, 0.15, D - 0.2, 0, 1.65, 0), part(GEO.box, "#f5d4a8", W - 0.8, 0.25, D - 0.7, 0, 0.15, 0));
  },
  park_bench: (g) => add(g, part(GEO.box, "#a8743f", 1.5, 0.1, 0.6, 0, 0.45, 0), part(GEO.box, "#a8743f", 1.5, 0.4, 0.08, 0, 0.7, -0.28), part(GEO.box, "#3b3f45", 0.1, 0.45, 0.5, -0.6, 0.22, 0), part(GEO.box, "#3b3f45", 0.1, 0.45, 0.5, 0.6, 0.22, 0)),
  flowers: (g) => {
    add(g, part(GEO.box, "#8a5a33", 1.5, 0.25, 1.5, 0, 0.12, 0));
    const c = ["#e4433a", "#ffd34d", "#e46a96", "#ffffff"];
    for (let i = 0; i < 6; i++) add(g, part(GEO.sphereLo, c[i % 4]!, 0.3, 0.3, 0.3, Math.cos(i) * 0.45, 0.4, Math.sin(i * 1.7) * 0.45));
  },
  lights: (g) => {
    add(g, part(GEO.cylLo, "#3b3f45", 0.08, 2.0, 0.08, 0, 1.0, 0));
    for (let i = 0; i < 4; i++) add(g, part(GEO.sphereLo, ["#ffd34d", "#e46a96", "#4cc3a0", "#9fe6ff"][i]!, 0.18, 0.22, 0.18, -0.6 + i * 0.4, 1.85 - Math.abs(i - 1.5) * 0.12, 0, { emissive: "#553300" }));
  },
  fountain: (g, W, D) => add(g, part(GEO.cyl, "#c8ccd2", W - 0.4, 0.45, D - 0.4, 0, 0.22, 0), part(GEO.cyl, "#7fd0f5", W - 0.8, 0.47, D - 0.8, 0, 0.24, 0), part(GEO.cylLo, "#c8ccd2", 0.4, 1.2, 0.4, 0, 0.8, 0), part(GEO.cyl, "#c8ccd2", 1.2, 0.2, 1.2, 0, 1.4, 0), part(GEO.sphereLo, "#bfeaff", 0.5, 0.6, 0.5, 0, 1.7, 0)),
  fence: (g, W) => add(g, part(GEO.box, "#f5f1e6", 0.12, 0.8, 0.12, -(W / 2 - 0.1), 0.4, 0), part(GEO.box, "#f5f1e6", 0.12, 0.8, 0.12, W / 2 - 0.1, 0.4, 0), part(GEO.box, "#f5f1e6", W, 0.1, 0.06, 0, 0.6, 0), part(GEO.box, "#f5f1e6", W, 0.1, 0.06, 0, 0.3, 0)),
  path: (g, W, D) => add(g, part(GEO.box, "#e4d8c3", W - 0.06, 0.04, D - 0.06, 0, 0.02, 0)),
  sign: (g, W) => {
    add(g, part(GEO.box, "#3b3f45", 0.12, 1.6, 0.12, -(W / 2 - 0.4), 0.8, 0), part(GEO.box, "#3b3f45", 0.12, 1.6, 0.12, W / 2 - 0.4, 0.8, 0));
    const s = makeSign(W - 0.4, 0.9);
    s.draw({ title: "PAWtastic Academy", sub: "Dog daycare (game)", badge: "🐾", color: "#ffd34d" });
    s.mesh.position.set(0, 1.35, 0.08);
    g.add(s.mesh);
  },
};

/** One placed thing, centred on its (unrotated) footprint of w × d tiles. The caller sets position, rotation and pick. */
export function buildThing(kind: ThingKind, level: 1 | 2 | 3): THREE.Group {
  const g = new THREE.Group();
  const { w, d } = thingSize(kind);
  (MAKERS[kind] ?? MAKERS.path)(g, TILE * w, TILE * d, level);
  g.userData["kind"] = kind;
  return g;
}

/** Ghost material for previews: green when it fits, red when it doesn't. */
export function ghostMaterial(ok: boolean) {
  return mat(ok ? "#3ccf7a" : "#e4433a", { opacity: 0.45 });
}
