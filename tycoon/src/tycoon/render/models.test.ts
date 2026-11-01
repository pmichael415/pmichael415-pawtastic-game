import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { FURNITURE, OUTDOOR } from "../catalog";
import type { Room, ThingKind } from "../types";

// jsdom has no 2D canvas; labels draw into a no-op context.
beforeAll(() => {
  const noop = new Proxy({}, { get: (_t, k) => (k === "measureText" ? () => ({ width: 10 }) : () => {}), set: () => true });
  HTMLCanvasElement.prototype.getContext = (() => noop) as unknown as HTMLCanvasElement["getContext"];
});

const { buildPath, buildRoom, buildThing, wallCount } = await import("./models");

const room = (over: Partial<Room> = {}): Room => ({ uid: "r1", c: 10, r: 16, w: 4, d: 3, type: "lobby", group: null, doors: [], floor: "wood", wall: "#F4EDE4", spent: 0, closed: false, ...over });
const working = { connected: true, working: true, reason: null };
const meshes = (g: THREE.Object3D) => {
  let n = 0;
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) n++;
  });
  return n;
};
const size = (g: THREE.Object3D) => new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());

describe("tycoon models", () => {
  it("every thing builds with at least one mesh at every level", () => {
    const kinds = [...FURNITURE.map((f) => f.id), ...OUTDOOR.map((o) => o.id)] as ThingKind[];
    for (const k of kinds)
      for (const lv of [1, 2, 3] as const) {
        const g = buildThing(k, lv);
        expect(g).toBeInstanceOf(THREE.Group);
        expect(meshes(g), `${k} L${lv}`).toBeGreaterThan(0);
      }
  });
  it("a level-3 play yard is bigger than a level-1 one", () => {
    const a = size(buildThing("play_yard", 1));
    const b = size(buildThing("play_yard", 3));
    expect(b.x * b.y * b.z).toBeGreaterThan(a.x * a.y * a.z);
  });
  it("things are centred on their footprint", () => {
    const box = new THREE.Box3().setFromObject(buildThing("front_counter", 1));
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(0, 1);
    expect((box.min.z + box.max.z) / 2).toBeCloseTo(0, 1);
    expect(box.max.x - box.min.x).toBeLessThanOrEqual(4.01); // 2 tiles of 2 units
  });
  it("a 4 × 3 room with one south door has 13 wall segments and a door frame", () => {
    const g = buildRoom(room({ doors: [{ side: "S", i: 1 }] }), working);
    expect(wallCount(g)).toEqual({ walls: 13, doors: 1 });
    let pick: unknown = null;
    g.traverse((o) => {
      if (o.userData["pick"]) pick = o.userData["pick"];
    });
    expect(pick).toEqual({ kind: "room", uid: "r1" });
  });
  it("neighbouring rooms don't double-draw a shared wall", () => {
    const drawn = new Set<string>();
    const a = buildRoom(room(), working, drawn);
    const b = buildRoom(room({ uid: "r2", c: 14, w: 3, type: "playroom", group: "small-gentle" }), working, drawn);
    expect(wallCount(a).walls).toBe(14);
    expect(wallCount(b).walls).toBe(12 - 3);
  });
  it("a door on either side of a shared wall leaves a gap", () => {
    const drawn = new Set<string>();
    const doors = new Set<string>(["v:14:17"]);
    const a = buildRoom(room(), working, drawn, doors);
    const b = buildRoom(room({ uid: "r2", c: 14, w: 3, doors: [{ side: "W", i: 1 }] }), working, drawn, doors);
    expect(wallCount(a)).toEqual({ walls: 13, doors: 1 });
    expect(wallCount(b)).toEqual({ walls: 9, doors: 0 });
  });
  it("a room that isn't working gets a reason badge", () => {
    const g = buildRoom(room(), { connected: false, working: false, reason: "Not connected" });
    expect(g.userData["badge"]).toBe("Not connected");
  });
  it("paths are flat tiles at their square", () => {
    const p = buildPath(18, 27);
    const box = new THREE.Box3().setFromObject(p);
    expect(box.max.y).toBeLessThan(0.1);
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(1);
  });
});
