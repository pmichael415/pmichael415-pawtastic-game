// The new Daycare Tycoon in 3D. It never owns rules or state: every snapshot is drawn from the same TycoonState the
// list view uses, and taps are reported back as picks (a dog, a room, a thing, a tile or a wall edge).
import * as THREE from "three";
import { swallowNextClick } from "@/lib/ghostClick";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { buildDog, buildPerson, coatFor, makeEmojiSprite, makeSign, makeTag, mat, part, GEO, type DogRig, type PersonRig, type Tag } from "@/world/models";
import { COLS, ENTRANCE, PARCELS, ROWS, TILE } from "../catalog";
import { connectedRooms, roomStatus } from "../connect";
import { containsTile, roomTiles, thingTiles, tileAtWorld, tileCenter } from "../grid";
import { fac } from "../state";
import { inActiveScuffle } from "../run";
import { isActive, ownedPaid } from "../paid";
import type { Door, Facility, Rot, Side, TDog, ThingKind, TycoonState } from "../types";
import { buildPath, buildRoom, buildThing, doorEdgeKeys, ghostMaterial, WALL_H } from "./models";

export type TPick =
  | { kind: "tile"; c: number; r: number }
  | { kind: "edge"; c: number; r: number; side: Side }
  | { kind: "room"; uid: string }
  | { kind: "thing"; uid: string }
  | { kind: "dog"; id: string };
export type Ghost =
  | { kind: "room"; c: number; r: number; w: number; d: number; ok: boolean; label: string }
  | { kind: "door"; room: string; door: Door; ok: boolean }
  | { kind: "thing"; thing: ThingKind; c: number; r: number; rot: Rot; ok: boolean }
  | { kind: "paths"; tiles: { c: number; r: number }[]; ok: boolean };
export type WorldLooks = { bandana?: string; deluxe?: boolean };
/** objects: dogs, things, rooms, then tiles (no tool); tiles: ground squares only; edges: wall edges (door tool). */
export type PickMode = "objects" | "tiles" | "edges";
export type TycoonSnapshot = { state: TycoonState; selected: string | null; ghost: Ghost | null; overlay: boolean; looks: WorldLooks; pickMode?: PickMode };
export type TycoonWorldOptions = { onPick(p: TPick | null): void; reducedMotion: boolean; lowPower: boolean };
export type FxKind = "drop" | "sparkle" | "coins" | "confetti" | "puff";

const PITCH = (56 * Math.PI) / 180;
const SMALL = 0.75;
const LARGE = 1.12;
const EDGE_PICK = 0.35;
const LOT = { x0: -36, x1: -36 + TILE * COLS, z0: -36, z1: -36 + TILE * ROWS };

type DogActor = { id: string; rig: DogRig; tag: Tag; pos: { x: number; z: number }; to: { x: number; z: number }; heading: number; phase: number; size: number; important?: boolean };
type StaffActor = { rig: PersonRig; pos: { x: number; z: number }; to: { x: number; z: number } };
type Fx = { sprite: THREE.Sprite; born: number; life: number; from: THREE.Vector3; rise: number; drift: number };

/**
 * Merges every mesh under `parts` into one mesh per material inside `target` (a few draw calls instead of hundreds).
 * Sprites (name tags) are kept as they are, and the parts' dispose hooks move to the target.
 */
function bake(parts: THREE.Object3D[], target: THREE.Group) {
  const holder = new THREE.Group();
  for (const p of parts) holder.add(p);
  holder.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const sprites: THREE.Object3D[] = [];
  const disposers: (() => void)[] = [];
  holder.traverse((o) => {
    const d = o.userData["dispose"] as (() => void) | undefined;
    if (d) disposers.push(d);
    if ((o as THREE.Sprite).isSprite) return void sprites.push(o);
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    const list = buckets.get(m.material as THREE.Material) ?? [];
    list.push(g);
    buckets.set(m.material as THREE.Material, list);
  });
  for (const [material, geos] of buckets) {
    const merged = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.userData["dispose"] = () => merged.dispose();
    target.add(mesh);
  }
  for (const sp of sprites) {
    const at = new THREE.Vector3();
    sp.getWorldPosition(at);
    sp.removeFromParent();
    sp.position.copy(at);
    target.add(sp);
  }
  const keeper = new THREE.Object3D();
  keeper.userData["dispose"] = () => disposers.forEach((d) => d());
  target.add(keeper);
}

