// PAWtastic Daycare Tycoon — room names people read, which room a pup is in, and cleanliness per room
// (staff design §3). Pure.
import { caps, reach } from "./connect";
import { containsTile, doorOutside, inGrid, isOwned, thingTiles, tileKey } from "./grid";
import type { Facility, Room, RoomType, TDog } from "./types";

/** A bath runs this many game minutes (charged at pickup on the receipt, or prepaid at check-in). */
export const BATH_MIN = 40;

const TYPE_NAME: Record<RoomType, string> = { lobby: "Lobby", playroom: "Playroom", calm: "Calm-Down Room", bath: "Bath Room", boarding: "Boarding Room", staff: "Staff Room" };

/** "Lobby", "Playroom" (or "Playroom 2" when there are several), "Bath Room"… */
export function roomName(f: Facility, uid: string): string {
  const room = f.rooms.find((r) => r.uid === uid);
  if (!room) return "a room";
  const name = room.type ? TYPE_NAME[room.type] : "Room";
  const same = f.rooms.filter((r) => r.type === room.type);
  return same.length > 1 ? `${name} ${same.indexOf(room) + 1}` : name;
}

/** "bath station 1"… (every tub in the daycare, in build order). */
export function tubName(f: Facility, uid: string): string {
  const tubs = f.items.filter((i) => i.kind === "bath_tub" || i.kind === "deluxe_tub");
  const i = tubs.findIndex((t) => t.uid === uid);
  return tubs.length > 1 && i >= 0 ? `bath station ${i + 1}` : "the bath station";
}

const lobbyOf = (f: Facility): Room | null => f.rooms.find((r) => r.type === "lobby") ?? null;
/** The room a pup is in (the lobby while waiting), or null if there's no such room. */
export function roomOfDog(f: Facility, d: TDog): string | null {
  if (d.place.kind === "lobby") return lobbyOf(f)?.uid ?? null;
  return d.place.room;
}

export const roomCleanOf = (f: Facility, uid: string | null): number => (uid === null ? f.cleanliness : (f.roomClean?.[uid] ?? f.cleanliness));

/** The daycare's cleanliness: each room's, weighted by the pups in it plus one. */
export function aggregateClean(f: Facility): number {
  if (!f.rooms.length) return f.cleanliness;
  let sum = 0;
  let weight = 0;
  for (const r of f.rooms) {
    const w = f.dogs.filter((d) => roomOfDog(f, d) === r.uid).length + 1;
    sum += roomCleanOf(f, r.uid) * w;
    weight += w;
  }
  return sum / weight;
}

const clamp = (v: number) => Math.max(0, Math.min(100, v));
/** Sets rooms' cleanliness (a function of each room's current value) and keeps the daycare-wide value in step. */
export function setRoomClean(f: Facility, change: (value: number, room: Room) => number): Facility {
  const roomClean = Object.fromEntries(f.rooms.map((r) => [r.uid, clamp(change(roomCleanOf(f, r.uid), r))]));
  const g = { ...f, roomClean };
  return { ...g, cleanliness: aggregateClean(g) };
}

/** Tubs in use by a running bath. */
export const tubsInUse = (f: Facility): Set<string> => new Set(f.dogs.filter((d) => d.bathing && d.bathTub).map((d) => d.bathTub!));
/** The first working tub with no bath running (and not in `alsoBusy`, e.g. tubs staff are walking to), or null. */
export function freeTub(f: Facility, alsoBusy: ReadonlySet<string> = new Set()): string | null {
  const used = tubsInUse(f);
  return caps(f).tubs.find((t) => !used.has(t.uid) && !alsoBusy.has(t.uid))?.uid ?? null;
}
/** Booked baths not started yet, in booking order (check-in time). Only settled pups can go to the bath. */
export function bathQueue(f: Facility): TDog[] {
  return f.dogs
    .filter((d) => d.checkedIn && !d.bathed && !d.bathing && (d.place.kind === "room" || d.place.kind === "bed") && !!d.visit?.requests.includes("bath"))
    .sort((a, b) => (a.visit?.checkedInAt ?? 0) - (b.visit?.checkedInAt ?? 0));
}

/**
 * How a room is reached, in words — or why it isn't (empire milestone §2: let players inspect connections and explain
 * blocked ones). "Way in: a door into the Lobby" / "No door yet — …".
 */
export function wayIn(f: Facility, room: Room): { ok: boolean; text: string } {
  const reached = reach(f);
  // what's reachable without this room: only those are ways *in* (not rooms you reach through it)
  const upstream = reach({ ...f, rooms: f.rooms.filter((x) => x.uid !== room.uid) });
  const paths = new Set(f.items.filter((i) => i.kind === "path").map((i) => tileKey(i.c, i.r)));
  const blocked = new Set<string>();
  for (const i of f.items) if (i.kind !== "path") for (const t of thingTiles(i)) blocked.add(tileKey(t.c, t.r));
  const leads = room.doors.map((d) => {
    const out = doorOutside(room, d);
    const k = tileKey(out.c, out.r);
    const into = f.rooms.find((x) => x.uid !== room.uid && containsTile(x, out)) ?? null;
    const onto = !into && paths.has(k);
    const stuck = !into && !onto && (!inGrid(out.c, out.r) || !isOwned(f.land, out.c, out.r) || blocked.has(k));
    return { into, onto, stuck, way: into ? upstream.rooms.has(into.uid) : onto && upstream.tiles.has(k) };
  });
  // neighbours whose own door opens into this room
  const fromNeighbours = f.rooms.filter((x) => x.uid !== room.uid && x.doors.some((d) => containsTile(room, doorOutside(x, d))));
  if (reached.rooms.has(room.uid)) {
    const ways = [
      ...leads.filter((l) => l.way).map((l) => (l.into ? `a door into the ${roomName(f, l.into.uid)}` : "a door onto the path to the entrance")),
      ...fromNeighbours.filter((x) => upstream.rooms.has(x.uid)).map((x) => `the ${roomName(f, x.uid)}'s door`),
    ];
    const list = [...new Set(ways)];
    return { ok: true, text: `Way in: ${list.length ? list.join(" and ") : "a door"}` };
  }
  if (!room.doors.length && !fromNeighbours.length) return { ok: false, text: "No door yet — add one with Doors (30)." };
  if (leads.some((l) => l.onto)) return { ok: false, text: "Its path doesn't reach the entrance — pave the missing squares (Paths)." };
  if (leads.some((l) => !l.into && !l.onto && !l.stuck)) return { ok: false, text: "Its door opens onto the grass — pave a path from it to the entrance (Paths)." };
  if (leads.length && leads.every((l) => l.stuck)) return { ok: false, text: "Its door is blocked (by something outside it, or land you don't own) — move that, or add a door on another side." };
  const stuck = leads.find((l) => l.into)?.into ?? fromNeighbours[0] ?? null;
  return { ok: false, text: stuck ? `Its door leads into the ${roomName(f, stuck.uid)}, which isn't connected either — connect that first.` : "It can't be reached yet." };
}
