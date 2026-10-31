// The playable 3D daycare. It never owns game rules or state: every frame it draws whatever the
// engine's GameState says (same object the list view and saves use), and every tap/interaction is
// reported back to React, which runs the engine action. Both camera modes share this one scene.
import * as THREE from "three";
import type { Dog, GameState, GroupId, SiteId } from "@/game/engine";
import {
  GROUPS,
  LOBBY_CAP,
  groupOf,
  hasScuffle,
  lobbyDogs,
  roomAtRisk,
  roomCapacity,
  roomDogs,
  suiteCount,
  suiteDog,
} from "@/game/engine";
import {
  AREAS,
  BATH,
  BOUNDS,
  COLLIDERS,
  CORRIDOR,
  DESK,
  ENTRANCE_IN,
  ENTRANCE_OUT,
  GROUP_COLORS,
  LOBBY,
  LOBBY_PEN,
  LOBBY_SPOTS,
  RECOVERY,
  ROOMS,
  STREET,
  SUITES,
  TUB,
  WALLS,
  areaAt,
  areaForPlace,
  collide,
  inRect,
  randomIn,
  routeBetween,
  type Area,
  type Pt,
} from "./layout";
import {
  GEO,
  buildDog,
  buildPerson,
  coatFor,
  makeEmojiSprite,
  makeSign,
  makeTag,
  mat,
  part,
  type DogRig,
  type PersonRig,
  type Tag,
} from "./models";

export type CameraMode = "overhead" | "walk";
export type WorldPick =
  | { kind: "dog"; id: string }
  | { kind: "room"; group: GroupId }
  | { kind: "suite"; index: number }
  | { kind: "place"; place: "lobby" | "desk" | "bath" | "recovery" };
export type FocusTarget = (WorldPick & { key: string }) | null;
export type RoomHint = "fit" | "warn" | "block";
export type WorldLooks = {
  bandana?: string | undefined;
  star: boolean;
  collar: boolean;
  deluxe: boolean;
};
export type WorldSnapshot = {
  state: GameState;
  site: SiteId;
  selected: string | null;
  looks: WorldLooks;
  roomHints: Partial<Record<GroupId, RoomHint>>;
  suiteHints: (RoomHint | null)[];
};
export type WorldOptions = {
  onPick: (p: WorldPick | null) => void;
  onFocus: (t: FocusTarget) => void;
  onCamera?: (c: { mode: CameraMode; x: number; z: number }) => void;
  reducedMotion?: boolean;
  lowPower?: boolean;
  logoUrl?: string;
};

const SMALL = 0.75;
const LARGE = 1.12;
const PITCH = (56 * Math.PI) / 180;
const EYE = 1.55;
const WALK_SPEED = 3.0;

type DogActor = {
  id: string;
  rig: DogRig;
  tag: Tag;
  pos: Pt;
  heading: number;
  path: Pt[];
  speed: number;
  areaKey: string;
  slot: Pt | null;
  idleUntil: number;
  phase: number;
  leaving: boolean;
  bathUntil: number;
  size: "small" | "large";
};
type PersonActor = {
  rig: PersonRig;
  pos: Pt;
  heading: number;
  path: Pt[];
  speed: number;
  waitUntil: number;
  onArrive: (() => void) | null;
  remove: boolean;
  tag?: Tag;
  staffId?: string;
  home?: Pt;
};
type Fx = { sprite: THREE.Sprite; born: number; life: number; from: THREE.Vector3; rise: number };

const toV = (p: Pt, y = 0) => new THREE.Vector3(p.x, y, p.z);
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.z - b.z);

export class DaycareWorld {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  private canvas: HTMLCanvasElement;
  private opts: WorldOptions;
  private mode: CameraMode = "overhead";
  private snap: WorldSnapshot | null = null;
  private siteBuilt: SiteId | null = null;
  private siteGroup = new THREE.Group();
  private dynamic = new THREE.Group(); // per-snapshot props (upgrades, decor, suites)
  private dynamicKey = "";
  private dogs = new Map<string, DogActor>();
  private people: PersonActor[] = [];
  private staff = new Map<string, PersonActor>();
  private fx: Fx[] = [];
  private pickables: THREE.Object3D[] = [];
  private roomHint = new Map<string, THREE.Mesh>();
  private roomSigns = new Map<string, ReturnType<typeof makeSign>>();
  private suiteSigns: ReturnType<typeof makeSign>[] = [];
  private dust = new Map<string, THREE.Sprite>();
  private selRing: THREE.Mesh;
  private raf = 0;
  private last = 0;
  private t = 0;
  private visible = true;
  private disposed = false;
  private io: IntersectionObserver | null = null;
  private ro: ResizeObserver | null = null;
  // overhead camera
  private target = new THREE.Vector3(0, 0, 7.5);
  private distance = 26;
  // walk camera
  private me: Pt = { ...ENTRANCE_IN };
  private yaw = 0;
  private pitch = -0.12;
  private move = { x: 0, y: 0 };
  private keys = new Set<string>();
  private focusKey = "";
  private focusAt = 0;
  // pointer gestures
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  private pinch0 = 0;
  private dist0 = 0;
  private known = new Set<string>();
  private initialized = false;
  frameMs = 16;

