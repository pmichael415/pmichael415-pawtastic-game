// PAWtastic Daycare Tycoon — building: validation shared by saves and build actions (spec §4.1–§4.3).
import {
  MAX_DOORS,
  MAX_ROOMS,
  MAX_THINGS,
  ONE_PER_FACILITY,
  ROOM_MAX,
  ROOM_MIN,
  ROOM_TYPE_NAMES,
  furnitureDef,
  isFurniture,
  outdoorDef,
  thingName,
} from "./catalog";
import { containsTile, doorInRange, doorInside, doorOutside, inGrid, isCornerDoor, isOwned, roomTiles, thingTiles, tileKey } from "./grid";
import { reach, roomStatus } from "./connect";
import type { Facility, Placed, Room } from "./types";
import { COLS, DOOR_PRICE, FLOORS, PARCELS, ROWS, SELL_RATE, WALL_COLORS, upgradePrice } from "./catalog";
import { roomPrice } from "./grid";
import { fac, withFac } from "./state";
import { buildXp, gainXp, level } from "./progress";
import { spend } from "./business";
import type { Door, FloorStyle, ParcelId, Rot, RoomType, TResult, ThingKind, TycoonState } from "./types";
import type { GroupId } from "@/game/engine";

const roomLabel = (r: Room) => (r.type ? ROOM_TYPE_NAMES[r.type] : "room");

/** Why a room can't be where it is (null if it can). Ignores the room with uid `ignoreUid` (for moves). */
export function validRoomAt(f: Facility, room: Room, ignoreUid: string | null = null): string | null {
  const ints = [room.c, room.r, room.w, room.d].every((n) => Number.isInteger(n));
  if (!ints || room.w < ROOM_MIN || room.w > ROOM_MAX || room.d < ROOM_MIN || room.d > ROOM_MAX) return "Rooms are 2–10 squares a side.";
  const tiles = roomTiles(room);
  if (tiles.some((t) => !inGrid(t.c, t.r) || !isOwned(f.land, t.c, t.r))) return "Buy this land first.";
  const others = f.rooms.filter((r) => r.uid !== room.uid && r.uid !== ignoreUid);
  const isNew = !f.rooms.some((r) => r.uid === room.uid);
  if (isNew && others.length >= MAX_ROOMS) return `A daycare can have up to ${MAX_ROOMS} rooms.`;
  for (const o of others) if (tiles.some((t) => containsTile(o, t))) return `Overlaps the ${roomLabel(o)}.`;
  const outdoor = f.items.filter((i) => i.room === null && i.uid !== ignoreUid);
  for (const it of outdoor) {
    const hit = thingTiles(it).some((t) => containsTile(room, t));
    if (hit) return it.uid === "entrance" ? "Overlaps the entrance." : `Overlaps the ${thingName(it.kind)}.`;
  }
  if (room.doors.length > MAX_DOORS) return `A room can have up to ${MAX_DOORS} doors.`;
  const seen = new Set<string>();
  for (const d of room.doors) {
    if (!doorInRange(room, d)) return "That door isn't on this room's wall.";
    if (isCornerDoor(room, d)) return "Doors can't go on corners.";
    const k = `${d.side}${d.i}`;
    if (seen.has(k)) return "There's already a door there.";
    seen.add(k);
  }
  if (room.type && ONE_PER_FACILITY.includes(room.type) && others.some((o) => o.type === room.type))
    return `Only one ${ROOM_TYPE_NAMES[room.type]} per daycare.`;
  return null;
}

const pluralName = (name: string) => {
  const [first, ...rest] = name.split(" ");
  return [first, ...rest.map((w) => w.toLowerCase())].join(" ") + "s";
};

/** The room that fully contains these tiles, if any. */
export function roomContaining(f: Facility, tiles: { c: number; r: number }[]): Room | null {
  return f.rooms.find((room) => tiles.every((t) => containsTile(room, t))) ?? null;
}

