// Low-poly, procedurally built models for the 3D daycare. Everything is made from a handful of
// shared geometries and cached flat-shaded materials so a phone can draw a full daycare cheaply.
// Pure presentation: nothing here reads or writes game state.
import * as THREE from "three";

const matCache = new Map<string, THREE.MeshLambertMaterial>();
export function mat(
  color: string,
  opts: { transparent?: boolean; opacity?: number; emissive?: string } = {},
) {
  const key = `${color}|${opts.opacity ?? 1}|${opts.emissive ?? ""}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({
      color,
      transparent: !!opts.transparent || (opts.opacity ?? 1) < 1,
      opacity: opts.opacity ?? 1,
    });
    if (opts.emissive) m.emissive = new THREE.Color(opts.emissive);
    if (m.transparent) m.depthWrite = false;
    matCache.set(key, m);
  }
  return m;
}

// Shared geometries (unit-sized, scaled per use).
export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sphere: new THREE.SphereGeometry(0.5, 12, 8),
  sphereLo: new THREE.SphereGeometry(0.5, 8, 6),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cylLo: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  cone: new THREE.ConeGeometry(0.5, 1, 8),
  capsule: new THREE.CapsuleGeometry(0.5, 1, 4, 10),
  torus: new THREE.TorusGeometry(0.5, 0.08, 6, 18),
  ring: new THREE.RingGeometry(0.42, 0.5, 28),
  disc: new THREE.CircleGeometry(0.5, 20),
  plane: new THREE.PlaneGeometry(1, 1),
};

export function part(
  geo: THREE.BufferGeometry,
  color: string,
  sx: number,
  sy: number,
  sz: number,
  x = 0,
  y = 0,
  z = 0,
  opts?: Parameters<typeof mat>[1],
) {
  const m = new THREE.Mesh(geo, mat(color, opts));
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  return m;
}

// ---------- Dogs ----------
// Coats are generic colour schemes, chosen by the breed index the engine already stores.
// Nothing about behaviour or temperament is ever derived from these.
export type Coat = {
  body: string;
  head: string;
  ear: string;
  chest: string;
  ears: "flop" | "up";
  muzzle: string;
};
export const COATS: Coat[] = [
  {
    body: "#d9a441",
    head: "#d9a441",
    ear: "#b9822b",
    chest: "#f2d18b",
    ears: "flop",
    muzzle: "#f2d18b",
  }, // golden
  {
    body: "#2e2a2a",
    head: "#2e2a2a",
    ear: "#1d1a1a",
    chest: "#4a4444",
    ears: "flop",
    muzzle: "#4a4444",
  }, // black
  {
    body: "#7a4a2b",
    head: "#7a4a2b",
    ear: "#5c361e",
    chest: "#f3eee6",
    ears: "flop",
    muzzle: "#c79a73",
  }, // chocolate tri
  {
    body: "#f3efe6",
    head: "#f3efe6",
    ear: "#e3d6bd",
    chest: "#ffffff",
    ears: "up",
    muzzle: "#ffffff",
  }, // cream
  {
    body: "#8f8f99",
    head: "#a5a5ae",
    ear: "#6c6c75",
    chest: "#e4e4ea",
    ears: "up",
    muzzle: "#e4e4ea",
  }, // grey
  {
    body: "#c46d33",
    head: "#c46d33",
    ear: "#9a4f22",
    chest: "#f6e7d4",
    ears: "up",
    muzzle: "#f6e7d4",
  }, // red & white
  {
    body: "#3a2f28",
    head: "#a8743f",
    ear: "#3a2f28",
    chest: "#a8743f",
    ears: "up",
    muzzle: "#a8743f",
  }, // black & tan
  {
    body: "#e8e2d6",
    head: "#e8e2d6",
    ear: "#6b4a33",
    chest: "#ffffff",
    ears: "flop",
    muzzle: "#ffffff",
  }, // white w/ brown ears
];
export const coatFor = (breed: number) =>
  COATS[((breed % COATS.length) + COATS.length) % COATS.length]!;

export type DogRig = {
  root: THREE.Group; // positioned in the world, rotated to face heading
  body: THREE.Group; // bobs while walking
  head: THREE.Group;
  tail: THREE.Object3D;
  legs: THREE.Object3D[];
  collar: THREE.Mesh;
  bandana: THREE.Mesh;
  shadow: THREE.Mesh;
};

let shadowTex: THREE.Texture | null = null;
function blobShadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grd.addColorStop(0, "rgba(16,44,73,0.38)");
  grd.addColorStop(1, "rgba(16,44,73,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}
let shadowMat: THREE.MeshBasicMaterial | null = null;
export function blobShadow(size: number) {
  shadowMat ??= new THREE.MeshBasicMaterial({
    map: blobShadowTexture(),
    transparent: true,
    depthWrite: false,
  });
  const m = new THREE.Mesh(GEO.plane, shadowMat);
  m.rotation.x = -Math.PI / 2;
  m.scale.set(size, size, 1);
  m.position.y = 0.012;
  m.renderOrder = 1;
  return m;
}

/** Builds a dog facing +Z. `scale` ≈ 0.62 for small pups, 1 for large. */
export function buildDog(coat: Coat, scale: number): DogRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  // torso (horizontal capsule)
  const torso = part(GEO.capsule, coat.body, 0.34, 0.36, 0.34, 0, 0.5, 0);
  torso.rotation.x = Math.PI / 2;
  body.add(torso);
  body.add(part(GEO.sphereLo, coat.chest, 0.3, 0.3, 0.2, 0, 0.47, 0.3));
  // head
  const head = new THREE.Group();
  head.position.set(0, 0.74, 0.42);
  head.add(part(GEO.sphere, coat.head, 0.36, 0.34, 0.36));
  head.add(part(GEO.box, coat.muzzle, 0.2, 0.15, 0.2, 0, -0.06, 0.2));
  head.add(part(GEO.sphereLo, "#1b1b1b", 0.07, 0.06, 0.06, 0, -0.02, 0.31)); // nose
  head.add(part(GEO.sphereLo, "#141414", 0.055, 0.06, 0.04, -0.09, 0.06, 0.16)); // eyes
  head.add(part(GEO.sphereLo, "#141414", 0.055, 0.06, 0.04, 0.09, 0.06, 0.16));
  if (coat.ears === "flop") {
    const l = part(GEO.box, coat.ear, 0.07, 0.22, 0.13, -0.18, -0.02, -0.02);
    const r = part(GEO.box, coat.ear, 0.07, 0.22, 0.13, 0.18, -0.02, -0.02);
    l.rotation.z = 0.25;
    r.rotation.z = -0.25;
    head.add(l, r);
  } else {
    const l = part(GEO.cone, coat.ear, 0.11, 0.17, 0.07, -0.11, 0.2, -0.03);
    const r = part(GEO.cone, coat.ear, 0.11, 0.17, 0.07, 0.11, 0.2, -0.03);
    l.rotation.z = 0.2;
    r.rotation.z = -0.2;
    head.add(l, r);
  }
  body.add(head);
  // collar + optional bandana (cosmetics recolour these)
  const collar = new THREE.Mesh(GEO.torus, mat("#0057A7"));
  collar.scale.set(0.42, 0.42, 0.5);
  collar.position.set(0, 0.62, 0.34);
  collar.rotation.x = Math.PI / 2.6;
  body.add(collar);
  const bandana = part(GEO.cone, "#d23b3b", 0.26, 0.2, 0.08, 0, 0.5, 0.42);
  bandana.rotation.x = Math.PI;
  bandana.visible = false;
  body.add(bandana);
  // tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.6, -0.33);
  const tail = part(GEO.cylLo, coat.body, 0.06, 0.3, 0.06, 0, 0.13, -0.04);
  tail.rotation.x = -0.6;
  tailPivot.add(tail);
  body.add(tailPivot);
  // legs (pivot at hip so they can swing)
  const legs: THREE.Object3D[] = [];
  for (const [x, z] of [
    [-0.12, 0.2],
    [0.12, 0.2],
    [-0.12, -0.2],
    [0.12, -0.2],
  ] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.38, z);
    pivot.add(part(GEO.cylLo, coat.body, 0.09, 0.38, 0.09, 0, -0.19, 0));
    pivot.add(part(GEO.sphereLo, coat.chest, 0.1, 0.06, 0.12, 0, -0.37, 0.02));
    root.add(pivot);
    legs.push(pivot);
  }
  const shadow = blobShadow(1.0);
  root.add(shadow);
  root.scale.setScalar(scale);
  return { root, body, head, tail: tailPivot, legs, collar, bandana, shadow };
}

// ---------- People ----------
export type PersonRig = { root: THREE.Group; legs: THREE.Object3D[]; arms: THREE.Object3D[] };
const SKIN = ["#f1c9a5", "#d7a27a", "#a8724b", "#7a4e2d", "#e6b896", "#5c3a24"];
const HAIR = ["#2b1d14", "#5a3a22", "#a8763e", "#e0c27a", "#1a1a1a", "#7b2f1f"];
export function buildPerson(shirt: string, seed: number, staff = false): PersonRig {
  const root = new THREE.Group();
  const skin = SKIN[seed % SKIN.length]!;
  const hair = HAIR[(seed * 7) % HAIR.length]!;
  root.add(part(GEO.capsule, shirt, 0.38, 0.32, 0.26, 0, 1.12, 0)); // torso
  root.add(part(GEO.sphere, skin, 0.3, 0.32, 0.3, 0, 1.62, 0)); // head
  root.add(part(GEO.sphereLo, hair, 0.32, 0.18, 0.32, 0, 1.73, -0.02));
  if (staff) {
    // PAWtastic staff: white cap with a blue brim and a name badge
    root.add(part(GEO.cyl, "#ffffff", 0.33, 0.1, 0.33, 0, 1.79, 0));
    root.add(part(GEO.box, "#0057A7", 0.26, 0.03, 0.16, 0, 1.75, 0.18));
    root.add(part(GEO.box, "#ffffff", 0.1, 0.07, 0.02, 0.08, 1.22, 0.14));
  }
  const legs: THREE.Object3D[] = [];
  for (const x of [-0.09, 0.09]) {
    const p = new THREE.Group();
    p.position.set(x, 0.78, 0);
    p.add(part(GEO.cylLo, staff ? "#102c49" : "#3b4a63", 0.13, 0.76, 0.13, 0, -0.38, 0));
    p.add(part(GEO.box, "#222222", 0.13, 0.07, 0.22, 0, -0.76, 0.04));
    root.add(p);
    legs.push(p);
  }
  const arms: THREE.Object3D[] = [];
  for (const x of [-0.24, 0.24]) {
    const p = new THREE.Group();
    p.position.set(x, 1.36, 0);
    p.add(part(GEO.cylLo, shirt, 0.09, 0.5, 0.09, 0, -0.25, 0));
    p.add(part(GEO.sphereLo, skin, 0.09, 0.09, 0.09, 0, -0.52, 0));
    root.add(p);
    arms.push(p);
  }
  root.add(blobShadow(0.9));
  return { root, legs, arms };
}

// ---------- Text sprites (name tags, room signs) ----------
export function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export type Tag = {
  sprite: THREE.Sprite;
  set: (text: string, sub?: string, tone?: TagTone) => void;
  dispose: () => void;
};
export type TagTone = "default" | "waiting" | "alert" | "selected" | "calm";
const TONES: Record<TagTone, { bg: string; fg: string; sub: string }> = {
  default: { bg: "rgba(255,255,255,0.94)", fg: "#102c49", sub: "#0057A7" },
  waiting: { bg: "#ffd34d", fg: "#102c49", sub: "#5a4300" },
  alert: { bg: "#d93636", fg: "#ffffff", sub: "#ffe3e3" },
  selected: { bg: "#0057A7", fg: "#ffffff", sub: "#cfe4ff" },
  calm: { bg: "#e7f1ff", fg: "#102c49", sub: "#0057A7" },
};

/** A camera-facing label. Redraws its canvas only when the text actually changes. */
export function makeTag(width = 1.7): Tag {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 96;
  const g = c.getContext("2d")!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  const m = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(m);
  sprite.scale.set(width, width * 0.3, 1);
  sprite.renderOrder = 10;
  let last = "";
  return {
    sprite,
    set(text, sub = "", tone = "default") {
      const key = `${text}|${sub}|${tone}`;
      if (key === last) return;
      last = key;
      const t = TONES[tone];
      g.clearRect(0, 0, c.width, c.height);
      g.fillStyle = t.bg;
      roundRect(g, 4, 4, c.width - 8, c.height - 8, 30);
      g.fill();
      g.textAlign = "center";
      g.fillStyle = t.fg;
      g.font = `800 ${sub ? 34 : 40}px Nunito, system-ui, sans-serif`;
      g.fillText(text, c.width / 2, sub ? 44 : 61, c.width - 24);
      if (sub) {
        g.fillStyle = t.sub;
        g.font = "700 24px Nunito, system-ui, sans-serif";
        g.fillText(sub, c.width / 2, 76, c.width - 24);
      }
      tex.needsUpdate = true;
    },
    dispose() {
      tex.dispose();
      m.dispose();
    },
  };
}

/** A flat sign board (not camera-facing) for room entrances. */
export function makeSign(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = Math.round((512 * h) / w);
  const g = c.getContext("2d")!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // Two back-to-back single-sided faces, so the text reads correctly (never mirrored) from both sides.
  const material = new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide });
  const mesh = new THREE.Group();
  const front = new THREE.Mesh(GEO.plane, material);
  const back = new THREE.Mesh(GEO.plane, material);
  back.rotation.y = Math.PI;
  mesh.add(front, back);
  mesh.scale.set(w, h, 1);
  let last = "";
  return {
    mesh,
    material,
    draw(lines: { title: string; sub: string; badge: string; color: string; alert?: boolean }) {
      const key = JSON.stringify(lines);
      if (key === last) return;
      last = key;
      g.fillStyle = lines.alert ? "#d93636" : "#102c49";
      roundRect(g, 0, 0, c.width, c.height, 26);
      g.fill();
      g.fillStyle = lines.color;
      roundRect(g, 10, 10, c.width - 20, 14, 7);
      g.fill();
      g.fillStyle = "#ffffff";
      g.textAlign = "left";
      g.font = "800 50px Nunito, system-ui, sans-serif";
      g.fillText(lines.title, 26, 82, c.width - 170);
      g.font = "700 30px Nunito, system-ui, sans-serif";
      g.fillStyle = lines.alert ? "#ffe3e3" : "#b9d8ff";
      g.fillText(lines.sub, 26, c.height - 26, c.width - 170);
      g.fillStyle = "#ffffff";
      roundRect(g, c.width - 140, 40, 116, c.height - 80, 22);
      g.fill();
      g.fillStyle = "#102c49";
      g.textAlign = "center";
      g.font = "800 46px Nunito, system-ui, sans-serif";
      g.fillText(lines.badge, c.width - 82, c.height / 2 + 16, 104);
      tex.needsUpdate = true;
    },
  };
}

/** Emoji/billboard effect (hearts, bubbles, dust cloud). */
export function makeEmojiSprite(emoji: string, size = 0.7) {
  const c = document.createElement("canvas");
  c.width = c.height = 96;
  const g = c.getContext("2d")!;
  g.font = "72px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(emoji, 48, 52);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }),
  );
  s.scale.set(size, size, 1);
  s.renderOrder = 11;
  return s;
}
