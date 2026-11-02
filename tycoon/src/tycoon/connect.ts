// PAWtastic Daycare Tycoon — what's reachable from the entrance and what each room can do (spec §4.2).
import type { GroupId } from "@/game/engine";
import { ENTRANCE, furnitureDef } from "./catalog";
import { doorOutside, roomTiles, stepFrom, tileKey } from "./grid";
import type { Facility, Placed, Room } from "./types";
import type { PaidItemId } from "@/lib/paidVisuals";
import { isActive, ownedPaid } from "./paid";

/**
 * Rooms reachable from the entrance. Walkable: path tiles (4-way) and room floors. A room joins a path tile through
 * one of its doors facing that tile, and joins a neighbour through a door on their shared wall (either room's door).
 * Connections ignore open/closed: closing something doesn't knock down its walls.
 */
export function connectedRooms(f: Facility): Set<string> {
  return reach(f).rooms;
}

/** Rooms and path tiles reachable from the entrance (tile keys "c,r"). */
export function reach(f: Facility): { rooms: Set<string>; tiles: Set<string> } {
  const paths = new Set(f.items.filter((i) => i.kind === "path").map((i) => tileKey(i.c, i.r)));
  const roomAtTile = new Map<string, Room>();
  for (const room of f.rooms) for (const t of roomTiles(room)) roomAtTile.set(tileKey(t.c, t.r), room);
  /** Rooms whose door opens onto this tile (outside the room). */
  const doorsOnto = new Map<string, Room[]>();
  for (const room of f.rooms)
    for (const d of room.doors) {
      const t = doorOutside(room, d);
      const k = tileKey(t.c, t.r);
      doorsOnto.set(k, [...(doorsOnto.get(k) ?? []), room]);
    }

  const reached = new Set<string>();
  const seenTiles = new Set<string>();
  const tiles: { c: number; r: number }[] = [];
  const rooms: Room[] = [];
  const visitTile = (c: number, r: number) => {
    const k = tileKey(c, r);
    if (!paths.has(k) || seenTiles.has(k)) return;
    seenTiles.add(k);
    tiles.push({ c, r });
  };
  const visitRoom = (room: Room | undefined) => {
    if (!room || reached.has(room.uid)) return;
    reached.add(room.uid);
    rooms.push(room);
  };

  visitTile(ENTRANCE.c, ENTRANCE.r);
  while (tiles.length || rooms.length) {
    const t = tiles.pop();
    if (t) {
      for (const side of ["N", "E", "S", "W"] as const) {
        const n = stepFrom(t, side);
        visitTile(n.c, n.r);
      }
      for (const room of doorsOnto.get(tileKey(t.c, t.r)) ?? []) visitRoom(room);
      continue;
    }
    const room = rooms.pop()!;
    for (const d of room.doors) {
      const out = doorOutside(room, d);
      visitTile(out.c, out.r);
      visitRoom(roomAtTile.get(tileKey(out.c, out.r)));
    }
    // Neighbours' doors that open into this room.
    for (const t2 of roomTiles(room)) for (const other of doorsOnto.get(tileKey(t2.c, t2.r)) ?? []) visitRoom(other);
  }
  return { rooms: reached, tiles: seenTiles };
}

export type RoomStatus = { connected: boolean; working: boolean; reason: string | null };

/** Open furniture inside a room (paid pack items count only while their pack is owned). */
const openIn = (f: Facility, room: Room, owned: ReadonlySet<PaidItemId> = ownedPaid()): Placed[] =>
  f.items.filter((i) => i.room === room.uid && !i.closed && isActive(i.kind, owned));
const count = (items: Placed[], ...kinds: string[]) => items.filter((i) => kinds.includes(i.kind)).length;
const spotsOf = (room: Room, items: Placed[]) =>
  Math.min(Math.floor((room.w * room.d) / 2), count(items, "dog_bed", "play_mat", "deluxe_bed", "cloud_bed"));