/** Why a thing can't be where it is (null if it can). Ignores `ignoreUid` (for moves). */
export function validThingAt(f: Facility, thing: Placed, ignoreUid: string | null = null): string | null {
  const furniture = isFurniture(thing.kind);
  const def = furniture ? furnitureDef(thing.kind) : outdoorDef(thing.kind);
  if (!def) return "Unknown item.";
  if (![0, 1, 2, 3].includes(thing.rot)) return "Unknown rotation.";
  const tiles = thingTiles(thing);
  if (tiles.some((t) => !inGrid(t.c, t.r) || !isOwned(f.land, t.c, t.r))) return "Buy this land first.";
  const others = f.items.filter((i) => i.uid !== thing.uid && i.uid !== ignoreUid);
  const isNew = !f.items.some((i) => i.uid === thing.uid);
  if (isNew && others.length >= MAX_THINGS) return `This daycare is full (${MAX_THINGS} things).`;
  const max = def.maxPerFacility;
  if (max && others.filter((o) => o.kind === thing.kind).length >= max) return `Only one ${def.name} per daycare.`;
  if (furniture) {
    const fd = furnitureDef(thing.kind)!;
    const room = roomContaining(f, tiles);
    if (!room) return "Furniture goes inside a room.";
    if (fd.allowed !== "any") {
      if (!room.type) return "Pick this room's type first.";
      if (!fd.allowed.includes(room.type)) return `${pluralName(fd.name)} go in a ${fd.allowed.map((t) => ROOM_TYPE_NAMES[t]).join(" or ")}.`;
    }
    const keys = new Set(tiles.map((t) => tileKey(t.c, t.r)));
    for (const o of others.filter((o) => o.room === room.uid)) if (thingTiles(o).some((t) => keys.has(tileKey(t.c, t.r)))) return `Overlaps the ${thingName(o.kind)}.`;
    return null;
  }
  for (const room of f.rooms) if (tiles.some((t) => containsTile(room, t))) return `Overlaps the ${roomLabel(room)}.`;
  const keys = new Set(tiles.map((t) => tileKey(t.c, t.r)));
  for (const o of others.filter((o) => o.room === null))
    if (thingTiles(o).some((t) => keys.has(tileKey(t.c, t.r)))) return o.uid === "entrance" ? "Overlaps the entrance." : `Overlaps the ${thingName(o.kind)}.`;
  return null;
}

// ---------- actions ----------

/** Pays for building (rooms, doors, things, upgrades, land) and earns XP for it. */
function build(s: TycoonState, amount: number): TResult {
  const paid = spend(s, amount, "building");
  return paid.ok ? { ...paid, state: gainXp(paid.state, buildXp(amount)) } : paid;
}

const dogsIn = (f: Facility, roomUid: string) => {
  const isLobby = f.rooms.some((r) => r.uid === roomUid && r.type === "lobby");
  return f.dogs.some((d) => (d.place.kind === "lobby" ? isLobby : d.place.room === roomUid));
};
const findRoom = (f: Facility, uid: string) => f.rooms.find((r) => r.uid === uid) ?? null;
const sameDoor = (a: Door, b: Door) => a.side === b.side && a.i === b.i;
const refund = (spent: number) => Math.floor(SELL_RATE * spent);

export function drawRoom(s: TycoonState, c: number, r: number, w: number, d: number): TResult {
  const f = fac(s);
  const room: Room = { uid: "r" + s.seq, c, r, w, d, type: null, group: null, doors: [], floor: "wood", wall: WALL_COLORS[0]!, spent: 0, closed: false };
  const why = validRoomAt(f, room);
  if (why) return { ok: false, error: why };
  const price = roomPrice(w, d);
  const paid = build(s, price);
  if (!paid.ok) return paid;
  const nf = fac(paid.state);
  return { ok: true, state: withFac({ ...paid.state, seq: s.seq + 1 }, { ...nf, rooms: [...nf.rooms, { ...room, spent: price }] }), msg: "Room built! Now pick what it's for." };
}

function updateRoom(s: TycoonState, room: Room): TycoonState {
  const f = fac(s);
  return withFac(s, { ...f, rooms: f.rooms.map((r) => (r.uid === room.uid ? room : r)) });
}