  constructor(canvas: HTMLCanvasElement, opts: WorldOptions) {
    this.canvas = canvas;
    this.opts = opts;
    const dpr = Math.min(window.devicePixelRatio || 1, opts.lowPower ? 1.25 : 1.75);
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: dpr < 1.5,
      powerPreference: "high-performance",
      alpha: false,
    });
    this.renderer.setPixelRatio(dpr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color("#cfe6ff");
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#9fb4cc", 1.35));
    const sun = new THREE.DirectionalLight("#ffffff", 1.35);
    sun.position.set(10, 24, 14);
    this.scene.add(sun);
    this.scene.add(this.siteGroup);
    this.scene.add(this.dynamic);
    this.selRing = new THREE.Mesh(
      GEO.ring,
      new THREE.MeshBasicMaterial({
        color: "#ffd34d",
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
    );
    this.selRing.rotation.x = -Math.PI / 2;
    this.selRing.position.y = 0.03;
    this.selRing.visible = false;
    this.scene.add(this.selRing);
    this.buildGround();
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
  setSnapshot(s: WorldSnapshot) {
    const siteChanged = this.siteBuilt !== s.site;
    this.snap = s;
    if (siteChanged) this.buildSite(s.site);
    this.syncDynamic(s);
    this.syncDogs(s, siteChanged);
    this.syncStaff(s, siteChanged);
    this.syncSigns(s);
    this.initialized = true;
  }

  setMode(m: CameraMode) {
    if (m === this.mode) return;
    this.mode = m;
    if (m === "walk") {
      // Step in at the doorway of whatever area the overhead camera was showing, facing into it.
      // The lobby (and anywhere else) starts at the front door, facing the check-in desk.
      const a = areaAt({ x: this.target.x, z: this.target.z });
      if (
        a &&
        (a.kind === "room" || a.kind === "suite" || a.kind === "bath" || a.kind === "recovery")
      ) {
        this.me = { ...a.doorIn };
        this.yaw = a.rect.z1 <= 2.6 ? 0 : Math.PI;
      } else {
        this.me = { ...ENTRANCE_IN };
        this.yaw = 0;
      }
      this.pitch = -0.12;
    } else {
      this.target.set(this.me.x, 0, this.me.z);
    }
    this.focusKey = "";
    this.opts.onFocus(null);
    this.reportCamera();
  }

  getMode() {
    return this.mode;
  }

  resetCamera() {
    if (this.mode === "walk") {
      this.me = { ...ENTRANCE_IN };
      this.yaw = 0;
      this.pitch = -0.12;
    } else {
      const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
      // phones: start over the lobby & front desk; wide screens: the whole building
      if (aspect < 1.3) {
        this.target.set(-1, 0, 6.2);
        this.distance = 22;
      } else {
        this.target.set(0, 0, 3.5);
        this.distance = 30;
      }
    }
    this.reportCamera();
  }

  /** Fly the overhead camera to an area (or walk mode: teleport to its doorway). */
  jumpTo(key: string) {
    const a = AREAS.find((x) => x.key === key) ?? (key === "playrooms" ? null : LOBBY);
    if (key === "playrooms") {
      if (this.mode === "walk") {
        this.me = { x: 0, z: 4 };
        this.yaw = 0;
      } else {
        this.target.set(0, 0, -1.5);
        this.distance = 30;
      }
      this.reportCamera();
      return;
    }
    if (!a) return;
    if (this.mode === "walk") {
      this.me = { ...a.doorIn };
      this.yaw = a.rect.z1 <= 2.6 ? 0 : Math.PI; // face into the room
      if (a.kind === "lobby") {
        this.me = { ...ENTRANCE_IN };
        this.yaw = 0;
      }
    } else {
      this.target.set((a.rect.x0 + a.rect.x1) / 2, 0, (a.rect.z0 + a.rect.z1) / 2);
      this.distance = Math.max(14, Math.min(26, (a.rect.x1 - a.rect.x0) * 2.2));
    }
    this.reportCamera();
  }

  zoom(factor: number) {
    if (this.mode === "overhead")
      this.distance = THREE.MathUtils.clamp(this.distance * factor, 9, 48);
  }

  setMove(x: number, y: number) {
    this.move.x = THREE.MathUtils.clamp(x, -1, 1);
    this.move.y = THREE.MathUtils.clamp(y, -1, 1);
  }

  private lookSpeed = 1;
  private invertLook = false;
  setLookPrefs(speed: number, invert: boolean) {
    this.lookSpeed = THREE.MathUtils.clamp(speed, 0.5, 2);
    this.invertLook = invert;
  }

  look(dx: number, dy: number) {
    this.yaw -= dx * 0.0055 * this.lookSpeed;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch - (this.invertLook ? -dy : dy) * 0.0045 * this.lookSpeed,
      -1.1,
      0.6,
    );
  }

  /** Little celebratory/feedback effects; also sends a staff member over. */
  effect(kind: "checkin" | "play" | "bath" | "checkout" | "separate" | "assign", dogId: string) {
    const a = this.dogs.get(dogId);
    const pos = a?.pos ?? LOBBY.doorIn;
    const emoji = {
      checkin: "✅",
      play: "💙",
      bath: "🫧",
      checkout: "🏠",
      separate: "🫶",
      assign: "🐾",
    }[kind];
    for (let i = 0; i < (kind === "play" || kind === "bath" ? 3 : 1); i++)
      this.spawnFx(emoji, pos, i * 0.18);
    if (kind === "bath" && a) {
      a.path = routeBetween(a.pos, areaAt(a.pos), BATH, {
        x: TUB.x + (Math.random() - 0.5) * 0.8,
        z: TUB.z,
      });
      a.bathUntil = this.t + 9;
    }
    const helper =
      [...this.staff.values()].find((p) => !p.path.length) ?? [...this.staff.values()][0];
    if (helper && a)
      helper.path = routeBetween(helper.pos, areaAt(helper.pos), areaAt(a.pos) ?? LOBBY, {
        x: a.pos.x + 0.9,
        z: a.pos.z + 0.6,
      });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.io?.disconnect();
    this.ro?.disconnect();
    this.unbindInput();
    for (const d of this.dogs.values()) d.tag.dispose();
    this.renderer.dispose();
  }

  // ---------- building the static site ----------
  private buildGround() {
    const grass = part(GEO.plane, "#a9d98d", 90, 90, 1, 0, -0.02, 4);
    grass.rotation.x = -Math.PI / 2;
    this.scene.add(grass);
    const walk = part(GEO.plane, "#e6e2da", 34, 8, 1, 0, -0.01, 17);
    walk.rotation.x = -Math.PI / 2;
    this.scene.add(walk);
    const road = part(GEO.plane, "#5d6673", 60, 5, 1, 0, -0.015, 23.5);
    road.rotation.x = -Math.PI / 2;
    this.scene.add(road);
    for (let x = -26; x <= 26; x += 4) {
      const stripe = part(GEO.plane, "#f5f1e6", 1.6, 0.2, 1, x, -0.005, 23.5);
      stripe.rotation.x = -Math.PI / 2;
      this.scene.add(stripe);
    }
    // a few trees for scale
    for (const [x, z] of [
      [-20, 15],
      [20, 15],
      [-21, -3],
      [21, 2],
      [-19, -9],
      [19, -8],
    ] as const) {
      this.scene.add(part(GEO.cylLo, "#8a5a33", 0.35, 1.6, 0.35, x, 0.8, z));
      this.scene.add(part(GEO.sphereLo, "#5fb35a", 2.6, 2.4, 2.6, x, 2.4, z));
    }
  }

  private buildSite(site: SiteId) {
    this.siteBuilt = site;
    this.clearGroup(this.siteGroup);
    this.pickables = [];
    this.roomHint.clear();
    this.roomSigns.clear();
    this.suiteSigns = [];
    this.dust.clear();
    for (const d of this.dogs.values()) {
      this.scene.remove(d.rig.root, d.tag.sprite);
      d.tag.dispose();
    }
    this.dogs.clear();
    for (const p of this.people) this.scene.remove(p.rig.root);
    this.people = [];
    for (const p of this.staff.values()) {
      this.scene.remove(p.rig.root);
      if (p.tag) {
        this.scene.remove(p.tag.sprite);
        p.tag.dispose();
      }
    }
    this.staff.clear();
    this.known.clear();
    this.dynamicKey = "";

    const g = this.siteGroup;
    const trim = site === "hillsdale" ? "#2f9e5b" : "#0057A7";
    // floors
    for (const a of AREAS) {
      const f = part(
        GEO.plane,
        a.floor,
        a.rect.x1 - a.rect.x0,
        a.rect.z1 - a.rect.z0,
        1,
        (a.rect.x0 + a.rect.x1) / 2,
        0.005,
        (a.rect.z0 + a.rect.z1) / 2,
      );
      f.rotation.x = -Math.PI / 2;
      if (a.kind === "room")
        f.userData["pick"] = { kind: "room", group: a.group! } satisfies WorldPick;
      if (a.kind === "suite")
        f.userData["pick"] = { kind: "suite", index: a.index! } satisfies WorldPick;
      if (a.kind === "lobby")
        f.userData["pick"] = { kind: "place", place: "lobby" } satisfies WorldPick;
      if (a.kind === "bath")
        f.userData["pick"] = { kind: "place", place: "bath" } satisfies WorldPick;
      if (a.kind === "recovery")
        f.userData["pick"] = { kind: "place", place: "recovery" } satisfies WorldPick;
      g.add(f);
      if (f.userData["pick"]) this.pickables.push(f);
      if (a.kind === "room") {
        // colour wash used to show fit / warning / blocked while a pup is selected
        const hint = new THREE.Mesh(
          GEO.plane,
          new THREE.MeshBasicMaterial({
            color: "#2fbf71",
            transparent: true,
            opacity: 0,
            depthWrite: false,
          }),
        );
        hint.rotation.x = -Math.PI / 2;
        hint.scale.set(a.rect.x1 - a.rect.x0 - 0.3, a.rect.z1 - a.rect.z0 - 0.3, 1);
        hint.position.set((a.rect.x0 + a.rect.x1) / 2, 0.012, (a.rect.z0 + a.rect.z1) / 2);
        g.add(hint);
        this.roomHint.set(a.key, hint);
        // group colour stripe along the doorway
        const stripe = part(
          GEO.box,
          GROUP_COLORS[a.group!].accent,
          a.rect.x1 - a.rect.x0 - 0.4,
          0.02,
          0.35,
          (a.rect.x0 + a.rect.x1) / 2,
          0.015,
          a.rect.z1 - 0.35,
        );
        g.add(stripe);
        // sign above the door, readable from the hallway and from above
        const sign = makeSign(3.4, 1.05);
        sign.mesh.position.set(a.doorIn.x, 2.75, a.rect.z1 + 0.12);
        g.add(sign.mesh);
        // the same sign painted on the floor just inside the door, readable from the overhead camera
        const floorSign = new THREE.Mesh(GEO.plane, sign.material);
        floorSign.scale.set(5.2, 1.6, 1);
        floorSign.rotation.x = -Math.PI / 2;
        floorSign.position.set(a.doorIn.x, 0.03, a.rect.z1 - 1.25);
        g.add(floorSign);
        this.roomSigns.set(a.group!, sign);
        // dust cloud (hidden unless there is a scuffle)
        const dust = makeEmojiSprite("💨", 2.2);
        dust.position.set((a.rect.x0 + a.rect.x1) / 2, 1.3, (a.rect.z0 + a.rect.z1) / 2 - 1);
        dust.visible = false;
        g.add(dust);
        this.dust.set(a.group!, dust);
        // permanent play props
        const cx = (a.rect.x0 + a.rect.x1) / 2;
        g.add(part(GEO.box, "#ffffff", 3.4, 0.04, 2.2, cx, 0.03, -2.4, {}));
        g.add(part(GEO.sphereLo, "#c8e05a", 0.24, 0.24, 0.24, cx - 2.3, 0.12, -0.8));
        g.add(part(GEO.sphereLo, "#ff7a59", 0.3, 0.3, 0.3, cx + 2.1, 0.15, -3.9));
        const rope = part(GEO.cylLo, "#3b82f6", 0.1, 0.9, 0.1, cx + 1.4, 0.06, -1.2);
        rope.rotation.z = Math.PI / 2;
        g.add(rope);
        g.add(part(GEO.cyl, "#cfd8e3", 0.45, 0.12, 0.45, a.rect.x0 + 0.6, 0.06, a.rect.z0 + 0.7)); // water bowl
        g.add(part(GEO.cyl, "#5aa9e6", 0.36, 0.04, 0.36, a.rect.x0 + 0.6, 0.13, a.rect.z0 + 0.7));
      }
    }
    // walls: solid lower half + glass upper half + brand trim
    const glass = mat("#bfe0ff", { opacity: 0.2 });
    for (const w of WALLS) {
      const lx = w.x1 - w.x0;
      const lz = w.z1 - w.z0;
      const cx = (w.x0 + w.x1) / 2;
      const cz = (w.z0 + w.z1) / 2;
      const low = w.exterior ? 1.25 : 1.0;
      g.add(part(GEO.box, w.exterior ? "#fbfcfe" : "#f4f7fb", lx, low, lz, cx, low / 2, cz));
      g.add(part(GEO.box, trim, lx + 0.02, 0.08, lz + 0.02, cx, low + 0.04, cz));
      const gl = new THREE.Mesh(GEO.box, glass);
      gl.scale.set(lx, 2.35 - low, lz * 0.4);
      gl.position.set(cx, low + (2.35 - low) / 2, cz);
      gl.renderOrder = 2;
      g.add(gl);
    }
    // entrance canopy + logo sign
    g.add(part(GEO.box, trim, 4.2, 0.18, 2.2, 0, 2.7, 13.9));
    g.add(part(GEO.cylLo, "#ffffff", 0.12, 2.7, 0.12, -1.9, 1.35, 14.8));
    g.add(part(GEO.cylLo, "#ffffff", 0.12, 2.7, 0.12, 1.9, 1.35, 14.8));
    const welcome = makeSign(4, 0.9);
    welcome.draw({
      title: site === "hillsdale" ? "Hillsdale" : "Hawthorne",
      sub: "PAWtastic daycare · game version",
      badge: "🐾",
      color: "#ffffff",
    });
    welcome.mesh.position.set(0, 3.3, 13.05);
    g.add(welcome.mesh);
    // lobby: front desk, logo wall, waiting pen, benches
    g.add(part(GEO.box, "#102c49", DESK.w, 1.05, DESK.d, DESK.x, 0.525, DESK.z));
    g.add(part(GEO.box, "#ffffff", DESK.w + 0.15, 0.08, DESK.d + 0.2, DESK.x, 1.09, DESK.z));
    g.add(part(GEO.box, trim, DESK.w * 0.6, 0.3, 0.02, DESK.x, 0.62, DESK.z + DESK.d / 2 + 0.01));
    g.add(part(GEO.box, "#2b2b2b", 0.5, 0.32, 0.04, DESK.x + 1.2, 1.3, DESK.z - 0.1)); // check-in screen
    const deskPick = new THREE.Mesh(GEO.box, new THREE.MeshBasicMaterial({ visible: false }));
    deskPick.scale.set(DESK.w, 1.2, DESK.d + 0.6);
    deskPick.position.set(DESK.x, 0.6, DESK.z);
    deskPick.userData["pick"] = { kind: "place", place: "desk" } satisfies WorldPick;
    g.add(deskPick);
    this.pickables.push(deskPick);
    if (this.opts.logoUrl) {
      const logo = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ color: "#ffffff" }));
      new THREE.TextureLoader().load(this.opts.logoUrl, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        (logo.material as THREE.MeshBasicMaterial).map = tex;
        (logo.material as THREE.MeshBasicMaterial).needsUpdate = true;
      });
      logo.scale.set(2.1, 2.1, 1);
      logo.position.set(-3.2, 1.75, 5.62);
      g.add(logo);
      const outside = logo.clone();
      outside.scale.set(1.7, 1.7, 1);
      outside.position.set(3.4, 1.9, 13.12);
      g.add(outside);
    }
    const pen = LOBBY_PEN;
    const rail = "#ffffff";
    for (const [x0, z0, x1, z1] of [
      [pen.x0, pen.z0, pen.x1, pen.z0],
      [pen.x0, pen.z1, pen.x1, pen.z1],
      [pen.x1, pen.z0, pen.x1, pen.z0 + 2.2],
      [pen.x1, pen.z0 + 3.6, pen.x1, pen.z1],
    ] as const) {
      const lx = Math.abs(x1 - x0) || 0.06;
      const lz = Math.abs(z1 - z0) || 0.06;
      g.add(part(GEO.box, rail, lx, 0.06, lz, (x0 + x1) / 2, 0.62, (z0 + z1) / 2));
      g.add(part(GEO.box, trim, lx, 0.05, lz, (x0 + x1) / 2, 0.3, (z0 + z1) / 2));
    }
    const penSign = makeSign(2.6, 0.7);
    penSign.draw({
      title: "Waiting area",
      sub: `Up to ${LOBBY_CAP} pups`,
      badge: "🛎️",
      color: "#ffd34d",
    });
    penSign.mesh.position.set(pen.x0 + 1.6, 1.25, pen.z1 + 0.02);
    g.add(penSign.mesh);
    for (const z of [10.2, 11.8]) {
      g.add(part(GEO.box, "#c08a55", 2.2, 0.12, 0.6, 4.4, 0.46, z));
      g.add(part(GEO.box, "#9a6a3d", 0.1, 0.46, 0.5, 3.4, 0.23, z));
      g.add(part(GEO.box, "#9a6a3d", 0.1, 0.46, 0.5, 5.4, 0.23, z));
    }
    // bath area: tub + towels + hose
    g.add(part(GEO.box, "#ffffff", 2.0, 0.7, 1.2, TUB.x, 0.35, TUB.z));
    g.add(part(GEO.box, "#7fd3e8", 1.7, 0.05, 0.9, TUB.x, 0.68, TUB.z));
    g.add(part(GEO.cylLo, "#9aa6b2", 0.08, 1.6, 0.08, TUB.x + 0.9, 1.1, TUB.z - 0.55));
    for (let i = 0; i < 3; i++)
      g.add(
        part(
          GEO.box,
          ["#ffd34d", "#ff9fb8", "#9fd8ff"][i]!,
          0.5,
          0.7,
          0.06,
          6.6 + i * 0.6,
          1.0,
          12.85,
        ),
      );
    // recovery room: soft mats, calm plants
    for (const [x, z] of [
      [12.4, 8.2],
      [14.6, 8.2],
      [12.4, 11.2],
      [14.6, 11.2],
    ] as const)
      g.add(part(GEO.box, "#cbbcf6", 1.6, 0.12, 1.2, x, 0.06, z));
    this.addPlant(g, 15.4, 6.2);
    this.addPlant(g, 11.6, 12.4);
    // signs for lobby / bath / recovery (facing the hallway)
    const sigs: [Area, string, string, string][] = [
      [LOBBY, "Lobby & check-in", "Customers drop off here", "🛎️"],
      [BATH, "Bath area", "Baths & exit baths", "🛁"],
      [RECOVERY, "Recovery room", "Staff only · always open", "🫶"],
    ];
    for (const [a, title, sub, badge] of sigs) {
      const s = makeSign(a === LOBBY ? 3.4 : 3.0, 0.95);
      s.draw({
        title,
        sub,
        badge,
        color: a === RECOVERY ? "#cbbcf6" : a === BATH ? "#7fd3e8" : "#ffd34d",
      });
      s.mesh.position.set(a.doorIn.x, 2.75, a.rect.z0 - 0.12);
      s.mesh.rotation.y = Math.PI;
      g.add(s.mesh);
    }
    // suites signs (one per suite, above the door, facing the hallway)
    SUITES.forEach((a) => {
      const s = makeSign(2.9, 0.9);
      s.mesh.position.set(a.doorIn.x, 2.75, a.rect.z0 - 0.12);
      s.mesh.rotation.y = Math.PI;
      g.add(s.mesh);
      const floorSign = new THREE.Mesh(GEO.plane, s.material);
      floorSign.scale.set(3.0, 0.93, 1);
      floorSign.rotation.x = -Math.PI / 2;
      floorSign.position.set(a.doorIn.x, 0.03, a.rect.z0 + 1.9);
      g.add(floorSign);
      this.suiteSigns.push(s);
    });
    this.resetCamera();
  }

  private addPlant(g: THREE.Object3D, x: number, z: number) {
    g.add(part(GEO.cylLo, "#c8794a", 0.5, 0.5, 0.5, x, 0.25, z));
    g.add(part(GEO.sphereLo, "#3f9d4e", 0.9, 1.1, 0.9, x, 0.95, z));
  }

  /** Upgrades, decor, suites and paid decor: rebuilt only when they change. */
  private syncDynamic(s: WorldSnapshot) {
    const st = s.state;
    const key = JSON.stringify([s.site, st.upgrades, st.decor, s.looks.deluxe, suiteCount(st)]);
    if (key === this.dynamicKey) return;
    this.dynamicKey = key;
    this.clearGroup(this.dynamic);
    const g = this.dynamic;
    const up = (id: string) => st.upgrades.includes(id);
    for (const r of ROOMS) {
      const cx = (r.rect.x0 + r.rect.x1) / 2;
      if (up("yard1")) {
        const ramp = part(GEO.box, "#ffb347", 2.2, 0.12, 0.9, cx - 1.6, 0.35, -4.6);
        ramp.rotation.z = 0.32;
        g.add(ramp, part(GEO.box, "#ffb347", 0.9, 0.7, 0.9, cx - 0.2, 0.35, -4.6));
      }
      if (up("yard2")) {
        const tunnel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.45, 0.45, 2.2, 12, 1, true),
          mat("#4cc3a0"),
        );
        tunnel.material.side = THREE.DoubleSide;
        tunnel.rotation.z = Math.PI / 2;
        tunnel.position.set(cx + 1.6, 0.45, -1.8);
        g.add(tunnel);
        for (const dx of [-2.6, -1.4]) {
          g.add(
            part(GEO.cylLo, "#ffffff", 0.06, 0.6, 0.06, cx + dx, 0.3, 0.2),
            part(GEO.cylLo, "#ffffff", 0.06, 0.6, 0.06, cx + dx + 0.9, 0.3, 0.2),
          );
          const bar = part(GEO.cylLo, "#e64a4a", 0.05, 0.95, 0.05, cx + dx + 0.45, 0.45, 0.2);
          bar.rotation.z = Math.PI / 2;
          g.add(bar);
        }
      }
      if (st.decor.includes("balls")) {
        g.add(part(GEO.cyl, "#0057A7", 0.7, 0.55, 0.7, r.rect.x1 - 0.7, 0.28, r.rect.z0 + 0.7));
        for (let i = 0; i < 4; i++)
          g.add(
            part(
              GEO.sphereLo,
              "#c8e05a",
              0.2,
              0.2,
              0.2,
              r.rect.x1 - 0.85 + (i % 2) * 0.25,
              0.6,
              r.rect.z0 + 0.6 + Math.floor(i / 2) * 0.22,
            ),
          );
      }
      if (st.decor.includes("pool") && r.group?.startsWith("large")) {
        g.add(
          part(GEO.cyl, "#5ec2f0", 1.8, 0.25, 1.8, cx + 2.3, 0.12, -4.5),
          part(GEO.cyl, "#bfeaff", 1.6, 0.27, 1.6, cx + 2.3, 0.13, -4.5),
        );
      }
      if (st.decor.includes("plant")) this.addPlant(g, r.rect.x0 + 0.6, r.rect.z1 - 1.2);
      if (s.looks.deluxe) {
        // Deluxe Daycare Decor (paid, cosmetic): cloud beds + lighthouse fort
        for (const dx of [-2.6, -1.6])
          for (const k of [0, 1, 2])
            g.add(
              part(
                GEO.sphereLo,
                "#ffffff",
                0.7,
                0.35,
                0.7,
                cx + dx + k * 0.25,
                0.18,
                r.rect.z0 + 0.8 + (k % 2) * 0.2,
              ),
            );
        const lx = r.rect.x1 - 1.1;
        for (let i = 0; i < 4; i++)
          g.add(
            part(
              GEO.cyl,
              i % 2 ? "#e64a4a" : "#ffffff",
              0.9 - i * 0.08,
              0.5,
              0.9 - i * 0.08,
              lx,
              0.25 + i * 0.5,
              -1.4,
            ),
          );
        g.add(part(GEO.cone, "#102c49", 0.8, 0.6, 0.8, lx, 2.3, -1.4));
      }
    }
    if (st.decor.includes("plant")) {
      this.addPlant(g, 5.4, 6.2);
      this.addPlant(g, -5.4, 12.4);
    }
    if (st.decor.includes("bone")) {
      g.add(part(GEO.capsule, "#f3e3c6", 0.5, 1.4, 0.5, 4.4, 0.35, 7.3));
      g.children[g.children.length - 1]!.rotation.z = Math.PI / 2;
      for (const dx of [-1.15, 1.15])
        for (const dz of [-0.25, 0.25])
          g.add(part(GEO.sphereLo, "#f3e3c6", 0.55, 0.55, 0.55, 4.4 + dx, 0.35, 7.3 + dz));
    }
    if (s.looks.deluxe) {
      // paw-print rug in the lobby
      const rug = part(GEO.cyl, "#0057A7", 3, 0.02, 3, 0.2, 0.02, 11);
      g.add(rug, part(GEO.cyl, "#ffffff", 0.9, 0.025, 0.9, 0.2, 0.025, 11.2));
      for (const [dx, dz] of [
        [-0.6, -0.55],
        [-0.2, -0.85],
        [0.25, -0.85],
        [0.65, -0.55],
      ] as const)
        g.add(part(GEO.cyl, "#ffffff", 0.32, 0.025, 0.32, 0.2 + dx, 0.025, 11.2 + dz));
    }
    if (up("splash")) {
      g.add(
        part(GEO.box, "#ffffff", 1.4, 0.55, 1.0, 9.6, 0.28, 11.6),
        part(GEO.box, "#9fe6ff", 1.2, 0.05, 0.8, 9.6, 0.56, 11.6),
      );
    }
    // suites: beds when built, construction tape when not
    const built = suiteCount(st);
    SUITES.forEach((a, i) => {
      const cx = (a.rect.x0 + a.rect.x1) / 2;
      if (i < built) {
        g.add(
          part(GEO.box, "#8a5a33", 1.6, 0.25, 1.1, cx, 0.13, 11.6),
          part(GEO.box, s.looks.deluxe ? "#ffffff" : "#9fc7ff", 1.45, 0.18, 0.95, cx, 0.32, 11.6),
        );
        g.add(part(GEO.cyl, "#cfd8e3", 0.4, 0.1, 0.4, cx + 1, 0.05, 7.6));
        g.add(part(GEO.box, "#ffd34d", 1.2, 0.02, 1.6, cx, 0.012, 9.4));
      } else {
        for (const dx of [-0.8, 0.8])
          g.add(part(GEO.cone, "#ff8a00", 0.35, 0.6, 0.35, cx + dx, 0.3, 6.8));
        const tape = part(GEO.box, "#ffd400", 1.8, 0.1, 0.02, cx, 0.55, 6.8);
        g.add(tape);
      }
    });
  }

  private syncSigns(s: WorldSnapshot) {
    const st = s.state;
    const cap = roomCapacity(st);
    for (const gr of GROUPS) {
      const n = roomDogs(st, s.site, gr.id).length;
      const fight = hasScuffle(st, s.site, gr.id);
      const risk = roomAtRisk(st, s.site, gr.id);
      this.roomSigns.get(gr.id)?.draw({
        title: `${gr.emoji} ${gr.name}`,
        sub: fight
          ? "SCUFFLE — separate now"
          : risk
            ? "⚠ Mismatched pup inside"
            : `${gr.size === "small" ? "Small" : "Large"} pups · ${gr.temper} play`,
        badge: `${n}/${cap}`,
        color: GROUP_COLORS[gr.id].accent,
        alert: fight || risk,
      });
      const d = this.dust.get(gr.id);
      if (d) d.visible = fight;
      const hint = this.roomHint.get(`room:${gr.id}`);
      if (hint) {
        const h = s.roomHints[gr.id];
        const m = hint.material as THREE.MeshBasicMaterial;
        m.opacity = h ? 0.32 : 0;
        m.color.set(h === "fit" ? "#2fbf71" : h === "warn" ? "#ffb020" : "#8c96a3");
      }
    }
    const built = suiteCount(st);
    this.suiteSigns.forEach((sign, i) => {
      if (i >= built) {
        sign.draw({
          title: `Suite ${i + 1}`,
          sub: "Build Boarding Suites (Upgrades)",
          badge: "🔒",
          color: "#8c96a3",
        });
        return;
      }
      const occ = suiteDog(st, s.site, i);
      const hint = s.suiteHints[i];
      sign.draw({
        title: `Suite ${i + 1}`,
        sub: occ
          ? `${occ.name} · overnight guest`
          : hint === "fit"
            ? "Open — tap to settle here"
            : "Open",
        badge: occ ? "🌙" : "OPEN",
        color: occ ? "#9fc7ff" : "#2fbf71",
      });
    });
  }

  // ---------- dogs ----------
  private targetFor(
    st: GameState,
    site: SiteId,
    d: Dog,
  ): { area: Area; point: Pt; slot: Pt | null } {
    const area = areaForPlace(d.place);
    if (d.place.kind === "lobby") {
      const i = lobbyDogs(st, site).findIndex((x) => x.id === d.id);
      const spot = LOBBY_SPOTS[Math.max(0, i) % LOBBY_SPOTS.length]!;
      return { area, point: spot, slot: spot };
    }
    return { area, point: randomIn(area.rect, 0.9), slot: null };
  }

  private syncDogs(s: WorldSnapshot, fresh: boolean) {
    const st = s.state;
    const here = st.dogs.filter((d) => d.site === s.site);
    const ids = new Set(here.map((d) => d.id));
    for (const d of here) {
      let a = this.dogs.get(d.id);
      const tgt = this.targetFor(st, s.site, d);
      if (!a) {
        const arriving =
          this.initialized && !fresh && !this.known.has(d.id) && d.place.kind === "lobby";
        const rig = buildDog(coatFor(d.breed), d.size === "small" ? SMALL : LARGE);
        const tag = makeTag(1.9);
        const start = arriving ? { x: ENTRANCE_OUT.x + 0.7, z: STREET.z - 1.5 } : { ...tgt.point };
        a = {
          id: d.id,
          rig,
          tag,
          pos: start,
          heading: 0,
          path: [],
          speed: d.size === "small" ? 1.6 : 1.9,
          areaKey: tgt.area.key,
          slot: tgt.slot,
          idleUntil: 0,
          phase: Math.random() * 6,
          leaving: false,
          bathUntil: 0,
          size: d.size,
        };
        rig.root.userData["pick"] = { kind: "dog", id: d.id } satisfies WorldPick;
        this.scene.add(rig.root, tag.sprite);
        this.pickables.push(rig.root);
        this.dogs.set(d.id, a);
        if (arriving) {
          a.path = [
            { x: ENTRANCE_OUT.x + 0.7, z: ENTRANCE_OUT.z },
            { x: 0.7, z: ENTRANCE_IN.z },
            tgt.point,
          ];
          this.spawnCustomer({ x: -0.6, z: STREET.z - 1 }, true);
        }
      } else if (
        a.areaKey !== tgt.area.key ||
        (tgt.slot && a.slot && dist(tgt.slot, a.slot) > 0.01)
      ) {
        a.path = routeBetween(a.pos, areaAt(a.pos), tgt.area, tgt.point);
        a.areaKey = tgt.area.key;
        a.slot = tgt.slot;
        a.bathUntil = 0;
      }
      this.known.add(d.id);
      // looks (cosmetics are visual only)
      a.rig.bandana.visible = !!s.looks.bandana || s.looks.star;
      if (a.rig.bandana.visible)
        (a.rig.bandana.material as THREE.MeshLambertMaterial) = mat(
          s.looks.star ? "#1c2f52" : cssToHex(s.looks.bandana!),
        );
      a.rig.collar.material = mat(s.looks.collar ? "#2f6fd6" : "#0057A7");
      a.rig.collar.scale.setScalar(s.looks.collar ? 0.48 : 0.42);
      // tag
      const fight = d.place.kind === "room" && hasScuffle(st, d.site, d.place.group);
      const mism = d.place.kind === "room" && groupOf(d) !== d.place.group;
      const tone =
        s.selected === d.id
          ? "selected"
          : !d.checkedIn
            ? "waiting"
            : fight
              ? "alert"
              : d.place.kind === "recovery"
                ? "calm"
                : "default";
      const sub = !d.checkedIn
        ? "Tap → Check in"
        : fight
          ? "Scuffle! Separate"
          : `${d.size === "small" ? "S" : "L"} · ${d.temper} · ${Math.round(d.happiness)}%${mism ? " ⚠" : ""}${d.boarding ? " 🌙" : ""}${d.visits > 1 ? " 💙" : ""}`;
      a.tag.set(d.name, sub, tone);
    }
    // dogs that left this site's state: walk out with their family (checkout) or vanish (site switch)
    for (const [id, a] of this.dogs) {
      if (ids.has(id) || a.leaving) continue;
      const stillExists = st.dogs.some((d) => d.id === id);
      if (stillExists) {
        this.removeDog(id);
        continue;
      }
      a.leaving = true;
      a.tag.set("Going home!", "See you next time", "calm");
      a.path = [
        ...routeBetween(a.pos, areaAt(a.pos), LOBBY, ENTRANCE_IN),
        ENTRANCE_OUT,
        { x: 0.7, z: STREET.z },
      ];
      this.spawnCustomer({ x: ENTRANCE_IN.x - 0.6, z: ENTRANCE_IN.z }, false);
    }
    // selection ring
    const sel = s.selected ? this.dogs.get(s.selected) : null;
    this.selRing.visible = !!sel;
    if (sel) this.selRing.scale.setScalar(sel.size === "small" ? 0.9 : 1.25);
  }

  private removeDog(id: string) {
    const a = this.dogs.get(id);
    if (!a) return;
    this.scene.remove(a.rig.root, a.tag.sprite);
    a.tag.dispose();
    this.pickables = this.pickables.filter((p) => p !== a.rig.root);
    this.dogs.delete(id);
  }

  // ---------- people ----------
  private spawnCustomer(start: Pt, arriving: boolean) {
    const shirts = ["#e46a96", "#2f9e5b", "#e0a100", "#7a5cc7", "#e2583e", "#3a8fd6"];
    const rig = buildPerson(
      shirts[Math.floor(Math.random() * shirts.length)]!,
      Math.floor(Math.random() * 100),
    );
    rig.root.position.set(start.x, 0, start.z);
    this.scene.add(rig.root);
    const p: PersonActor = {
      rig,
      pos: { ...start },
      heading: 0,
      path: [],
      speed: 1.4,
      waitUntil: 0,
      onArrive: null,
      remove: false,
    };
    if (arriving) {
      p.path = [
        { x: -0.6, z: ENTRANCE_OUT.z },
        { x: -0.6, z: ENTRANCE_IN.z },
        { x: -0.4, z: DESK.z + 1.1 },
      ];
      p.onArrive = () => {
        p.waitUntil = this.t + 3.5;
        p.onArrive = () => {
          p.path = [
            { x: -0.6, z: ENTRANCE_IN.z },
            { x: -0.6, z: ENTRANCE_OUT.z },
            { x: -2.5, z: STREET.z + 1 },
          ];
          p.onArrive = () => {
            p.remove = true;
          };
        };
      };
    } else {
      p.path = [ENTRANCE_OUT, { x: 1.5, z: STREET.z + 1 }];
      p.onArrive = () => {
        p.remove = true;
      };
    }
    this.people.push(p);
  }

  private syncStaff(s: WorldSnapshot, fresh: boolean) {
    const want = s.state.staff;
    const ids = new Set(want.map((x) => x.id));
    for (const [id, p] of this.staff)
      if (!ids.has(id)) {
        this.scene.remove(p.rig.root);
        if (p.tag) {
          this.scene.remove(p.tag.sprite);
          p.tag.dispose();
        }
        this.staff.delete(id);
      }
    want.forEach((m, i) => {
      let p = this.staff.get(m.id);
      const home =
        i === 0
          ? { x: 0.6, z: DESK.z - 1.1 }
          : i === 1
            ? { x: -1.2, z: DESK.z - 1.1 }
            : { x: ROOMS[(i - 2) % 4]!.doorOut.x + 1.2, z: CORRIDOR.z0 + 1.6 };
      if (!p) {
        const rig = buildPerson("#0057A7", i * 13 + 5, true);
        const tag = makeTag(1.4);
        rig.root.position.set(home.x, 0, home.z);
        this.scene.add(rig.root, tag.sprite);
        p = {
          rig,
          pos: { ...home },
          heading: Math.PI,
          path: [],
          speed: 1.6,
          waitUntil: 0,
          onArrive: null,
          remove: false,
          tag,
          staffId: m.id,
          home,
        };
        this.staff.set(m.id, p);
        if (!fresh && this.initialized) {
          p.pos = { ...ENTRANCE_IN };
          p.path = [home];
        }
      }
      p.home = home;
      p.speed = m.energy < 15 ? 0.8 : 1.6;
      p.tag!.set(m.name, m.energy < 15 ? "Resting 😮‍💨" : `Staff · ${Math.round(m.energy)}%`, "calm");
    });
  }

  // ---------- frame ----------
  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.visible || document.hidden) return;
    const t0 = performance.now();
    this.t += dt;
    this.updateCamera(dt);
    this.updateDogs(dt);
    this.updatePeople(dt);
    this.updateFx();
    this.updateFocus();
    this.renderer.render(this.scene, this.camera);
    this.frameMs = this.frameMs * 0.92 + (performance.now() - t0) * 0.08;
  };

  private updateCamera(dt: number) {
    if (this.mode === "overhead") {
      this.target.x = THREE.MathUtils.clamp(this.target.x, BOUNDS.x0 - 2, BOUNDS.x1 + 2);
      this.target.z = THREE.MathUtils.clamp(this.target.z, BOUNDS.z0 - 2, STREET.z);
      this.camera.position.set(
        this.target.x,
        Math.sin(PITCH) * this.distance,
        this.target.z + Math.cos(PITCH) * this.distance,
      );
      this.camera.lookAt(this.target);
      this.camera.fov = 42;
    } else {
      let fx = this.move.x;
      let fy = this.move.y;
      if (this.keys.has("w") || this.keys.has("arrowup")) fy += 1;
      if (this.keys.has("s") || this.keys.has("arrowdown")) fy -= 1;
      if (this.keys.has("a")) fx -= 1;
      if (this.keys.has("d")) fx += 1;
      if (this.keys.has("arrowleft") || this.keys.has("q")) this.yaw += 1.9 * dt;
      if (this.keys.has("arrowright") || this.keys.has("e")) this.yaw -= 1.9 * dt;
      const len = Math.hypot(fx, fy);
      if (len > 1) {
        fx /= len;
        fy /= len;
      }
      const fwd = { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
      const right = { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
      const sp = WALK_SPEED * dt;
      this.me = collide(
        this.me,
        (fwd.x * fy + right.x * fx) * sp,
        (fwd.z * fy + right.z * fx) * sp,
      );
      const bob = len > 0.05 && !this.opts.reducedMotion ? Math.sin(this.t * 9) * 0.025 : 0;
      this.camera.position.set(this.me.x, EYE + bob, this.me.z);
      this.camera.rotation.set(this.pitch, this.yaw, 0, "YXZ");
      this.camera.fov = 68;
    }
    this.camera.updateProjectionMatrix();
  }

  private stepToward(
    pos: Pt,
    target: Pt,
    speed: number,
    dt: number,
  ): { pos: Pt; arrived: boolean; heading: number | null } {
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) return { pos: { ...target }, arrived: true, heading: null };
    const step = Math.min(d, speed * dt);
    return {
      pos: { x: pos.x + (dx / d) * step, z: pos.z + (dz / d) * step },
      arrived: step >= d,
      heading: Math.atan2(dx, dz),
    };
  }

  private updateDogs(dt: number) {
    const st = this.snap?.state;
    for (const [id, a] of this.dogs) {
      let moving = false;
      if (a.path.length) {
        const r = this.stepToward(a.pos, a.path[0]!, a.speed, dt);
        a.pos = r.pos;
        if (r.heading !== null) a.heading = turn(a.heading, r.heading, dt * 8);
        moving = true;
        if (r.arrived) {
          a.path.shift();
          if (!a.path.length && a.leaving) {
            this.removeDog(id);
            continue;
          }
          if (!a.path.length) a.idleUntil = this.t + 1 + Math.random() * 3;
        }
      } else if (a.bathUntil && this.t > a.bathUntil) {
        a.bathUntil = 0;
        const area = this.areaByKey(a.areaKey);
        a.path = routeBetween(a.pos, areaAt(a.pos), area, a.slot ?? randomIn(area.rect, 0.9));
      } else if (!a.bathUntil && this.t > a.idleUntil && !a.leaving) {
        const area = this.areaByKey(a.areaKey);
        if (a.slot) {
          a.path = [
            {
              x: a.slot.x + (Math.random() - 0.5) * 0.4,
              z: a.slot.z + (Math.random() - 0.5) * 0.4,
            },
          ];
        } else if (inRect(a.pos, area.rect)) {
          a.path = [randomIn(area.rect, area.kind === "suite" ? 0.7 : 0.9)];
        } else {
          a.path = routeBetween(a.pos, areaAt(a.pos), area, randomIn(area.rect, 0.9));
        }
        a.idleUntil = this.t + 2 + Math.random() * 4;
      }
      // scuffle jitter
      const dog = st?.dogs.find((d) => d.id === id);
      const fighting =
        !!dog && !!st && dog.place.kind === "room" && hasScuffle(st, dog.site, dog.place.group);
      const jitter =
        fighting && !this.opts.reducedMotion ? Math.sin(this.t * 40 + a.phase) * 0.06 : 0;
      a.rig.root.position.set(a.pos.x + jitter, 0, a.pos.z);
      a.rig.root.rotation.y = a.heading + (fighting ? Math.sin(this.t * 12 + a.phase) * 0.6 : 0);
      const gait = moving ? Math.sin(this.t * 11 + a.phase) : 0;
      a.rig.legs.forEach((l, i) => {
        l.rotation.x = gait * 0.55 * (i % 2 ? 1 : -1) * (i < 2 ? 1 : -1);
      });
      a.rig.body.position.y = moving ? Math.abs(gait) * 0.04 : 0;
      const happy = (dog?.happiness ?? 60) / 100;
      a.rig.tail.rotation.y = Math.sin(this.t * (4 + happy * 12) + a.phase) * (0.25 + happy * 0.5);
      a.rig.head.rotation.x = moving ? 0 : Math.sin(this.t * 1.3 + a.phase) * 0.08;
      const s = a.size === "small" ? SMALL : LARGE;
      a.tag.sprite.position.set(a.pos.x, 1.15 * s + 0.75, a.pos.z);
      const near = this.mode === "overhead" || dist(a.pos, this.me) < 9;
      a.tag.sprite.visible = near;
      const k = this.mode === "overhead" ? Math.max(1, this.distance / 16) : 0.62;
      a.tag.sprite.scale.set(2.1 * k, 0.63 * k, 1);
      if (this.snap?.selected === id) this.selRing.position.set(a.pos.x, 0.03, a.pos.z);
    }
  }

  private updatePeople(dt: number) {
    const all = [...this.people, ...this.staff.values()];
    for (const p of all) {
      let moving = false;
      if (this.t < p.waitUntil) {
        /* waiting at the desk */
      } else if (p.path.length) {
        const r = this.stepToward(p.pos, p.path[0]!, p.speed, dt);
        p.pos = r.pos;
        if (r.heading !== null) p.heading = turn(p.heading, r.heading, dt * 7);
        moving = true;
        if (r.arrived) {
          p.path.shift();
          if (!p.path.length && p.onArrive) {
            const f = p.onArrive;
            p.onArrive = null;
            f();
          }
        }
      } else if (p.onArrive && this.t >= p.waitUntil && p.waitUntil > 0) {
        const f = p.onArrive;
        p.onArrive = null;
        p.waitUntil = 0;
        f();
      } else if (p.staffId && p.home && dist(p.pos, p.home) > 0.2 && Math.random() < dt * 0.25) {
        p.path = routeBetween(p.pos, areaAt(p.pos), areaAt(p.home) ?? LOBBY, p.home);
      }
      p.rig.root.position.set(p.pos.x, 0, p.pos.z);
      p.rig.root.rotation.y = p.heading;
      const sw = moving ? Math.sin(this.t * 8) * 0.5 : 0;
      p.rig.legs[0]!.rotation.x = sw;
      p.rig.legs[1]!.rotation.x = -sw;
      p.rig.arms[0]!.rotation.x = -sw * 0.8;
      p.rig.arms[1]!.rotation.x = sw * 0.8;
      if (p.tag) {
        p.tag.sprite.position.set(p.pos.x, 2.25, p.pos.z);
        p.tag.sprite.visible = this.mode === "overhead" || dist(p.pos, this.me) < 7;
        const k = this.mode === "overhead" ? Math.max(1, this.distance / 16) : 0.66;
        p.tag.sprite.scale.set(1.5 * k, 0.45 * k, 1);
      }
    }
    this.people = this.people.filter((p) => {
      if (!p.remove) return true;
      this.scene.remove(p.rig.root);
      return false;
    });
    for (const [g, d] of this.dust) {
      if (!d.visible) continue;
      const room = ROOMS.find((r) => r.group === g)!;
      d.position.x = (room.rect.x0 + room.rect.x1) / 2 + Math.sin(this.t * 7) * 0.3;
      d.material.rotation = this.t * 3;
      d.scale.setScalar(2 + Math.sin(this.t * 9) * 0.25);
    }
  }

  private spawnFx(emoji: string, at: Pt, delay = 0) {
    const sprite = makeEmojiSprite(emoji, 0.8);
    const from = toV(at, 1.2);
    sprite.position.copy(from);
    this.scene.add(sprite);
    this.fx.push({ sprite, born: this.t + delay, life: 1.6, from, rise: 1.4 });
  }

  private updateFx() {
    this.fx = this.fx.filter((f) => {
      const k = (this.t - f.born) / f.life;
      f.sprite.visible = k >= 0;
      if (k >= 1) {
        this.scene.remove(f.sprite);
        f.sprite.material.map?.dispose();
        f.sprite.material.dispose();
        return false;
      }
      if (k >= 0) {
        f.sprite.position.set(f.from.x + Math.sin(k * 6) * 0.2, f.from.y + k * f.rise, f.from.z);
        f.sprite.material.opacity = 1 - k * k;
      }
      return true;
    });
  }

  /** First-person: what's in front of the player (nearest pup, else room/desk/bath nearby). */
  private updateFocus() {
    if (this.mode !== "walk") return;
    if (this.t - this.focusAt < 0.15) return;
    this.focusAt = this.t;
    const fwd = { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
    let best: { id: string; score: number } | null = null;
    for (const [id, a] of this.dogs) {
      if (a.leaving) continue;
      const dx = a.pos.x - this.me.x;
      const dz = a.pos.z - this.me.z;
      const d = Math.hypot(dx, dz);
      if (d > 3.4 || d < 0.05) continue;
      const cos = (dx * fwd.x + dz * fwd.z) / d;
      if (cos < 0.72) continue;
      const score = d * (2 - cos);
      if (!best || score < best.score) best = { id, score };
    }
    let next: FocusTarget = null;
    if (best) next = { kind: "dog", id: best.id, key: `dog:${best.id}` };
    else {
      const a = areaAt(this.me);
      const nearDesk =
        Math.abs(this.me.x - DESK.x) < DESK.w / 2 + 1.2 && Math.abs(this.me.z - DESK.z) < 2.4;
      if (nearDesk) next = { kind: "place", place: "desk", key: "desk" };
      else if (a?.kind === "room") next = { kind: "room", group: a.group!, key: a.key };
      else if (a?.kind === "suite") next = { kind: "suite", index: a.index!, key: a.key };
      else if (a?.kind === "bath") next = { kind: "place", place: "bath", key: "bath" };
      else if (a?.kind === "recovery") next = { kind: "place", place: "recovery", key: "recovery" };
      else if (a?.kind === "corridor") {
        const door = [...ROOMS, ...SUITES].find((r) => dist(r.doorOut, this.me) < 1.6);
        if (door?.kind === "room") next = { kind: "room", group: door.group!, key: door.key };
        else if (door?.kind === "suite")
          next = { kind: "suite", index: door.index!, key: door.key };
      }
    }
    const key = next?.key ?? "";
    if (key !== this.focusKey) {
      this.focusKey = key;
      this.opts.onFocus(next);
    }
    if (Math.floor(this.t * 2) !== Math.floor((this.t - 0.15) * 2)) this.reportCamera();
  }

  private reportCamera() {
    const p = this.mode === "walk" ? this.me : { x: this.target.x, z: this.target.z };
    this.opts.onCamera?.({ mode: this.mode, x: p.x, z: p.z });
  }

  private areaByKey(k: string): Area {
    return AREAS.find((a) => a.key === k) ?? LOBBY;
  }

  private clearGroup(g: THREE.Group) {
    while (g.children.length) g.remove(g.children[0]!);
  }

  // ---------- input ----------
  private ray = new THREE.Raycaster();
  private pick(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1,
    );
    this.ray.setFromCamera(ndc, this.camera);
    // Dogs first, by on-screen distance from the finger (forgiving for small, moving pups).
    let bestDog: { id: string; px: number } | null = null;
    const radiusPx = this.mode === "overhead" ? 38 : 56;
    for (const [id, a] of this.dogs) {
      if (a.leaving) continue;
      const s = a.size === "small" ? SMALL : LARGE;
      const v = new THREE.Vector3(a.pos.x, 0.5 * s, a.pos.z).project(this.camera);
      if (v.z > 1) continue;
      const sx = r.left + ((v.x + 1) / 2) * r.width;
      const sy = r.top + ((1 - v.y) / 2) * r.height;
      const px = Math.hypot(sx - clientX, sy - clientY);
      if (px < radiusPx && (!bestDog || px < bestDog.px)) bestDog = { id, px };
    }
    if (bestDog) return this.opts.onPick({ kind: "dog", id: bestDog.id });
    const hits = this.ray.intersectObjects(this.pickables, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData["pick"]) o = o.parent;
      if (o) return this.opts.onPick(o.userData["pick"] as WorldPick);
    }
    this.opts.onPick(null);
  }

  private onDown = (e: PointerEvent) => {
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY,
      sx: e.clientX,
      sy: e.clientY,
      t: performance.now(),
    });
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
    if (this.mode === "walk") {
      this.look(dx, dy);
      return;
    }
    if (this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      if (this.pinch0 > 0)
        this.distance = THREE.MathUtils.clamp((this.dist0 * this.pinch0) / Math.max(20, d), 9, 48);
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
    if (moved < 10 && performance.now() - p.t < 600 && this.pointers.size === 0)
      this.pick(e.clientX, e.clientY);
  };
  private onWheel = (e: WheelEvent) => {
    if (this.mode !== "overhead") return;
    e.preventDefault();
    this.zoom(e.deltaY > 0 ? 1.1 : 0.9);
  };
  private onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const k = e.key.toLowerCase();
    const walkKeys = [
      "w",
      "a",
      "s",
      "d",
      "q",
      "e",
      "arrowup",
      "arrowdown",
      "arrowleft",
      "arrowright",
    ];
    if (!walkKeys.includes(k)) return;
    if (this.mode !== "walk" || !this.visible) {
      // overhead: arrow keys pan the camera
      if (
        e.type === "keydown" &&
        this.mode === "overhead" &&
        this.visible &&
        k.startsWith("arrow") &&
        document.activeElement === this.canvas
      ) {
        e.preventDefault();
        if (k === "arrowup") this.target.z -= 1.5;
        if (k === "arrowdown") this.target.z += 1.5;
        if (k === "arrowleft") this.target.x -= 1.5;
        if (k === "arrowright") this.target.x += 1.5;
      }
      return;
    }
    if (
      document.activeElement &&
      document.activeElement !== document.body &&
      document.activeElement !== this.canvas &&
      !(document.activeElement as HTMLElement).dataset["walkKeys"]
    )
      return;
    e.preventDefault();
    if (e.type === "keydown") this.keys.add(k);
    else this.keys.delete(k);
  };
  private onBlur = () => this.keys.clear();

  private bindInput() {
    const c = this.canvas;
    c.addEventListener("pointerdown", this.onDown);
    c.addEventListener("pointermove", this.onMove);
    c.addEventListener("pointerup", this.onUp);
    c.addEventListener("pointercancel", this.onUp);
    c.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKey);
    window.addEventListener("blur", this.onBlur);
  }
  private unbindInput() {
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onUp);
    c.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKey);
    window.removeEventListener("blur", this.onBlur);
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** For tests/QA: where things are in the world right now. */
  debugInfo() {
    return {
      mode: this.mode,
      me: { ...this.me },
      yaw: this.yaw,
      target: { x: this.target.x, z: this.target.z },
      distance: this.distance,
      dogs: [...this.dogs.values()].map((a) => ({
        id: a.id,
        x: a.pos.x,
        z: a.pos.z,
        area: a.areaKey,
        leaving: a.leaving,
        dest: a.path.length ? a.path[a.path.length - 1] : null,
        bathing: a.bathUntil > 0,
      })),
      people: this.people.length,
      staff: this.staff.size,
      frameMs: this.frameMs,
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      focus: this.focusKey,
    };
  }

  /** Screen position of a world point (for QA taps). */
  project(x: number, y: number, z: number) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return {
      x: r.left + ((v.x + 1) / 2) * r.width,
      y: r.top + ((1 - v.y) / 2) * r.height,
      visible: v.z < 1,
    };
  }
}

function turn(cur: number, want: number, k: number) {
  let d = want - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * Math.min(1, k);
}

/** Free bandana colours are stored as CSS oklch(); convert via the browser once, cached. */
const cssCache = new Map<string, string>();
function cssToHex(css: string): string {
  const hit = cssCache.get(css);
  if (hit) return hit;
  let out = "#d23b3b";
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    const g = c.getContext("2d")!;
    g.fillStyle = "#d23b3b";
    g.fillStyle = css;
    g.fillRect(0, 0, 1, 1);
    const [r, gg, b] = g.getImageData(0, 0, 1, 1).data;
    out = `#${[r, gg, b].map((v) => (v ?? 0).toString(16).padStart(2, "0")).join("")}`;
  } catch {
    /* keep default */
  }
  cssCache.set(css, out);
  return out;
}

export function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export { COLLIDERS };
