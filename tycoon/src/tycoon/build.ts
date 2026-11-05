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
import { OPPOSITE, containsTile, doorInRange, doorInside, doorOutside, inGrid, isCornerDoor, isOwned, roomTiles, thingTiles, tileKey } from "./grid";
import { connectedRooms as connectedRoomsOf, reach, roomStatus } from "./connect";
import type { Facility, Placed, Room } from "./types";
import { COLS, DOOR_PRICE, FLOORS, PARCELS, ROWS, SELL_RATE, WALL_COLORS, upgradePrice } from "./catalog";
import { roomPrice } from "./grid";
import { fac, withFac } from "./state";
import { buildXp, gainXp, level } from "./progress";
import { recordSale, spend, today } from "./business";
import { PAID_GONE, PAID_LOCK, isActive, ownedPaid } from "./paid";
import type { PaidItemId } from "@/lib/paidVisuals";
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
  return doorLimitError(f, room);
}

/** Every doorway into `room` among `rooms`: its own doors plus doors of other rooms that open into it. */
function waysInto(rooms: Room[], room: Room): number {
  return room.doors.length + rooms.reduce((n, x) => (x.uid === room.uid ? n : n + x.doors.filter((d) => containsTile(room, doorOutside(x, d))).length), 0);
}
/**
 * Never a fifth way into any room (audit gap C): a doorway counts for the room it's on AND the room it opens into, so
 * both are checked. A change may not take a room past MAX_DOORS ways in; a layout already past it (an older save)
 * stays usable, it just can't gain another.
 */
function doorLimitError(f: Facility, trial: Room): string | null {
  const before = f.rooms;
  const after = before.some((r) => r.uid === trial.uid) ? before.map((r) => (r.uid === trial.uid ? trial : r)) : [...before, trial];
  const affected = [trial, ...after.filter((x) => x.uid !== trial.uid && trial.doors.some((d) => containsTile(x, doorOutside(trial, d))))];
  for (const x of affected) {
    const was = before.find((r) => r.uid === x.uid);
    const n = waysInto(after, x);
    if (n > MAX_DOORS && n > (was ? waysInto(before, was) : 0))
      return x.uid === trial.uid ? `A room can have up to ${MAX_DOORS} ways in (its own doors and doorways into it).` : `The ${roomLabel(x)} already has ${MAX_DOORS} ways in.`;
  }
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
  // a pup in the bath is in the bath room's tub (its place is still its playroom)
  const tubs = new Set(f.items.filter((i) => i.room === roomUid).map((i) => i.uid));
  return f.dogs.some((d) => (d.place.kind === "lobby" ? isLobby : d.place.room === roomUid) || (!!d.bathing && !!d.bathTub && tubs.has(d.bathTub)));
};
const findRoom = (f: Facility, uid: string) => f.rooms.find((r) => r.uid === uid) ?? null;
/**
 * Why this change can't happen: it would cut a room with pups inside off from the entrance (never trap pups — empire
 * milestone §2). With nobody inside it's the player's call; the room then shows it isn't connected.
 */
function cutsOff(before: Facility, after: Facility): string | null {
  const was = reach(before).rooms;
  const now = reach(after).rooms;
  const room = after.rooms.find((r) => was.has(r.uid) && !now.has(r.uid) && dogsIn(after, r.uid));
  return room ? `That would cut off the ${roomLabel(room)} with pups inside — move them out first, or add another way in.` : null;
}
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
  const after = updateRoom(s, next);
  const trapped = cutsOff(f, fac(after));
  if (trapped) return { ok: false, error: trapped };
  return { ok: true, state: recordSale(after, back), msg: `Door removed (+${back}).` };
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
  const nf = { ...f, rooms: f.rooms.map((x) => (x.uid === roomUid ? moved : x)), items };
  const trapped = cutsOff(f, nf);
  if (trapped) return { ok: false, error: trapped };
  return { ok: true, state: withFac(s, nf), msg: "Room moved." };
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
  const trapped = cutsOff(f, next);
  if (trapped) return { ok: false, error: trapped };
  return { ok: true, state: recordSale(withFac(s, next), back), msg: `Sold for ${back} coins.` };
}

// ---------- furniture, outdoor items, paths, land ----------