export function addDoor(s: TycoonState, roomUid: string, door: Door): TResult {
  const f = fac(s);
  const room = findRoom(f, roomUid);
  if (!room) return { ok: false, error: "That room is gone." };
  if (room.doors.some((d) => sameDoor(d, door))) return { ok: false, error: "There's already a door there." };
  if (room.doors.length >= 4) return { ok: false, error: "A room can have up to 4 doors." };
  const trial = { ...room, doors: [...room.doors, door] };
  const why = validRoomAt(f, trial);
  if (why) return { ok: false, error: why };
  const paid = build(s, DOOR_PRICE);
  if (!paid.ok) return paid;
  return { ok: true, state: updateRoom(paid.state, { ...trial, spent: room.spent + DOOR_PRICE }), msg: "Door added." };
}

export function removeDoor(s: TycoonState, roomUid: string, door: Door): TResult {
  const f = fac(s);
  const room = findRoom(f, roomUid);
  if (!room || !room.doors.some((d) => sameDoor(d, door))) return { ok: false, error: "There's no door there." };
  const back = refund(DOOR_PRICE);
  const next = { ...room, doors: room.doors.filter((d) => !sameDoor(d, door)), spent: Math.max(0, room.spent - DOOR_PRICE) };
  return { ok: true, state: { ...updateRoom(s, next), coins: s.coins + back }, msg: `Door removed (+${back}).` };
}

export function setRoomType(s: TycoonState, roomUid: string, type: RoomType, group?: GroupId): TResult {
  const f = fac(s);
  const room = findRoom(f, roomUid);
  if (!room) return { ok: false, error: "That room is gone." };
  if (dogsIn(f, roomUid)) return { ok: false, error: "Move the dogs out first." };
  if (type === "playroom" && !group) return { ok: false, error: "Pick a group for this playroom." };
  const next: Room = { ...room, type, group: type === "playroom" ? group! : null };
  const why = validRoomAt(f, next);
  if (why) return { ok: false, error: why };
  const misfit = f.items.find((i) => {
    if (i.room !== roomUid) return false;
    const fd = furnitureDef(i.kind);
    return !!fd && fd.allowed !== "any" && !fd.allowed.includes(type);
  });
  if (misfit) return { ok: false, error: `Remove the ${thingName(misfit.kind)} first.` };
  return { ok: true, state: updateRoom(s, next), msg: `It's a ${ROOM_TYPE_NAMES[type]} now.` };
}

export function paintRoom(s: TycoonState, roomUid: string, floor: FloorStyle, wall: string): TResult {
  const room = findRoom(fac(s), roomUid);
  if (!room) return { ok: false, error: "That room is gone." };
  if (!FLOORS.includes(floor) || !WALL_COLORS.includes(wall)) return { ok: false, error: "Pick one of the offered floors and colours." };
  return { ok: true, state: updateRoom(s, { ...room, floor, wall }), msg: "Fresh paint!" };
}

export function moveRoom(s: TycoonState, roomUid: string, c: number, r: number): TResult {
  const f = fac(s);
  const room = findRoom(f, roomUid);
  if (!room) return { ok: false, error: "That room is gone." };
  if (dogsIn(f, roomUid)) return { ok: false, error: "Move the dogs out first." };
  const dc = c - room.c;
  const dr = r - room.r;
  const moved = { ...room, c, r };
  const why = validRoomAt(f, moved, roomUid);
  if (why) return { ok: false, error: why };
  const items = f.items.map((i) => (i.room === roomUid ? { ...i, c: i.c + dc, r: i.r + dr } : i));
  return { ok: true, state: withFac(s, { ...f, rooms: f.rooms.map((x) => (x.uid === roomUid ? moved : x)), items }), msg: "Room moved." };
}