/** Whether a room works, and the first reason it doesn't. Pass `connected` to reuse one search for many rooms. */
export function roomStatus(f: Facility, room: Room, connected: Set<string> = connectedRooms(f), owned: ReadonlySet<PaidItemId> = ownedPaid()): RoomStatus {
  const isConnected = connected.has(room.uid);
  const items = openIn(f, room, owned);
  const why = (): string | null => {
    if (room.closed) return "Closed";
    if (!isConnected) return "Not connected";
    switch (room.type) {
      case null:
        return "Choose a room type";
      case "lobby":
        return count(items, "front_counter") ? null : "Needs a Front Desk Counter";
      case "playroom":
        return spotsOf(room, items) > 0 ? null : "Needs a dog bed or play mat";
      case "calm":
        return null;
      case "bath":
        return count(items, "bath_tub", "deluxe_tub") ? null : "Needs a bath tub";
      case "boarding":
        return count(items, "boarding_bed") ? null : "Needs a boarding bed";
      case "staff":
        return count(items, "staff_couch") ? null : "Needs a staff couch";
    }
  };
  const reason = why();
  return { connected: isConnected, working: reason === null, reason };
}

export type Caps = {
  lobby: Room | null;
  waiting: number;
  playrooms: { room: Room; group: GroupId; spots: number }[];
  calm: Room[];
  bath: { room: Room; tub: "basic" | "deluxe" } | null;
  /** Every working tub: one bath at a time each (staff design §3). */
  tubs: { uid: string; room: string; kind: "basic" | "deluxe" }[];
  beds: { room: string; bed: string }[];
  staffBoost: number;
};

/** What the working rooms provide. Closed furniture and non-working rooms count for nothing. */
export function caps(f: Facility, owned: ReadonlySet<PaidItemId> = ownedPaid()): Caps {
  const connected = connectedRooms(f);
  const working = f.rooms.filter((r) => roomStatus(f, r, connected, owned).working);
  const out: Caps = { lobby: null, waiting: 0, playrooms: [], calm: [], bath: null, tubs: [], beds: [], staffBoost: 0 };
  for (const room of working) {
    const items = openIn(f, room, owned);
    switch (room.type) {
      case "lobby":
        out.lobby = room;
        out.waiting = Math.min(10, 2 + 2 * count(items, "bench"));
        break;
      case "playroom":
        if (room.group) out.playrooms.push({ room, group: room.group, spots: spotsOf(room, items) });
        break;
      case "calm":
        out.calm.push(room);
        break;
      case "bath": {
        const tub = count(items, "deluxe_tub") ? "deluxe" : "basic";
        if (!out.bath || (tub === "deluxe" && out.bath.tub === "basic")) out.bath = { room, tub };
        for (const t of items.filter((i) => i.kind === "bath_tub" || i.kind === "deluxe_tub")) out.tubs.push({ uid: t.uid, room: room.uid, kind: t.kind === "deluxe_tub" ? "deluxe" : "basic" });
        break;
      }
      case "boarding":
        for (const b of items.filter((i) => i.kind === "boarding_bed")) out.beds.push({ room: room.uid, bed: b.uid });
        break;
      case "staff": {
        const boost = items.reduce((a, i) => a + (furnitureDef(i.kind)?.staffBoost ?? 0), 0);
        out.staffBoost = Math.min(1.5, out.staffBoost + boost);
        break;
      }
    }
  }
  return out;
}

export const OPEN_NEEDS = {
  lobby: "A connected Lobby with a Front Desk Counter",
  playroom: "A connected Playroom with a dog spot",
  calm: "A connected Calm-Down Room",
} as const;

/** Whether the daycare can open, and what's missing (spec §4.4). */
export function canOpen(f: Facility): { ok: boolean; missing: string[] } {
  const c = caps(f);
  const missing: string[] = [];
  if (!c.lobby) missing.push(OPEN_NEEDS.lobby);
  if (!c.playrooms.some((p) => p.spots > 0)) missing.push(OPEN_NEEDS.playroom);
  if (c.calm.length === 0) missing.push(OPEN_NEEDS.calm);
  return { ok: missing.length === 0, missing };
}