const findThing = (f: Facility, uid: string) => f.items.find((i) => i.uid === uid) ?? null;
const defOf = (kind: string) => furnitureDef(kind) ?? outdoorDef(kind);
const roomOf = (f: Facility, thing: Placed) => (isFurniture(thing.kind) ? (roomContaining(f, thingTiles(thing))?.uid ?? null) : null);
/** Furniture whose room holds dogs is "in use". Outdoor items never hold dogs in stage 1. */
const inUse = (f: Facility, thing: Placed) => thing.room !== null && dogsIn(f, thing.room);

export function placeThing(s: TycoonState, kind: ThingKind, c: number, r: number, rot: Rot, owned: ReadonlySet<PaidItemId> = ownedPaid()): TResult {
  const def = defOf(kind);
  if (!def) return { ok: false, error: "Unknown item." };
  if (!isActive(kind, owned)) return { ok: false, error: PAID_LOCK };
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

export function moveThing(s: TycoonState, uid: string, c: number, r: number, rot: Rot, owned: ReadonlySet<PaidItemId> = ownedPaid()): TResult {
  if (uid === "entrance") return { ok: false, error: "The entrance stays." };
  const f = fac(s);
  const thing = findThing(f, uid);
  if (!thing) return { ok: false, error: "That's gone." };
  if (!isActive(thing.kind, owned)) return { ok: false, error: PAID_GONE };
  if (inUse(f, thing)) return { ok: false, error: "Move the dogs out first." };
  const draft = { ...thing, c, r, rot };
  const moved = { ...draft, room: roomOf(f, draft) };
  const why = validThingAt(f, moved);
  if (why) return { ok: false, error: why };
  const nf = { ...f, items: f.items.map((i) => (i.uid === uid ? moved : i)) };
  const trapped = thing.kind === "path" ? cutsOff(f, nf) : null;
  if (trapped) return { ok: false, error: trapped };
  return { ok: true, state: withFac(s, nf), msg: "Moved." };
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
  const nf = { ...f, items: f.items.filter((i) => i.uid !== uid) };
  const trapped = thing.kind === "path" ? cutsOff(f, nf) : null;
  if (trapped) return { ok: false, error: trapped };
  return { ok: true, state: recordSale(withFac(s, nf), back), msg: `Sold for ${back} coins.` };
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

/**
 * The new path squares a door needs to reach the entrance: [] when it opens into a connected room or onto a connected
 * path, null when there's no way (off your land, blocked, or into a room that isn't connected). Squares already paved
 * aren't counted — they cost nothing.
 */
function routeFor(f: Facility, room: Room, door: Door, reached: { rooms: Set<string>; tiles: Set<string> }): { c: number; r: number }[] | null {
  const blocked = new Set<string>();
  for (const x of f.rooms) for (const t of roomTiles(x)) blocked.add(tileKey(t.c, t.r));
  for (const t of roomTiles(room)) blocked.add(tileKey(t.c, t.r));
  for (const i of f.items) if (i.kind !== "path") for (const t of thingTiles(i)) blocked.add(tileKey(t.c, t.r));
  const paved = new Set(f.items.filter((i) => i.kind === "path").map((i) => tileKey(i.c, i.r)));
  const free = (c: number, r: number) => inGrid(c, r) && isOwned(f.land, c, r) && !blocked.has(tileKey(c, r));
  const out = doorOutside(room, door);
  const k = tileKey(out.c, out.r);
  const into = f.rooms.find((x) => x.uid !== room.uid && containsTile(x, out));
  if (into) return reached.rooms.has(into.uid) ? [] : null;
  if (reached.tiles.has(k)) return [];
  if (!free(out.c, out.r)) return null;
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
  if (!goal) return null;
  const paths: { c: number; r: number }[] = [];
  for (let at: string | null = goal; at; at = prev.get(at) ?? null) {
    if (paved.has(at)) continue;
    const [c, r] = at.split(",").map(Number);
    paths.push({ c: c!, r: r! });
  }
  return paths.reverse();
}

/** The cheapest door for a room at this spot and the new path tiles it needs to reach the entrance, or null. */
function cheapestDoor(f: Facility, room: Room, reached: { rooms: Set<string>; tiles: Set<string> }): { door: Door; paths: { c: number; r: number }[] } | null {
  let best: { door: Door; paths: { c: number; r: number }[] } | null = null;
  for (const side of SIDES) {
    const len = side === "N" || side === "S" ? room.w : room.d;
    for (let i = 1; i < len - 1; i++) {
      const door: Door = { side, i };
      // a doorway that would be a fifth way into this room or the one it opens into is never offered
      if (doorLimitError(f, { ...room, doors: [...room.doors.filter((d) => !sameDoor(d, door)), door] })) continue;
      const paths = routeFor(f, room, door, reached);
      if (!paths) continue;
      if (!paths.length) return { door, paths };
      if (!best || paths.length < best.paths.length) best = { door, paths };
    }
  }
  return best;
}

/**
 * The cheapest way to connect an existing room that isn't connected: a door (reusing one it has when that's cheapest)
 * and the path squares to the entrance, with the price. Null when it's already connected or there's no way.
 */
export type ConnectPlan = {
  door: Door;
  /** The room whose wall gets the door: null for this room, or a connected neighbour's uid (for rooms too small for one). */
  doorOn: string | null;
  newDoor: boolean;
  paths: { c: number; r: number }[];
  cost: number;
  blocked: string | null;
};
export function connectionPlan(f: Facility, roomUid: string): ConnectPlan | null {
  const room = findRoom(f, roomUid);
  if (!room) return null;
  const reached = reach(f);
  if (reached.rooms.has(roomUid)) return null;
  const per = outdoorDef("path")!.price;
  // An existing door only needs its path; a new door costs DOOR_PRICE more. Compare both.
  const fresh = cheapestDoor(f, room, reached);
  let best: ConnectPlan | null = null;
  for (const d of room.doors) {
    const only = routeFor(f, room, d, reached);
    if (only && (!best || only.length * per < best.cost)) best = { door: d, doorOn: null, newDoor: false, paths: only, cost: only.length * per, blocked: null };
  }
  // never a fifth way in: its own doors and any doorway on a neighbour's wall that opens into it all count
  const full = openingsInto(f, room) >= MAX_DOORS;
  if (fresh) {
    const exists = room.doors.some((d) => sameDoor(d, fresh.door));
    const cost = (exists ? 0 : DOOR_PRICE) + fresh.paths.length * per;
    if ((exists || !full) && (!best || cost < best.cost)) best = { door: fresh.door, doorOn: null, newDoor: !exists, paths: fresh.paths, cost, blocked: null };
  }
  // a room too small for a door of its own (a 2 × 2): a doorway on a connected neighbour's wall (audit finding 4A)
  if (!full && (!best || best.cost > DOOR_PRICE)) {
    const n = neighbourDoor(f, room, reached);
    if (n) best = { door: n.door, doorOn: n.room, newDoor: true, paths: [], cost: DOOR_PRICE, blocked: null };
  }
  if (best) best.blocked = tooFull(f, best.paths.length);
  return best;
}

/** Why these new path squares won't fit (the daycare's limit of things), or null. */
function tooFull(f: Facility, newSquares: number): string | null {
  return f.items.length + newSquares > MAX_THINGS ? `Your daycare is full (${MAX_THINGS} things) — sell something to make room for ${newSquares} path square${newSquares === 1 ? "" : "s"}.` : null;
}

/** Connects a room that isn't connected, for exactly connectionPlan's price — and, given `shown`, exactly that plan. */
export function connectRoom(s: TycoonState, roomUid: string, shown?: { door: Door; doorOn?: string | null; newDoor: boolean; paths: { c: number; r: number }[]; cost: number }): TResult {
  const plan = connectionPlan(fac(s), roomUid);
  if (!plan) return { ok: false, error: connectedRoomsOf(fac(s)).has(roomUid) ? "It's already connected." : "There's no way to reach it from here — move it or make space." };
  if (plan.blocked) return { ok: false, error: plan.blocked };
  if (shown && (shown.newDoor !== plan.newDoor || planChanged({ door: plan.door, doorOn: plan.doorOn, paths: plan.paths, total: plan.cost }, { door: shown.door, doorOn: shown.doorOn ?? null, paths: shown.paths, cost: { total: shown.cost } })))
    return { ok: false, error: `The way to connect it changed since you saw it (now ${plan.cost} coins) — check it and confirm again.` };
  if (s.coins < plan.cost) return { ok: false, error: `${plan.cost - s.coins} more coins needed.` };
  const before = today(fac(s)).expenses.building;
  let t: TResult = { ok: true, state: s };
  if (plan.newDoor) t = addDoor(s, plan.doorOn ?? roomUid, plan.door);
  if (t.ok && plan.paths.length) t = paintPaths(t.state, plan.paths);
  if (!t.ok) return t;
  // all of it, for exactly the price shown — or nothing
  if (today(fac(t.state)).expenses.building - before !== plan.cost || !connectedRoomsOf(fac(t.state)).has(roomUid)) return { ok: false, error: "That didn't connect it — check the route and try again." };
  return { ok: true, state: t.state, msg: "Connected!" };
}

/** The full cost of a room drawn here: walls and floor, one door, and the new path squares to the entrance. */
export function connectionEstimate(f: Facility, rect: { c: number; r: number; w: number; d: number }): { room: number; door: number; paths: number; total: number } | null {
  const draft: Room = { uid: "estimate", ...rect, type: null, group: null, doors: [], floor: "wood", wall: WALL_COLORS[0]!, spent: 0, closed: false };
  const plan = cheapestDoor(f, draft, reach(f));
  if (!plan) return null;
  const room = roomPrice(rect.w, rect.d);
  const paths = plan.paths.length * outdoorDef("path")!.price;
  return { room, door: DOOR_PRICE, paths, total: room + DOOR_PRICE + paths };
}

export type RoomPlan =
  | {
      ok: true;
      rect: { c: number; r: number; w: number; d: number };
      /** The new door, on the new room (doorOn null) or on a neighbouring room's wall (doorOn = its uid). */
      door: Door;
      doorOn: string | null;
      /** The same doorway seen from the new room, for drawing it on the outline. */
      inner: Door;
      via: string | null;
      paths: { c: number; r: number }[];
      cost: { room: number; door: number; paths: number; total: number };
    }
  | { ok: false; rect: { c: number; r: number; w: number; d: number }; reason: string };

/**
 * Where a new room here would get its entrance, the route, and the full price (empire milestone §2). The door snaps into
 * a neighbouring room you can already reach when there is one; otherwise it opens onto the shortest path to the
 * entrance. Pure: nothing is built or charged.
 */
export function planRoom(f: Facility, rect: { c: number; r: number; w: number; d: number }): RoomPlan {
  const draft: Room = { uid: "plan", ...rect, type: null, group: null, doors: [], floor: "wood", wall: WALL_COLORS[0]!, spent: 0, closed: false };
  const invalid = validRoomAt(f, draft);
  if (invalid) return { ok: false, rect, reason: invalid };
  const reached = reach(f);
  const room = roomPrice(rect.w, rect.d);
  const plan = cheapestDoor(f, draft, reached);
  if (!plan) {
    // too small for a door of its own (a 2 × 2): a door on a neighbouring room's wall that opens into it
    const n = neighbourDoor(f, rect, reached);
    if (!n) return { ok: false, rect, reason: "No way in from here: every side is blocked or off your land. Move it next to a room, or clear a route to the entrance." };
    return { ok: true, rect, door: n.door, doorOn: n.room, inner: n.inner, via: n.room, paths: [], cost: { room, door: DOOR_PRICE, paths: 0, total: room + DOOR_PRICE } };
  }
  const full = tooFull(f, plan.paths.length);
  if (full) return { ok: false, rect, reason: full };
  const out = doorOutside(draft, plan.door);
  const via = plan.paths.length === 0 ? (f.rooms.find((x) => containsTile(x, out) && reached.rooms.has(x.uid))?.uid ?? null) : null;
  const paths = plan.paths.length * outdoorDef("path")!.price;
  return { ok: true, rect, door: plan.door, doorOn: null, inner: plan.door, via, paths: plan.paths, cost: { room, door: DOOR_PRICE, paths, total: room + DOOR_PRICE + paths } };
}

/** Every doorway into a room: its own doors and those on other rooms' walls that open into it. */
function openingsInto(f: Facility, room: Room): number {
  return room.doors.length + f.rooms.reduce((n, x) => (x.uid === room.uid ? n : n + x.doors.filter((d) => containsTile(room, doorOutside(x, d))).length), 0);
}

/** A door on a connected neighbour's wall that opens into this rectangle, and how it looks from inside it. */
function neighbourDoor(f: Facility, rect: { c: number; r: number; w: number; d: number }, reached: { rooms: Set<string> }): { room: string; door: Door; inner: Door } | null {
  for (const x of f.rooms) {
    // never a fifth way into the neighbour either: its own doors and doorways from other rooms all count
    if (!reached.rooms.has(x.uid) || openingsInto(f, x) >= MAX_DOORS) continue;
    for (const side of SIDES) {
      const len = side === "N" || side === "S" ? x.w : x.d;
      for (let i = 1; i < len - 1; i++) {
        const door: Door = { side, i };
        const out = doorOutside(x, door);
        if (!containsTile(rect, out) || x.doors.some((d) => sameDoor(d, door))) continue;
        if (validRoomAt(f, { ...x, doors: [...x.doors, door] })) continue;
        const inner: Door = { side: OPPOSITE[side], i: side === "N" || side === "S" ? out.c - rect.c : out.r - rect.r };
        return { room: x.uid, door, inner };
      }
    }
  }
  return null;
}

/**
 * Builds the planned room in one step — walls and floor, its door, the path squares and its type — for exactly the
 * planned price, or refuses with nothing changed (an invalid spot, no route, not enough coins).
 */
/** What the player saw before confirming: the doorway, the route and the total (audit finding 3). */
export type ShownPlan = { door: Door; doorOn?: string | null; paths: { c: number; r: number }[]; cost: { total: number } };
const samePaths = (a: { c: number; r: number }[], b: { c: number; r: number }[]) => {
  const k = (t: { c: number; r: number }) => tileKey(t.c, t.r);
  const x = new Set(a.map(k));
  return a.length === b.length && b.every((t) => x.has(k(t)));
};
/** Why the plan now differs from the one shown, or null when it's the same (footprint is the caller's rect). */
function planChanged(now: { door: Door; doorOn?: string | null; paths: { c: number; r: number }[]; total: number }, shown: ShownPlan): string | null {
  const same = sameDoor(now.door, shown.door) && (now.doorOn ?? null) === (shown.doorOn ?? null) && samePaths(now.paths, shown.paths) && now.total === shown.cost.total;
  return same ? null : `The plan changed since you saw it (now ${now.total.toLocaleString("en-US")} coins, ${now.paths.length} path square${now.paths.length === 1 ? "" : "s"}) — check it and confirm again.`;
}

export function buildConnectedRoom(s: TycoonState, rect: { c: number; r: number; w: number; d: number }, type: RoomType | null, group?: GroupId, shown?: number | ShownPlan): TResult {
  if (type === "playroom" && !group) return { ok: false, error: "Pick a group for this playroom." };
  const plan = planRoom(fac(s), rect);
  if (!plan.ok) return { ok: false, error: plan.reason };
  // you get exactly what you saw — the doorway, the route and the price — or nothing changes
  if (typeof shown === "number" && shown !== plan.cost.total) return { ok: false, error: `The plan changed since you saw it (now ${plan.cost.total.toLocaleString("en-US")} coins) — check it and confirm again.` };
  if (typeof shown === "object") {
    const why = planChanged({ door: plan.door, doorOn: plan.doorOn, paths: plan.paths, total: plan.cost.total }, shown);
    if (why) return { ok: false, error: why };
  }
  if (s.coins < plan.cost.total) return { ok: false, error: `${(plan.cost.total - s.coins).toLocaleString("en-US")} more coins needed.` };
  const before = fac(s).ledger.find((l) => l.day === fac(s).day)?.expenses.building ?? 0;
  const a = drawRoom(s, rect.c, rect.r, rect.w, rect.d);
  if (!a.ok) return a;
  const uid = fac(a.state).rooms.at(-1)!.uid;
  const b = addDoor(a.state, plan.doorOn ?? uid, plan.door);
  if (!b.ok) return { ok: false, error: b.error };
  const c = plan.paths.length ? paintPaths(b.state, plan.paths) : b;
  if (!c.ok) return { ok: false, error: c.error };
  const t: TResult = type ? setRoomType(c.state, uid, type, group) : c;
  if (!t.ok) return { ok: false, error: t.error };
  const g = fac(t.state);
  const after = g.ledger.find((l) => l.day === g.day)?.expenses.building ?? 0;
  if (after - before !== plan.cost.total || !roomStatus(g, g.rooms.at(-1)!).connected) return { ok: false, error: "That spot changed — check the new price and route and try again." };
  return { ok: true, state: t.state, msg: type ? `${ROOM_TYPE_NAMES[type]} built — connected and ready to furnish.` : "Room built and connected! Now pick what it's for." };
}

/** "Room 270 + door 30 + path 3 × 10 = 330" for the build preview (or what's still needed when there's no route). */
export function costLine(e: { room: number; door: number; paths: number; total: number } | null, roomOnly = 0): string {
  if (!e) return `Room ${roomOnly} · add paths to reach the entrance`;
  const per = outdoorDef("path")!.price;
  return `Room ${e.room} + door ${e.door}${e.paths ? ` + path ${e.paths / per} × ${per}` : ""} = ${e.total}`;
}

/**
 * Where "Place in first free spot" would build this room, with its door, path squares and exact price — or why there's
 * no spot. The list view shows this quote before anything is charged (empire milestone §2).
 */
export function firstFreeRoomPlan(f: Facility, type: RoomType, group?: GroupId): RoomPlan {
  const size = DEFAULT_ROOM_SIZE[type];
  const reached = reach(f);
  const shapes = size.w === size.d ? [size] : [size, { w: size.d, d: size.w }];
  let firstWhy: string | null = null;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      for (const sh of shapes) {
        const rect = { c, r, w: sh.w, d: sh.d };
        const draft: Room = { uid: "plan", ...rect, type, group: group ?? null, doors: [], floor: "wood", wall: WALL_COLORS[0]!, spent: 0, closed: false };
        const why = validRoomAt(f, draft);
        if (why) {
          if (why.startsWith("Only one")) return { ok: false, rect, reason: why };
          firstWhy ??= why;
          continue;
        }
        const plan = cheapestDoor(f, draft, reached);
        if (!plan) continue;
        // too many things for this route's path squares: keep looking — a spot beside a room needs none (finding 4B)
        const full = tooFull(f, plan.paths.length);
        if (full) {
          firstWhy ??= full;
          continue;
        }
        const out = doorOutside(draft, plan.door);
        const via = plan.paths.length === 0 ? (f.rooms.find((x) => containsTile(x, out) && reached.rooms.has(x.uid))?.uid ?? null) : null;
        const room = roomPrice(sh.w, sh.d);
        const paths = plan.paths.length * outdoorDef("path")!.price;
        return { ok: true, rect, door: plan.door, doorOn: null, inner: plan.door, via, paths: plan.paths, cost: { room, door: DOOR_PRICE, paths, total: room + DOOR_PRICE + paths } };
      }
  const reason = firstWhy && firstWhy !== "Buy this land first." ? firstWhy : "There's no free spot for this room — buy more land or make space.";
  return { ok: false, rect: { c: 0, r: 0, w: size.w, d: size.d }, reason };
}

function firstFreeRoom(s: TycoonState, type: RoomType, group?: GroupId): TResult {
  if (type === "playroom" && !group) return { ok: false, error: "Pick a group for this playroom." };
  const plan = firstFreeRoomPlan(fac(s), type, group);
  if (!plan.ok) return { ok: false, error: plan.reason };
  const total = plan.cost.total;
  if (s.coins < total) return { ok: false, error: s.coins < 0 ? "Paused until your coins are back above zero." : `Need ${total - s.coins} more coins.` };
  const t = buildConnectedRoom(s, plan.rect, type, group);
  return t.ok ? { ...t, msg: `${ROOM_TYPE_NAMES[type]} built and connected!` } : t;
}

/** The first free spot for this furniture inside this room (keeping doorways clear when asked), or why there's none. */
function freeSpotIn(f: Facility, seq: number, room: Room, kind: ThingKind, keepDoorways: boolean): { c: number; r: number; rot: Rot } | { why: string | null } {
  const fd = furnitureDef(kind);
  if (!fd) return { why: "Unknown item." };
  const doorways = new Set(room.doors.map((d) => tileKey(doorInside(room, d).c, doorInside(room, d).r)));
  let firstWhy: string | null = null;
  for (let r = room.r; r < room.r + room.d; r++)
    for (let c = room.c; c < room.c + room.w; c++)
      for (const rot of [0, 1] as Rot[]) {
        const draft: Placed = { uid: "t" + seq, kind, c, r, rot, level: 1, spent: fd.price, room: room.uid, closed: false };
        if (keepDoorways && thingTiles(draft).some((t) => doorways.has(tileKey(t.c, t.r)))) continue;
        const why = validThingAt(f, draft);
        if (!why) return { c, r, rot };
        if (why.startsWith("Only one") || why.startsWith("This daycare is full") || why.includes(" go in a ") || why.startsWith("Pick this room")) return { why };
        firstWhy ??= why;
      }
  return { why: firstWhy };
}

/** Where this furniture would go in the chosen room (doorways kept clear when possible), or why it can't go there. */
export function spotInRoom(f: Facility, roomUid: string, kind: ThingKind, seq = 0): { c: number; r: number; rot: Rot } | { error: string } {
  const room = findRoom(f, roomUid);
  const fd = furnitureDef(kind);
  if (!room) return { error: "That room is gone." };
  if (!fd) return { error: "Outdoor items go on your land, not in a room." };
  const a = freeSpotIn(f, seq, room, kind, true);
  if ("c" in a) return a;
  if (a.why && !a.why.startsWith("Overlaps")) return { error: a.why };
  const b = freeSpotIn(f, seq, room, kind, false);
  if ("c" in b) return b;
  return { error: b.why && !b.why.startsWith("Overlaps") ? b.why : `The ${roomLabel(room)} is full — move something or pick another room.` };
}

/** Puts furniture into the room the player chose (empire milestone §2: choose the room first), at its first free spot. */
export function placeInRoom(s: TycoonState, roomUid: string, kind: ThingKind): TResult {
  const spot = spotInRoom(fac(s), roomUid, kind, s.seq);
  if ("error" in spot) return { ok: false, error: spot.error };
  return placeThing(s, kind, spot.c, spot.r, spot.rot);
}

const FIXES: Record<string, string> = {
  front_counter: "Needs a Front Desk Counter",
  dog_bed: "Needs a dog bed or play mat",
  play_mat: "Needs a dog bed or play mat",
  deluxe_bed: "Needs a dog bed or play mat",
  bath_tub: "Needs a bath tub",
  deluxe_tub: "Needs a bath tub",
  boarding_bed: "Needs a boarding bed",
  staff_couch: "Needs a staff couch",
};

/**
 * The rooms this furniture can go in, best first: a room that needs it to start working, then a working room where it
 * does its job (fun where the pups play, waiting spots in the lobby), then other working rooms, then the rest.
 */
export function rankedRoomsFor(f: Facility, kind: ThingKind): Room[] {
  const fd = furnitureDef(kind);
  if (!fd) return [];
  const reached = reach(f);
  const suits = (r: Room) => (fd.fun || fd.spots ? r.type === "playroom" : fd.waiting ? r.type === "lobby" || r.type === "calm" : true);
  const rank = (r: Room) => {
    const st = roomStatus(f, r, reached.rooms);
    if (FIXES[kind] && st.reason === FIXES[kind]) return 0;
    if (st.working) return suits(r) ? 1 : 2;
    return (r.type ? 3 : 5) + (reached.rooms.has(r.uid) ? 0 : 1);
  };
  return f.rooms.filter((r) => (fd.allowed === "any" ? true : !!r.type && fd.allowed.includes(r.type))).sort((a, b) => rank(a) - rank(b));
}

function firstFreeThing(s: TycoonState, kind: ThingKind): TResult {
  const f = fac(s);
  const fd = furnitureDef(kind);
  const od = outdoorDef(kind);
  if (!fd && !od) return { ok: false, error: "Unknown item." };
  if ((fd ?? od)!.unlock > level(s)) return { ok: false, error: `Unlocks at level ${(fd ?? od)!.unlock}.` };
  if (!isActive(kind)) return { ok: false, error: PAID_LOCK };
  const rots: Rot[] = [0, 1];
  if (fd) {
    const rooms = rankedRoomsFor(f, kind);
    if (!rooms.length) return { ok: false, error: fd.allowed === "any" ? "Build a room first." : `Build a ${fd.allowed.map((t) => ROOM_TYPE_NAMES[t]).join(" or ")} first.` };
    let firstWhy: string | null = null;
    for (const keepDoorways of [true, false])
      for (const room of rooms) {
        const spot = freeSpotIn(f, s.seq, room, kind, keepDoorways);
        if ("c" in spot) return placeThing(s, kind, spot.c, spot.r, spot.rot);
        if (spot.why && (spot.why.startsWith("Only one") || spot.why.startsWith("This daycare is full"))) return { ok: false, error: spot.why };
        firstWhy ??= spot.why;
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