export function sellRoom(s: TycoonState, roomUid: string): TResult {
  const f = fac(s);
  const room = findRoom(f, roomUid);
  if (!room) return { ok: false, error: "That room is gone." };
  if (dogsIn(f, roomUid)) return { ok: false, error: "Move the dogs out first." };
  const contents = f.items.filter((i) => i.room === roomUid);
  const back = refund(room.spent + contents.reduce((a, i) => a + i.spent, 0));
  const next = {
    ...f,
    rooms: f.rooms.filter((x) => x.uid !== roomUid),
    items: f.items.filter((i) => i.room !== roomUid),
    scuffles: f.scuffles.filter((x) => x.room !== roomUid),
  };
  return { ok: true, state: { ...withFac(s, next), coins: s.coins + back }, msg: `Sold for ${back} coins.` };
}

// ---------- furniture, outdoor items, paths, land ----------

const findThing = (f: Facility, uid: string) => f.items.find((i) => i.uid === uid) ?? null;
const defOf = (kind: string) => furnitureDef(kind) ?? outdoorDef(kind);
const roomOf = (f: Facility, thing: Placed) => (isFurniture(thing.kind) ? (roomContaining(f, thingTiles(thing))?.uid ?? null) : null);
/** Furniture whose room holds dogs is "in use". Outdoor items never hold dogs in stage 1. */
const inUse = (f: Facility, thing: Placed) => thing.room !== null && dogsIn(f, thing.room);

export function placeThing(s: TycoonState, kind: ThingKind, c: number, r: number, rot: Rot): TResult {
  const def = defOf(kind);
  if (!def) return { ok: false, error: "Unknown item." };
  if (def.unlock > level(s)) return { ok: false, error: `Unlocks at level ${def.unlock}.` };
  const f = fac(s);
  const draft: Placed = { uid: "t" + s.seq, kind, c, r, rot, level: 1, spent: def.price, room: null, closed: false };
  const thing = { ...draft, room: roomOf(f, draft) };
  const why = validThingAt(f, thing);
  if (why) return { ok: false, error: why };
  const paid = build(s, def.price);
  if (!paid.ok) return paid;
  const nf = fac(paid.state);
  return { ok: true, state: withFac({ ...paid.state, seq: s.seq + 1 }, { ...nf, items: [...nf.items, thing] }), msg: `${def.name} placed!` };
}

export function moveThing(s: TycoonState, uid: string, c: number, r: number, rot: Rot): TResult {
  if (uid === "entrance") return { ok: false, error: "The entrance stays." };
  const f = fac(s);
  const thing = findThing(f, uid);
  if (!thing) return { ok: false, error: "That's gone." };
  if (inUse(f, thing)) return { ok: false, error: "Move the dogs out first." };
  const draft = { ...thing, c, r, rot };
  const moved = { ...draft, room: roomOf(f, draft) };
  const why = validThingAt(f, moved);
  if (why) return { ok: false, error: why };
  return { ok: true, state: withFac(s, { ...f, items: f.items.map((i) => (i.uid === uid ? moved : i)) }), msg: "Moved." };
}

export function upgradeThing(s: TycoonState, uid: string): TResult {
  const f = fac(s);
  const thing = findThing(f, uid);
  if (!thing) return { ok: false, error: "That's gone." };
  const od = outdoorDef(thing.kind);
  if (!od || od.levels === 1) return { ok: false, error: "This can't be upgraded." };
  if (thing.level >= 3) return { ok: false, error: "Already at the top level." };
  const to = (thing.level + 1) as 2 | 3;
  const price = upgradePrice(od.price, to);
  const paid = build(s, price);
  if (!paid.ok) return paid;
  const nf = fac(paid.state);
  const next = { ...thing, level: to, spent: thing.spent + price };
  return { ok: true, state: withFac(paid.state, { ...nf, items: nf.items.map((i) => (i.uid === uid ? next : i)) }), msg: `${od.name} is level ${to}!` };
}

