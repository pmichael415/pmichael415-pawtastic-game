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
