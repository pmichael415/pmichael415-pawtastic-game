// Test-only fixtures for the tycoon engine (Tasks 5–10). Built through the real build actions, so they stay valid.
import { addDoor, drawRoom, placeThing, setRoomType } from "./build";
import { guidedLayout } from "./start";
import { fac, newTycoon } from "./state";
import type { TResult, TycoonState } from "./types";

export const ok = (r: TResult): TycoonState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const newest = (s: TycoonState) => fac(s).rooms[fac(s).rooms.length - 1]!.uid;

/** The guided start layout (now production code in ./start, used by Quick start). */
export const guidedBuild = (s: TycoonState): TycoonState => guidedLayout(s);

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