export function sellThing(s: TycoonState, uid: string): TResult {
  if (uid === "entrance") return { ok: false, error: "The entrance stays." };
  const f = fac(s);
  const thing = findThing(f, uid);
  if (!thing) return { ok: false, error: "That's gone." };
  if (inUse(f, thing)) return { ok: false, error: "Move the dogs out first." };
  const back = refund(thing.spent);
  return { ok: true, state: { ...withFac(s, { ...f, items: f.items.filter((i) => i.uid !== uid) }), coins: s.coins + back }, msg: `Sold for ${back} coins.` };
}

/** Paves every free, owned square in `tiles` (as many as the coins cover). */
export function paintPaths(s: TycoonState, tiles: { c: number; r: number }[]): TResult {
  const price = outdoorDef("path")!.price;
  let f = fac(s);
  let seq = s.seq;
  let paved = 0;
  let blocked = false;
  const seen = new Set<string>();
  for (const t of tiles) {
    const k = tileKey(t.c, t.r);
    if (seen.has(k)) continue;
    seen.add(k);
    const path: Placed = { uid: "t" + seq, kind: "path", c: t.c, r: t.r, rot: 0, level: 1, spent: price, room: null, closed: false };
    if (validThingAt(f, path)) continue;
    if (s.coins < (paved + 1) * price) {
      blocked = true;
      break;
    }
    f = { ...f, items: [...f.items, path] };
    seq++;
    paved++;
  }
  if (paved === 0) return blocked ? { ok: false, error: `Need ${price - s.coins} more coins.` } : { ok: false, error: "There's no free square to pave there." };
  const paid = build({ ...s, seq }, paved * price);
  if (!paid.ok) return paid;
  return { ok: true, state: withFac(paid.state, { ...fac(paid.state), items: f.items }), msg: `Paved ${paved} square${paved === 1 ? "" : "s"}.` };
}

export function buyLand(s: TycoonState, parcel: ParcelId): TResult {
  const p = PARCELS.find((x) => x.id === parcel);
  if (!p) return { ok: false, error: "Unknown land." };
  if (fac(s).land.includes(parcel)) return { ok: false, error: "You already own this land." };
  if (p.level > level(s)) return { ok: false, error: `Unlocks at level ${p.level}.` };
  const paid = build(s, p.price);
  if (!paid.ok) return paid;
  const nf = fac(paid.state);
  return { ok: true, state: withFac(paid.state, { ...nf, land: [...nf.land, parcel] }), msg: `The ${p.name} is yours!` };
}

/** Opens or closes a room or a thing. Closed things cost nothing and do nothing. */
export function setClosed(s: TycoonState, uid: string, closed: boolean): TResult {
  if (uid === "entrance") return { ok: false, error: "The entrance stays open." };
  const f = fac(s);
  const msg = closed ? "Closed — it costs nothing and does nothing." : "Open again.";
  if (findRoom(f, uid)) return { ok: true, state: withFac(s, { ...f, rooms: f.rooms.map((r) => (r.uid === uid ? { ...r, closed } : r)) }), msg };
  if (findThing(f, uid)) return { ok: true, state: withFac(s, { ...f, items: f.items.map((i) => (i.uid === uid ? { ...i, closed } : i)) }), msg };
  return { ok: false, error: "That's gone." };
}

// ---------- "Place in first free spot" (the list view's builder) ----------

/** Default room sizes for the list view. Calm and Staff rooms are 3 × 2 so they can have a door of their own. */
export const DEFAULT_ROOM_SIZE: Record<RoomType, { w: number; d: number }> = {
  lobby: { w: 4, d: 3 },
  playroom: { w: 3, d: 3 },
  calm: { w: 3, d: 2 },
  bath: { w: 3, d: 2 },
  boarding: { w: 3, d: 3 },
  staff: { w: 3, d: 2 },
};
export type FirstFree = ThingKind | { room: RoomType; group?: GroupId };

const SIDES = ["S", "E", "W", "N"] as const;