const clear = (g: THREE.Group) => {
  g.traverse((o) => (o.userData["dispose"] as (() => void) | undefined)?.());
  delete g.userData["dispose"];
  while (g.children.length) g.remove(g.children[0]!);
};
/** A canvas sign whose texture and material go away with it. */
function disposableSign(w: number, h: number) {
  const sign = makeSign(w, h);
  sign.mesh.userData["dispose"] = () => {
    sign.material.map?.dispose();
    sign.material.dispose();
  };
  return sign;
}

/** Where a thing's footprint centre is in the world. */
function thingCenter(kind: ThingKind, c: number, r: number, rot: Rot) {
  const t = thingTiles({ kind, c, r, rot });
  const xs = t.map((x) => tileCenter(x.c, x.r).x);
  const zs = t.map((x) => tileCenter(x.c, x.r).z);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 };
}

export class TycoonWorld {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);
  private canvas: HTMLCanvasElement;
  private opts: TycoonWorldOptions;
  private snap: TycoonSnapshot | null = null;
  private rooms = new THREE.Group();
  private things = new THREE.Group();
  private paths = new THREE.Group();
  private overlay = new THREE.Group();
  private ghost = new THREE.Group();
  private fxGroup = new THREE.Group();
  private keys = { rooms: "", things: "", paths: "", overlay: "", ghost: "" };
  private entranceSign: THREE.Object3D | null = null;
  private dogs = new Map<string, DogActor>();
  private staff = new Map<string, StaffActor>();
  private effects: Fx[] = [];
  private ring: THREE.Mesh;
  private raf = 0;
  private last = 0;
  private t = 0;
  private visible = true;
  private disposed = false;
  private io: IntersectionObserver | null = null;
  private ro: ResizeObserver | null = null;
  private target = new THREE.Vector3(0, 0, 8);
  private distance = 34;
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  private pinch0 = 0;
  private dist0 = 0;
  private ray = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  frameMs = 16;

  constructor(canvas: HTMLCanvasElement, opts: TycoonWorldOptions) {
    this.canvas = canvas;
    this.opts = opts;
    // Phones draw every pixel 2–3 times over at full device ratio; 1.5 looks the same at this zoom and keeps 30 fps.
    const dpr = Math.min(window.devicePixelRatio || 1, opts.lowPower ? 1 : 1.5);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 1.5, powerPreference: "high-performance", alpha: false });
    this.renderer.setPixelRatio(dpr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color("#cfe6ff");
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#9fb4cc", 1.35));
    const sun = new THREE.DirectionalLight("#ffffff", 1.35);
    sun.position.set(14, 30, 18);
    this.scene.add(sun);
    this.scene.add(this.overlay, this.paths, this.rooms, this.things, this.ghost, this.fxGroup);
    this.ring = new THREE.Mesh(GEO.ring, new THREE.MeshBasicMaterial({ color: "#ffd34d", side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.09;
    this.ring.visible = false;
    this.scene.add(this.ring);
    this.buildStatic();
    this.bindInput();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.io = new IntersectionObserver((e) => {
      this.visible = e.some((x) => x.isIntersecting);
    });
    this.io.observe(canvas);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ---------- public API ----------
  setSnapshot(s: TycoonSnapshot) {
    this.snap = s;
    const f = fac(s.state);
    this.syncRooms(f);
    this.syncThings(f);
    this.syncPaths(f);
    this.syncOverlay(f, s.overlay);
    this.syncGhost(s.ghost);
    this.syncDogs(f, s.selected);
    this.syncStaff(f);
    this.syncRing(f, s.selected);
  }

  /** Frames the owned land. */
  resetCamera() {
    const f = this.snap ? fac(this.snap.state) : null;
    const owned = PARCELS.filter((p) => !f || f.land.includes(p.id));
    const x0 = -36 + TILE * Math.min(...owned.map((p) => p.c0));
    const x1 = -36 + TILE * Math.max(...owned.map((p) => p.c1));
    const z0 = -36 + TILE * Math.min(...owned.map((p) => p.r0));
    const z1 = -36 + TILE * Math.max(...owned.map((p) => p.r1));
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    this.target.set((x0 + x1) / 2, 0, (z0 + z1) / 2 + 1.5);
    const span = Math.max(z1 - z0, (x1 - x0) / Math.max(0.5, aspect));
    this.distance = THREE.MathUtils.clamp(span * 1.25, 9, 60);
  }

  zoom(factor: number) {
    this.distance = THREE.MathUtils.clamp(this.distance * factor, 9, 60);
  }

  /** Short-lived effects. Reduced motion skips them (the change itself still shows). */
  fx(kind: FxKind, at: { c: number; r: number } | "hud") {
    if (this.opts.reducedMotion) return;
    const base = at === "hud" ? this.target.clone().add(new THREE.Vector3(0, 3, 0)) : (() => {
      const t = tileCenter(at.c, at.r);
      return new THREE.Vector3(t.x, 1.2, t.z);
    })();
    const spec: Record<FxKind, { emoji: string[]; n: number; life: number; rise: number; spread: number }> = {
      drop: { emoji: ["✨"], n: 3, life: 700, rise: 1.2, spread: 0.8 },
      sparkle: { emoji: ["✨", "⭐"], n: 5, life: 900, rise: 1.6, spread: 1.2 },
      coins: { emoji: ["🪙"], n: 5, life: 1000, rise: 2.4, spread: 0.9 },
      confetti: { emoji: ["🎉", "🎊", "✨", "⭐"], n: 16, life: 1600, rise: 3.5, spread: 5 },
      puff: { emoji: ["💨"], n: 3, life: 700, rise: 0.8, spread: 1 },
    };
    const sp = spec[kind];
    for (let i = 0; i < sp.n; i++) {
      const sprite = makeEmojiSprite(sp.emoji[i % sp.emoji.length]!, kind === "confetti" ? 0.9 : 0.7);
      const from = base.clone().add(new THREE.Vector3((Math.random() - 0.5) * sp.spread, 0, (Math.random() - 0.5) * sp.spread));
      sprite.position.copy(from);
      this.fxGroup.add(sprite);
      this.effects.push({ sprite, born: performance.now() + i * 40, life: sp.life, from, rise: sp.rise * (0.7 + Math.random() * 0.6), drift: (Math.random() - 0.5) * 0.8 });
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.io?.disconnect();
    this.ro?.disconnect();
    this.unbindInput();
    for (const d of this.dogs.values()) d.tag.dispose();
    for (const g of [this.rooms, this.overlay, this.things, this.paths, this.ghost]) clear(g);
    for (const f of this.effects) {
      (f.sprite.material as THREE.SpriteMaterial).map?.dispose();
      f.sprite.material.dispose();
    }
    this.effects = [];
    (this.entranceSign?.userData["dispose"] as (() => void) | undefined)?.();
    this.renderer.dispose();
  }

  // ---------- the static scene ----------
  private buildStatic() {
    const grass = part(GEO.plane, "#a9d98d", 200, 200, 1, 0, -0.03, -8);
    grass.rotation.x = -Math.PI / 2;
    this.scene.add(grass);
    const lot = part(GEO.plane, "#b7e09c", LOT.x1 - LOT.x0, LOT.z1 - LOT.z0, 1, (LOT.x0 + LOT.x1) / 2, -0.02, (LOT.z0 + LOT.z1) / 2);
    lot.rotation.x = -Math.PI / 2;
    this.scene.add(lot);
    const walk = part(GEO.plane, "#e6e2da", 90, 2.4, 1, 0, -0.015, LOT.z1 + 1.2);
    walk.rotation.x = -Math.PI / 2;
    this.scene.add(walk);
    const road = part(GEO.plane, "#5d6673", 120, 6, 1, 0, -0.012, LOT.z1 + 5.4);
    road.rotation.x = -Math.PI / 2;
    this.scene.add(road);
    for (let x = -56; x <= 56; x += 5) {
      const stripe = part(GEO.plane, "#f5f1e6", 2, 0.22, 1, x, -0.008, LOT.z1 + 5.4);
      stripe.rotation.x = -Math.PI / 2;
      this.scene.add(stripe);
    }
    // the entrance gate on the road side
    const e = tileCenter(ENTRANCE.c, ENTRANCE.r);
    const z = LOT.z1 - 0.2;
    this.scene.add(part(GEO.box, "#0057A7", 0.35, 2.6, 0.35, e.x - 1.4, 1.3, z), part(GEO.box, "#0057A7", 0.35, 2.6, 0.35, e.x + 1.4, 1.3, z), part(GEO.box, "#0057A7", 3.3, 0.35, 0.4, e.x, 2.7, z));
    const sign = disposableSign(3.2, 0.8);
    sign.draw({ title: "Entrance", sub: "Your daycare", badge: "🐾", color: "#ffd34d" });
    sign.mesh.position.set(e.x, 3.3, z);
    this.scene.add(sign.mesh);
    this.entranceSign = sign.mesh;
    // trees outside the lot for scale
    for (const [x, tz] of [[-42, 10], [42, 12], [-44, -12], [43, -20], [-41, -30], [40, -34], [-20, -40], [18, -41]] as const) {
      this.scene.add(part(GEO.cylLo, "#8a5a33", 0.4, 1.8, 0.4, x, 0.9, tz), part(GEO.sphereLo, "#5fb35a", 3, 2.7, 3, x, 2.7, tz));
    }
  }

  // ---------- dynamic groups (rebuilt only when their key changes) ----------
  private syncRooms(f: Facility) {
    // Statuses depend on rooms, items and owned packs; only recompute (and rebuild) when those change.
    const key = JSON.stringify([f.rooms, f.items.map((i) => [i.uid, i.kind, i.c, i.r, i.rot, i.closed]), [...ownedPaid()]]);
    if (key === this.keys.rooms) return;
    this.keys.rooms = key;
    const connected = connectedRooms(f);
    const statuses = f.rooms.map((r) => roomStatus(f, r, connected));
    clear(this.rooms);
    const drawn = new Set<string>();
    const doors = doorEdgeKeys(f.rooms);
    bake(f.rooms.map((room, i) => buildRoom(room, statuses[i]!, drawn, doors)), this.rooms);
  }

  private syncThings(f: Facility) {
    const items = f.items.filter((i) => i.kind !== "path");
    const key = JSON.stringify(items.map((i) => [i.uid, i.kind, i.c, i.r, i.rot, i.level, i.closed, isActive(i.kind)]));
    if (key === this.keys.things) return;
    this.keys.things = key;
    clear(this.things);
    const parts: THREE.Object3D[] = [];
    for (const it of items) {
      const g = buildThing(it.kind, it.level);
      const at = thingCenter(it.kind, it.c, it.r, it.rot);
      g.position.set(at.x, it.room ? 0.06 : 0, at.z);
      g.rotation.y = -it.rot * (Math.PI / 2);
      const inactive = !isActive(it.kind);
      if (it.closed || inactive) g.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).material = inactive ? mat("#a7adb5", { opacity: 0.7 }) : ghostMaterial(false)) : null));
      if (inactive) {
        const tag = makeTag(2.2);
        tag.set("Pack no longer active", "", "calm");
        tag.sprite.position.set(0, 2, 0);
        g.add(tag.sprite);
        g.userData["dispose"] = () => tag.dispose();
      }
      parts.push(g);
    }
    bake(parts, this.things);
  }

  private syncPaths(f: Facility) {
    const paths = f.items.filter((i) => i.kind === "path");
    const key = JSON.stringify(paths.map((p) => [p.uid, p.c, p.r]));
    if (key === this.keys.paths) return;
    this.keys.paths = key;
    clear(this.paths);
    bake(paths.map((p) => buildPath(p.c, p.r)), this.paths);
  }

  private syncOverlay(f: Facility, on: boolean) {
    const key = JSON.stringify([on, f.land]);
    if (key === this.keys.overlay) return;
    this.keys.overlay = key;
    clear(this.overlay);
    for (const p of PARCELS) {
      const owned = f.land.includes(p.id);
      const x0 = -36 + TILE * p.c0;
      const z0 = -36 + TILE * p.r0;
      const W = TILE * (p.c1 - p.c0);
      const D = TILE * (p.r1 - p.r0);
      if (!owned) {
        const g = part(GEO.plane, "#8f9aa5", W - 0.2, D - 0.2, 1, x0 + W / 2, 0.005, z0 + D / 2, { opacity: on ? 0.55 : 0.28 });
        g.rotation.x = -Math.PI / 2;
        this.overlay.add(g);
        if (on) {
          const sign = disposableSign(4.2, 1.3);
          sign.draw({ title: `${p.name} · for sale`, sub: `Level ${p.level}`, badge: `${p.price / 1000}k`, color: "#ffd34d" });
          sign.mesh.position.set(x0 + W / 2, 1.6, z0 + D / 2);
          this.overlay.add(sign.mesh, part(GEO.cylLo, "#3b3f45", 0.12, 1.2, 0.12, x0 + W / 2, 0.6, z0 + D / 2 - 0.05));
        }
      } else if (on) {
        const g = part(GEO.plane, "#bff0b0", W - 0.1, D - 0.1, 1, x0 + W / 2, 0.006, z0 + D / 2, { opacity: 0.4 });
        g.rotation.x = -Math.PI / 2;
        this.overlay.add(g);
        // tile grid lines
        const pts: number[] = [];
        for (let c = p.c0; c <= p.c1; c++) pts.push(-36 + TILE * c, 0.01, z0, -36 + TILE * c, 0.01, z0 + D);
        for (let r = p.r0; r <= p.r1; r++) pts.push(x0, 0.01, -36 + TILE * r, x0 + W, 0.01, -36 + TILE * r);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
        const lineMat = new THREE.LineBasicMaterial({ color: "#5c8f4e", transparent: true, opacity: 0.35 });
        const lines = new THREE.LineSegments(geo, lineMat);
        lines.userData["dispose"] = () => {
          geo.dispose();
          lineMat.dispose();
        };
        this.overlay.add(lines);
      }
    }
  }

  private syncGhost(gh: Ghost | null) {
    const key = JSON.stringify(gh);
    if (key === this.keys.ghost) return;
    this.keys.ghost = key;
    clear(this.ghost);
    if (!gh) return;
    const m = ghostMaterial(gh.ok);
    if (gh.kind === "room") {
      const x0 = -36 + TILE * gh.c;
      const z0 = -36 + TILE * gh.r;
      const W = TILE * gh.w;
      const D = TILE * gh.d;
      const floor = new THREE.Mesh(GEO.box, m);
      floor.scale.set(W, 0.08, D);
      floor.position.set(x0 + W / 2, 0.05, z0 + D / 2);
      this.ghost.add(floor);
      for (const [cx, cz, sx, sz] of [[x0 + W / 2, z0, W, 0.16], [x0 + W / 2, z0 + D, W, 0.16], [x0, z0 + D / 2, 0.16, D], [x0 + W, z0 + D / 2, 0.16, D]] as const) {
        const w = new THREE.Mesh(GEO.box, m);
        w.scale.set(sx, WALL_H, sz);
        w.position.set(cx, WALL_H / 2, cz);
        this.ghost.add(w);
      }
      const tag = makeTag(2.4);
      tag.set(gh.label, "", gh.ok ? "default" : "alert");
      tag.sprite.position.set(x0 + W / 2, WALL_H + 1.4, z0 + D / 2);
      this.ghost.add(tag.sprite);
      this.ghost.userData["dispose"] = () => tag.dispose();
      return;
    }
    if (gh.kind === "paths") {
      for (const t of gh.tiles) {
        const at = tileCenter(t.c, t.r);
        const tile = new THREE.Mesh(GEO.box, m);
        tile.scale.set(TILE - 0.1, 0.08, TILE - 0.1);
        tile.position.set(at.x, 0.06, at.z);
        this.ghost.add(tile);
      }
      return;
    }
    if (gh.kind === "door") {
      const room = this.snap ? fac(this.snap.state).rooms.find((r) => r.uid === gh.room) : null;
      if (!room) return;
      const along = gh.door.side === "N" || gh.door.side === "S";
      const c = room.c + (along ? gh.door.i : gh.door.side === "E" ? room.w - 1 : 0);
      const r = room.r + (along ? (gh.door.side === "S" ? room.d - 1 : 0) : gh.door.i);
      const t = tileCenter(c, r);
      const h = TILE / 2;
      const x = t.x + (gh.door.side === "E" ? h : gh.door.side === "W" ? -h : 0);
      const z = t.z + (gh.door.side === "S" ? h : gh.door.side === "N" ? -h : 0);
      const door = new THREE.Mesh(GEO.box, m);
      door.scale.set(along ? TILE : 0.3, WALL_H + 0.4, along ? 0.3 : TILE);
      door.position.set(x, (WALL_H + 0.4) / 2, z);
      this.ghost.add(door);
      return;
    }
    const g = buildThing(gh.thing, 1);
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = m;
    });
    const at = thingCenter(gh.thing, gh.c, gh.r, gh.rot);
    g.position.set(at.x, 0.08, at.z);
    g.rotation.y = -gh.rot * (Math.PI / 2);
    this.ghost.add(g);
  }

  // ---------- dogs and staff ----------
  /** Where each pup stands: spread over its room's squares, its bed, or the lobby (by the entrance if none). */
  private slots(f: Facility): Map<string, { x: number; z: number }> {
    const out = new Map<string, { x: number; z: number }>();
    const lobby = f.rooms.find((r) => r.type === "lobby") ?? null;
    const groups = new Map<string, TDog[]>();
    for (const d of f.dogs) {
      const k = d.place.kind === "lobby" ? "lobby" : d.place.kind === "bed" ? `bed:${d.place.bed}` : `room:${d.place.room}`;
      groups.set(k, [...(groups.get(k) ?? []), d]);
    }
    for (const [k, dogs] of groups) {
      if (k.startsWith("bed:")) {
        const bed = f.items.find((i) => i.uid === k.slice(4));
        const at = bed ? thingCenter(bed.kind, bed.c, bed.r, bed.rot) : tileCenter(ENTRANCE.c, ENTRANCE.r);
        for (const d of dogs) out.set(d.id, { x: at.x, z: at.z });
        continue;
      }
      const room = k === "lobby" ? lobby : f.rooms.find((r) => r.uid === k.slice(5)) ?? null;
      const tiles = room ? roomTiles(room) : [{ c: ENTRANCE.c, r: ENTRANCE.r - 1 }];
      dogs.forEach((d, i) => {
        const t = tiles[(i * 7 + 3) % tiles.length]!;
        const ctr = tileCenter(t.c, t.r);
        const lap = Math.floor((i * 7 + 3) / tiles.length);
        out.set(d.id, { x: ctr.x + (lap % 2 ? 0.45 : -0.2), z: ctr.z + (lap % 3) * 0.35 - 0.2 });
      });
    }
    return out;
  }

  private syncDogs(f: Facility, selected: string | null) {
    const slots = this.slots(f);
    const seen = new Set<string>();
    for (const d of f.dogs) {
      seen.add(d.id);
      let a = this.dogs.get(d.id);
      const to = slots.get(d.id)!;
      if (!a) {
        const size = d.size === "small" ? SMALL : LARGE;
        const rig = buildDog(coatFor(d.breed), size);
        const tag = makeTag(1.5);
        rig.root.add(tag.sprite);
        tag.sprite.position.set(0, 1.5 * size + 0.3, 0);
        const start = d.place.kind === "lobby" ? tileCenter(ENTRANCE.c, ENTRANCE.r) : to;
        rig.root.position.set(start.x, 0.06, start.z);
        this.scene.add(rig.root);
        a = { id: d.id, rig, tag, pos: { x: start.x, z: start.z }, to, heading: 0, phase: Math.random() * 6, size };
        this.dogs.set(d.id, a);
      }
      a.to = to;
      a.rig.bandana.visible = !!this.snap?.looks.bandana;
      if (this.snap?.looks.bandana) (a.rig.bandana as THREE.Mesh).material = mat(this.snap.looks.bandana);
      const tone = selected === d.id ? "selected" : inActiveScuffle(f, d) ? "alert" : !d.checkedIn ? "waiting" : d.place.kind === "calm" ? "calm" : "default";
      a.tag.set(d.name, !d.checkedIn ? "check in" : `${Math.round(d.happiness)}% happy`, tone);
      a.important = tone !== "default" && tone !== "calm";
    }
    for (const [id, a] of this.dogs)
      if (!seen.has(id)) {
        if (!this.opts.reducedMotion) this.fx("puff", tileAtWorld(a.pos.x, a.pos.z) ?? ENTRANCE);
        this.scene.remove(a.rig.root);
        a.tag.dispose();
        this.dogs.delete(id);
      }
  }

  private syncStaff(f: Facility) {
    const counter = f.items.find((i) => i.kind === "front_counter");
    const at = counter ? thingCenter(counter.kind, counter.c, counter.r, counter.rot) : tileCenter(ENTRANCE.c, ENTRANCE.r - 1);
    const seen = new Set<string>();
    f.staff.forEach((st, i) => {
      seen.add(st.id);
      const to = { x: at.x - 0.8 + i * 0.7, z: at.z - (counter ? 1.1 : 0) - Math.floor(i / 3) * 0.6 };
      let a = this.staff.get(st.id);
      if (!a) {
        const rig = buildPerson("#0057A7", i * 13 + 5, true);
        rig.root.position.set(to.x, 0.06, to.z);
        rig.root.rotation.y = 0;
        this.scene.add(rig.root);
        a = { rig, pos: { ...to }, to };
        this.staff.set(st.id, a);
      }
      a.to = to;
    });
    for (const [id, a] of this.staff)
      if (!seen.has(id)) {
        this.scene.remove(a.rig.root);
        this.staff.delete(id);
      }
  }

  private syncRing(f: Facility, selected: string | null) {
    this.ring.visible = false;
    if (!selected) return;
    const dog = this.dogs.get(selected);
    if (dog) {
      this.ring.visible = true;
      this.ring.scale.set(1.3 * dog.size, 1.3 * dog.size, 1);
      return;
    }
    const thing = f.items.find((i) => i.uid === selected);
    const room = f.rooms.find((r) => r.uid === selected);
    if (thing) {
      const at = thingCenter(thing.kind, thing.c, thing.r, thing.rot);
      this.ring.position.set(at.x, 0.09, at.z);
      this.ring.scale.set(2.6, 2.6, 1);
      this.ring.visible = true;
    } else if (room) {
      const ctr = { x: -36 + TILE * (room.c + room.w / 2), z: -36 + TILE * (room.r + room.d / 2) };
      this.ring.position.set(ctr.x, 0.09, ctr.z);
      this.ring.scale.set(TILE * Math.min(room.w, room.d), TILE * Math.min(room.w, room.d), 1);
      this.ring.visible = true;
    }
  }

  // ---------- the loop ----------
  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.visible || (typeof document !== "undefined" && document.hidden)) return;
    const t0 = performance.now();
    this.t += dt;
    this.updateCamera();
    this.updateActors(dt);
    this.updateFx(now);
    this.renderer.render(this.scene, this.camera);
    this.frameMs = this.frameMs * 0.92 + (performance.now() - t0) * 0.08;
  };

  private updateCamera() {
    this.target.x = THREE.MathUtils.clamp(this.target.x, LOT.x0, LOT.x1);
    this.target.z = THREE.MathUtils.clamp(this.target.z, LOT.z0, LOT.z1 + 6);
    this.camera.position.set(this.target.x, Math.sin(PITCH) * this.distance, this.target.z + Math.cos(PITCH) * this.distance);
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
  }

  private updateActors(dt: number) {
    const calm = this.opts.reducedMotion;
    for (const a of this.dogs.values()) {
      const dx = a.to.x - a.pos.x;
      const dz = a.to.z - a.pos.z;
      const dist = Math.hypot(dx, dz);
      const moving = dist > 0.05;
      if (moving) {
        const step = calm ? dist : Math.min(dist, 4 * dt);
        a.pos.x += (dx / dist) * step;
        a.pos.z += (dz / dist) * step;
        a.heading = Math.atan2(dx, dz);
      }
      a.rig.root.position.set(a.pos.x, 0.06, a.pos.z);
      a.rig.root.rotation.y = a.heading;
      // Zoomed out, only pups that need you keep their name tags (less clutter, fewer layers to draw).
      a.tag.sprite.visible = this.distance <= 30 || !!a.important;
      const p = this.t * (moving ? 10 : 3) + a.phase;
      a.rig.tail.rotation.z = calm ? 0 : Math.sin(p * (moving ? 1 : 2.5)) * 0.6;
      a.rig.body.position.y = calm ? 0 : moving ? Math.abs(Math.sin(p)) * 0.05 : Math.sin(p * 0.5) * 0.012;
      if (a.id === this.snap?.selected) this.ring.position.set(a.pos.x, 0.09, a.pos.z);
    }
    for (const s of this.staff.values()) {
      s.pos.x += (s.to.x - s.pos.x) * Math.min(1, dt * 4);
      s.pos.z += (s.to.z - s.pos.z) * Math.min(1, dt * 4);
      s.rig.root.position.set(s.pos.x, 0.06, s.pos.z);
    }
  }

  private updateFx(now: number) {
    this.effects = this.effects.filter((f) => {
      const k = (now - f.born) / f.life;
      if (k >= 1) {
        this.fxGroup.remove(f.sprite);
        (f.sprite.material as THREE.SpriteMaterial).map?.dispose();
        f.sprite.material.dispose();
        return false;
      }
      f.sprite.visible = k >= 0;
      const e = Math.max(0, k);
      f.sprite.position.set(f.from.x + f.drift * e, f.from.y + f.rise * e, f.from.z);
      f.sprite.material.opacity = 1 - e * e;
      return true;
    });
  }

  // ---------- input ----------
  private pick(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    const mode = this.snap?.pickMode ?? "objects";
    if (mode === "objects") {
      let best: { id: string; px: number } | null = null;
      for (const [id, a] of this.dogs) {
        const v = new THREE.Vector3(a.pos.x, 0.5 * a.size, a.pos.z).project(this.camera);
        if (v.z > 1) continue;
        const px = Math.hypot(rect.left + ((v.x + 1) / 2) * rect.width - clientX, rect.top + ((1 - v.y) / 2) * rect.height - clientY);
        if (px < 38 && (!best || px < best.px)) best = { id, px };
      }
      if (best) return this.opts.onPick({ kind: "dog", id: best.id });
    }
    const hit = this.ray.ray.intersectPlane(this.ground, new THREE.Vector3());
    if (!hit) return this.opts.onPick(null);
    const tile = tileAtWorld(hit.x, hit.z);
    if (!tile) return this.opts.onPick(null);
    if (mode === "objects" && this.snap) {
      // What stands on the tapped square: furniture or an outdoor item (paths last), else the room around it.
      const f = fac(this.snap.state);
      const on = f.items.filter((i) => thingTiles(i).some((t) => t.c === tile.c && t.r === tile.r));
      const thing = on.find((i) => i.kind !== "path") ?? on[0];
      if (thing) return this.opts.onPick({ kind: "thing", uid: thing.uid });
      const room = f.rooms.find((r) => containsTile(r, tile));
      if (room) return this.opts.onPick({ kind: "room", uid: room.uid });
    }
    if (mode === "edges") {
      const fx = (hit.x + 36) / TILE - tile.c;
      const fz = (hit.z + 36) / TILE - tile.r;
      const near: [number, Side][] = [[fx * TILE, "W"], [(1 - fx) * TILE, "E"], [fz * TILE, "N"], [(1 - fz) * TILE, "S"]];
      near.sort((a, b) => a[0] - b[0]);
      if (near[0]![0] <= EDGE_PICK) return this.opts.onPick({ kind: "edge", c: tile.c, r: tile.r, side: near[0]![1] });
    }
    this.opts.onPick({ kind: "tile", c: tile.c, r: tile.r });
  }

  private onDown = (e: PointerEvent) => {
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch0 = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      this.dist0 = this.distance;
    }
  };
  private onMove = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (this.pinch0 > 0) this.distance = THREE.MathUtils.clamp((this.dist0 * this.pinch0) / Math.max(20, d), 9, 60);
      return;
    }
    const scale = (this.distance * 1.15) / Math.max(200, this.canvas.clientHeight);
    this.target.x -= dx * scale;
    this.target.z -= (dy * scale) / Math.sin(PITCH);
  };
  private onUp = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch0 = 0;
    if (!p) return;
    const moved = Math.hypot(e.clientX - p.sx, e.clientY - p.sy);
    if (moved < 10 && performance.now() - p.t < 600 && this.pointers.size === 0) {
      // A finger's follow-up click must not press a button in the panel this tap opens.
      if (e.pointerType !== "mouse") swallowNextClick(window, e.clientX, e.clientY);
      this.pick(e.clientX, e.clientY);
    }
  };
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoom(e.deltaY > 0 ? 1.1 : 0.9);
  };
  private onKey = (e: KeyboardEvent) => {
    if (document.activeElement !== this.canvas || e.type !== "keydown") return;
    const k = e.key.toLowerCase();
    const moves: Record<string, [number, number]> = { arrowup: [0, -1.5], arrowdown: [0, 1.5], arrowleft: [-1.5, 0], arrowright: [1.5, 0] };
    const m = moves[k];
    if (m) {
      e.preventDefault();
      this.target.x += m[0];
      this.target.z += m[1];
    }
    if (k === "+" || k === "=") this.zoom(0.9);
    if (k === "-") this.zoom(1.1);
  };

  private bindInput() {
    const c = this.canvas;
    c.addEventListener("pointerdown", this.onDown);
    c.addEventListener("pointermove", this.onMove);
    c.addEventListener("pointerup", this.onUp);
    c.addEventListener("pointercancel", this.onUp);
    c.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("keydown", this.onKey);
  }
  private unbindInput() {
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onUp);
    c.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("keydown", this.onKey);
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** For tests and QA. */
  debugInfo() {
    return {
      rooms: this.rooms.children.length,
      things: this.things.children.length,
      paths: this.paths.children.length,
      dogs: [...this.dogs.values()].map((a) => ({ id: a.id, x: a.pos.x, z: a.pos.z })),
      staff: this.staff.size,
      target: { x: this.target.x, z: this.target.z },
      distance: this.distance,
      frameMs: this.frameMs,
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    };
  }

  /** Screen position of a world point, or of a tile centre (for QA taps). */
  project(x: number, y: number, z: number) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, visible: v.z < 1 };
  }
  projectTile(c: number, r: number) {
    const t = tileCenter(c, r);
    return this.project(t.x, 0, t.z);
  }
  /** World position of a wall edge's midpoint (for QA taps on edges). */
  projectEdge(c: number, r: number, side: Side) {
    const t = tileCenter(c, r);
    const h = TILE / 2 - 0.15;
    return this.project(t.x + (side === "E" ? h : side === "W" ? -h : 0), 0, t.z + (side === "S" ? h : side === "N" ? -h : 0));
  }
}

export function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
