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
import { containsTile, doorInRange, inGrid, isCornerDoor, isOwned, roomTiles, thingTiles, tileKey } from "./grid";
import type { Facility, Placed, Room } from "./types";
import { DOOR_PRICE, FLOORS, SELL_RATE, WALL_COLORS } from "./catalog";
import { roomPrice } from "./grid";
import { fac, withFac } from "./state";
import type { Door, ExpenseKey, FloorStyle, RoomType, TResult, TycoonState } from "./types";
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

/** Takes coins for building (Task 7 replaces this with the business ledger version). */
export function spend(s: TycoonState, amount: number, _key: ExpenseKey): TResult {
  if (amount <= 0) return { ok: true, state: s };
  if (s.coins < amount) return { ok: false, error: `Need ${amount - s.coins} more coins.` };
  return { ok: true, state: { ...s, coins: s.coins - amount } };
}

const dogsIn = (f: Facility, roomUid: string) => f.dogs.some((d) => d.place.kind !== "lobby" && d.place.room === roomUid);
const findRoom = (f: Facility, uid: string) => f.rooms.find((r) => r.uid === uid) ?? null;
const sameDoor = (a: Door, b: Door) => a.side === b.side && a.i === b.i;
const refund = (spent: number) => Math.floor(SELL_RATE * spent);

export function drawRoom(s: TycoonState, c: number, r: number, w: number, d: number): TResult {
  const f = fac(s);
  const room: Room = { uid: "r" + s.seq, c, r, w, d, type: null, group: null, doors: [], floor: "wood", wall: WALL_COLORS[0]!, spent: 0, closed: false };
  const why = validRoomAt(f, room);
  if (why) return { ok: false, error: why };
  const price = roomPrice(w, d);
  const paid = spend(s, price, "building");
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
  const paid = spend(s, DOOR_PRICE, "building");
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