/** The cheapest door for a room at this spot and the new path tiles it needs to reach the entrance, or null. */
function cheapestDoor(f: Facility, room: Room, reached: { rooms: Set<string>; tiles: Set<string> }): { door: Door; paths: { c: number; r: number }[] } | null {
  const blocked = new Set<string>();
  for (const x of f.rooms) for (const t of roomTiles(x)) blocked.add(tileKey(t.c, t.r));
  for (const t of roomTiles(room)) blocked.add(tileKey(t.c, t.r));
  for (const i of f.items) if (i.kind !== "path") for (const t of thingTiles(i)) blocked.add(tileKey(t.c, t.r));
  const free = (c: number, r: number) => inGrid(c, r) && isOwned(f.land, c, r) && !blocked.has(tileKey(c, r));
  let best: { door: Door; paths: { c: number; r: number }[] } | null = null;
  for (const side of SIDES) {
    const len = side === "N" || side === "S" ? room.w : room.d;
    for (let i = 1; i < len - 1; i++) {
      const door: Door = { side, i };
      const out = doorOutside(room, door);
      const k = tileKey(out.c, out.r);
      const into = f.rooms.find((x) => containsTile(x, out));
      if (into) {
        if (reached.rooms.has(into.uid)) return { door, paths: [] };
        continue;
      }
      if (reached.tiles.has(k)) return { door, paths: [] };
      if (!free(out.c, out.r)) continue;
      // Breadth-first over free owned squares to the nearest reached path square.
      const prev = new Map<string, string | null>([[k, null]]);
      const queue = [out];
      let goal: string | null = null;
      while (queue.length && !goal) {
        const t = queue.shift()!;
        for (const sd of SIDES) {
          const n = { c: t.c + (sd === "E" ? 1 : sd === "W" ? -1 : 0), r: t.r + (sd === "S" ? 1 : sd === "N" ? -1 : 0) };
          const nk = tileKey(n.c, n.r);
          if (prev.has(nk)) continue;
          if (reached.tiles.has(nk)) {
            prev.set(nk, tileKey(t.c, t.r));
            goal = tileKey(t.c, t.r);
            break;
          }
          if (!free(n.c, n.r)) continue;
          prev.set(nk, tileKey(t.c, t.r));
          queue.push(n);
        }
      }
      if (!goal) continue;
      const paths: { c: number; r: number }[] = [];
      for (let at: string | null = goal; at; at = prev.get(at) ?? null) {
        const [c, r] = at.split(",").map(Number);
        paths.push({ c: c!, r: r! });
      }
      if (!best || paths.length < best.paths.length) best = { door, paths: paths.reverse() };
    }
  }
  return best;
}

function firstFreeRoom(s: TycoonState, type: RoomType, group?: GroupId): TResult {
  if (type === "playroom" && !group) return { ok: false, error: "Pick a group for this playroom." };
  const f = fac(s);
  const size = DEFAULT_ROOM_SIZE[type];
  const reached = reach(f);
  const shapes = size.w === size.d ? [size] : [size, { w: size.d, d: size.w }];
  let firstWhy: string | null = null;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      for (const sh of shapes) {
        const draft: Room = { uid: "r" + s.seq, c, r, w: sh.w, d: sh.d, type, group: group ?? null, doors: [], floor: "wood", wall: WALL_COLORS[0]!, spent: 0, closed: false };
        const why = validRoomAt(f, draft);
        if (why) {
          if (why.startsWith("Only one")) return { ok: false, error: why };
          firstWhy ??= why;
          continue;
        }
        const plan = cheapestDoor(f, draft, reached);
        if (!plan) continue;
        const total = roomPrice(sh.w, sh.d) + DOOR_PRICE + plan.paths.length * outdoorDef("path")!.price;
        if (s.coins < total) return { ok: false, error: s.coins < 0 ? "Paused until your coins are back above zero." : `Need ${total - s.coins} more coins.` };
        let t = drawRoom(s, c, r, sh.w, sh.d);
        if (!t.ok) return t;
        const uid = "r" + s.seq;
        t = setRoomType(t.state, uid, type, group);
        if (!t.ok) return t;
        t = addDoor(t.state, uid, plan.door);
        if (!t.ok) return t;
        if (plan.paths.length) {
          t = paintPaths(t.state, plan.paths);
          if (!t.ok) return t;
        }
        return { ok: true, state: t.state, msg: `${ROOM_TYPE_NAMES[type]} built and connected!` };
      }
  return { ok: false, error: firstWhy && firstWhy !== "Buy this land first." ? firstWhy : "There's no free spot for this room — buy more land or make space." };
}

