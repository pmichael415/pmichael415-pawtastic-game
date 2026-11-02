// PAWtastic Daycare Tycoon — how a new daycare starts (Stage A, spec §3.1). Quick start builds a small working
// daycare with the real build rules, so every coin is really spent and both starts end up with the same value.
import { addDoor, drawRoom, paintPaths, placeThing, setRoomType } from "./build";
import { fac } from "./state";
import type { TResult, TycoonState } from "./types";

const must = (r: TResult): TycoonState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const newest = (s: TycoonState) => fac(s).rooms[fac(s).rooms.length - 1]!.uid;

/**
 * The guided layout: a 4 × 3 Lobby at (16,22) with a south door, a path to the entrance, a counter and a bench; a
 * 3 × 3 small-gentle Playroom east of it (door on the shared wall, 2 dog beds, a water bowl); a 2 × 2 Calm-Down Room
 * west of it (the Lobby's west door). Throws if any step is refused.
 */
export function guidedLayout(s: TycoonState): TycoonState {
  s = must(drawRoom(s, 16, 22, 4, 3));
  const lobby = newest(s);
  s = must(setRoomType(s, lobby, "lobby"));
  s = must(addDoor(s, lobby, { side: "S", i: 2 }));
  s = must(paintPaths(s, [{ c: 18, r: 25 }, { c: 18, r: 26 }]));
  s = must(placeThing(s, "front_counter", 16, 24, 0));
  s = must(placeThing(s, "bench", 16, 22, 0));

  s = must(drawRoom(s, 20, 22, 3, 3));
  const play = newest(s);
  s = must(setRoomType(s, play, "playroom", "small-gentle"));
  s = must(addDoor(s, play, { side: "W", i: 1 }));
  s = must(placeThing(s, "dog_bed", 21, 24, 0));
  s = must(placeThing(s, "dog_bed", 22, 24, 0));
  s = must(placeThing(s, "water_bowl", 22, 23, 0));

  s = must(drawRoom(s, 14, 22, 2, 2));
  s = must(setRoomType(s, newest(s), "calm"));
  return must(addDoor(s, lobby, { side: "W", i: 1 }));
}

/** A brand-new save: nothing built, the guide neither finished nor skipped, nobody checked out, no tour yet. */
export function isFreshSave(s: TycoonState): boolean {
  const f = fac(s);
  return f.rooms.length === 0 && !s.guide.done && !s.guide.skipped && (f.stats.checkouts ?? 0) === 0 && !s.tour;
}

/** Quick start: the guided layout plus a Play Mat, the PAWtastic sign and two flower beds, all paid for. */
export function quickStart(s: TycoonState): TResult {
  if (fac(s).rooms.length) return { ok: false, error: "Quick start is for an empty lot." };
  try {
    let q = guidedLayout(s);
    q = must(placeThing(q, "play_mat", 21, 22, 0));
    q = must(placeThing(q, "sign", 20, 26, 0));
    q = must(placeThing(q, "flowers", 16, 26, 0));
    q = must(placeThing(q, "flowers", 17, 26, 0));
    return { ok: true, state: q, msg: "Your daycare is ready — here comes your first pup!" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
