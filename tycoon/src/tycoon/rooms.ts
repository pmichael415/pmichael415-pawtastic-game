// PAWtastic Daycare Tycoon — room names people read, which room a pup is in, and cleanliness per room
// (staff design §3). Pure.
import { caps } from "./connect";
import type { Facility, Room, RoomType, TDog } from "./types";

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