function firstFreeThing(s: TycoonState, kind: ThingKind): TResult {
  const f = fac(s);
  const fd = furnitureDef(kind);
  const od = outdoorDef(kind);
  if (!fd && !od) return { ok: false, error: "Unknown item." };
  if ((fd ?? od)!.unlock > level(s)) return { ok: false, error: `Unlocks at level ${(fd ?? od)!.unlock}.` };
  const rots: Rot[] = [0, 1];
  if (fd) {
    const allows = (r: Room) => (fd.allowed === "any" ? true : !!r.type && fd.allowed.includes(r.type));
    const reached = reach(f);
    const rooms = f.rooms.filter(allows);
    if (!rooms.length) return { ok: false, error: fd.allowed === "any" ? "Build a room first." : `Build a ${fd.allowed.map((t) => ROOM_TYPE_NAMES[t]).join(" or ")} first.` };
    // First a room that needs this item to start working, then working rooms, then the rest.
    const fixes: Record<string, string> = {
      front_counter: "Needs a Front Desk Counter",
      dog_bed: "Needs a dog bed or play mat",
      play_mat: "Needs a dog bed or play mat",
      deluxe_bed: "Needs a dog bed or play mat",
      bath_tub: "Needs a bath tub",
      deluxe_tub: "Needs a bath tub",
      boarding_bed: "Needs a boarding bed",
      staff_couch: "Needs a staff couch",
    };
    const rank = (r: Room) => {
      const st = roomStatus(f, r, reached.rooms);
      if (fixes[kind] && st.reason === fixes[kind]) return 0;
      if (st.working) return 1;
      return (r.type ? 2 : 4) + (reached.rooms.has(r.uid) ? 0 : 1);
    };
    rooms.sort((a, b) => rank(a) - rank(b));
    let firstWhy: string | null = null;
    for (const keepDoorways of [true, false])
      for (const room of rooms) {
        const doorways = new Set(room.doors.map((d) => tileKey(doorInside(room, d).c, doorInside(room, d).r)));
        for (let r = room.r; r < room.r + room.d; r++)
          for (let c = room.c; c < room.c + room.w; c++)
            for (const rot of rots) {
              const draft: Placed = { uid: "t" + s.seq, kind, c, r, rot, level: 1, spent: fd.price, room: room.uid, closed: false };
              if (keepDoorways && thingTiles(draft).some((t) => doorways.has(tileKey(t.c, t.r)))) continue;
              const why = validThingAt(f, draft);
              if (why) {
                if (why.startsWith("Only one") || why.startsWith("This daycare is full")) return { ok: false, error: why };
                firstWhy ??= why;
                continue;
              }
              return placeThing(s, kind, c, r, rot);
            }
      }
    return { ok: false, error: `No room has space for a ${fd.name}${firstWhy && !firstWhy.startsWith("Overlaps") && !firstWhy.startsWith("Furniture") ? ` (${firstWhy})` : ""}.` };
  }
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      for (const rot of rots) {
        const draft: Placed = { uid: "t" + s.seq, kind, c, r, rot, level: 1, spent: od!.price, room: null, closed: false };
        const why = validThingAt(f, draft);
        if (why && (why.startsWith("Only one") || why.startsWith("This daycare is full"))) return { ok: false, error: why };
        if (!why) return placeThing(s, kind, c, r, rot);
      }
  return { ok: false, error: "There's no free spot on your land — buy more land or make space." };
}

/** Builds a room (typed, with a door and paths to the entrance) or places a thing at the first free spot. */
export function placeFirstFree(s: TycoonState, what: FirstFree): TResult {
  return typeof what === "string" ? firstFreeThing(s, what) : firstFreeRoom(s, what.room, what.group);
}
