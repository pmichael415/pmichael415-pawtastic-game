// Test-only fixtures for the tycoon engine (Tasks 5–10). Built through the real build actions, so they stay valid.
import { addDoor, drawRoom, paintPaths, placeThing, setRoomType } from "./build";
import { fac, newTycoon } from "./state";
import type { TResult, TycoonState } from "./types";

export const ok = (r: TResult): TycoonState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const newest = (s: TycoonState) => fac(s).rooms[fac(s).rooms.length - 1]!.uid;

/**
 * The guided start: a 4 × 3 Lobby at (16,22) with a south door, a path to the entrance, a counter and a bench; a
 * 3 × 3 small-gentle Playroom east of it (door on the shared wall, 2 dog beds, a water bowl); a 2 × 2 Calm-Down Room
 * west of it (the Lobby's west door).
 */
export function guidedBuild(s: TycoonState): TycoonState {
  s = ok(drawRoom(s, 16, 22, 4, 3));
  const lobby = newest(s);
  s = ok(setRoomType(s, lobby, "lobby"));
  s = ok(addDoor(s, lobby, { side: "S", i: 2 }));
  s = ok(paintPaths(s, [{ c: 18, r: 25 }, { c: 18, r: 26 }]));
  s = ok(placeThing(s, "front_counter", 16, 24, 0));
  s = ok(placeThing(s, "bench", 16, 22, 0));

  s = ok(drawRoom(s, 20, 22, 3, 3));
  const play = newest(s);
  s = ok(setRoomType(s, play, "playroom", "small-gentle"));
  s = ok(addDoor(s, play, { side: "W", i: 1 }));
  s = ok(placeThing(s, "dog_bed", 21, 24, 0));
  s = ok(placeThing(s, "dog_bed", 22, 24, 0));
  s = ok(placeThing(s, "water_bowl", 22, 23, 0));

  s = ok(drawRoom(s, 14, 22, 2, 2));
  s = ok(setRoomType(s, newest(s), "calm"));
  return ok(addDoor(s, lobby, { side: "W", i: 1 }));
}

/**
 * Level 7 with plenty of coins: the guided build plus a Bath Room with a Deluxe Tub north of the Lobby, a Boarding Room
 * with 2 beds east of the bath, and a Staff Room with 2 Staff Couches west of it. Every room works.
 */
export function richState(): TycoonState {
  let s = guidedBuild({ ...newTycoon(0), coins: 20000, xp: 50 * 7 * 6 });
  s = ok(drawRoom(s, 16, 19, 4, 3));
  const bath = newest(s);
  s = ok(setRoomType(s, bath, "bath"));
  s = ok(addDoor(s, bath, { side: "S", i: 2 }));
  s = ok(placeThing(s, "deluxe_tub", 16, 19, 0));

  s = ok(drawRoom(s, 20, 19, 3, 3));
  const boarding = newest(s);
  s = ok(setRoomType(s, boarding, "boarding"));
  s = ok(addDoor(s, boarding, { side: "W", i: 1 }));
  s = ok(placeThing(s, "boarding_bed", 21, 19, 0));
  s = ok(placeThing(s, "boarding_bed", 22, 19, 0));

  s = ok(drawRoom(s, 12, 19, 4, 3));
  const staff = newest(s);
  s = ok(setRoomType(s, staff, "staff"));
  s = ok(addDoor(s, staff, { side: "E", i: 1 }));
  s = ok(placeThing(s, "staff_couch", 12, 19, 0));
  return ok(placeThing(s, "staff_couch", 12, 21, 0));
}
