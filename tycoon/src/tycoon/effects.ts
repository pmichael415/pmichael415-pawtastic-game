// PAWtastic Daycare Tycoon — Fun and Appeal (spec §4.4).
import { personalityOf } from "@/game/engine";
import { furnitureDef, outdoorDef } from "./catalog";
import { connectedRooms, roomStatus } from "./connect";
import type { Facility, TDog } from "./types";
import type { PaidItemId } from "@/lib/paidVisuals";
import { isActive, ownedPaid } from "./paid";

export const FUN_CAP = 60;
export const APPEAL_CAP = 50;

/** Fun and Appeal from open outdoor items (by level) and open furniture in working rooms, capped. */
export function funAppeal(f: Facility, owned: ReadonlySet<PaidItemId> = ownedPaid()): { fun: number; appeal: number } {
  let fun = 0;
  let appeal = 0;
  const connected = connectedRooms(f);
  const working = new Set(f.rooms.filter((r) => roomStatus(f, r, connected, owned).working).map((r) => r.uid));
  for (const it of f.items) {
    if (it.closed || !isActive(it.kind, owned)) continue;
    if (it.room === null) {
      const od = outdoorDef(it.kind);
      fun += od?.fun?.[it.level - 1] ?? 0;
      appeal += od?.appeal?.[it.level - 1] ?? 0;
    } else if (working.has(it.room)) {
      const fd = furnitureDef(it.kind);
      fun += fd?.fun ?? 0;
      appeal += fd?.appeal ?? 0;
    }
  }
  return { fun: Math.min(FUN_CAP, fun), appeal: Math.min(APPEAL_CAP, appeal) };
}

const cap = (n: number, max: number) => Math.max(0, Math.min(max, n));
/** Happiness falls more slowly with Fun (and today's decor slowdown), never below half speed. */
export const decayMultiplier = (fun: number, decorSlow = 1) => Math.max(0.5, decorSlow * (1 - cap(fun, FUN_CAP) / 200));
/** Extra happiness from each playtime. */
export const playBonus = (fun: number) => Math.floor(cap(fun, FUN_CAP) / 6);
/** Arrival chance multiplier. */
export const arrivalMultiplier = (appeal: number) => 1 + cap(appeal, APPEAL_CAP) / 100;
/** Extra coins at checkout. */
export const tip = (appeal: number) => Math.floor(cap(appeal, APPEAL_CAP) / 4);

// ---------- what helps a pup at playtime (Stage A: an upgrade's benefit is visible) ----------
/** Furniture helps the pups in its own room: +3 happiness per Fun point there, up to +12. */
export const ROOM_FUN_HAPPY = 3;
export const ROOM_FUN_MAX = 12;
/** Outdoor play areas (Play Yard, Ball Pit, Splash Pool, Agility) add their Fun to every playtime, up to +8. */
export const YARD_FUN_MAX = 8;

export type PlayGain = { base: number; fromFun: number; fromRoom: number; fromYard: number; total: number; topItem: string | null };

/** Happiness one playtime gives this pup, and what helped most. Same base as before (favourite, cuddles). */
export function playGain(f: Facility, dog: TDog, owned: ReadonlySet<PaidItemId> = ownedPaid()): PlayGain {
  const fav = personalityOf(dog).favorite;
  const loves = fav === "fetch" || fav === "tug" || fav === "zoomies" || fav === "cuddles";
  const base = fav === "cuddles" ? 30 : loves ? 35 : 25;
  const fromFun = playBonus(funAppeal(f, owned).fun);
  const roomUid = dog.place.kind === "room" || dog.place.kind === "bed" ? dog.place.room : null;
  const room = roomUid ? f.rooms.find((r) => r.uid === roomUid) ?? null : null;
  const roomWorks = !!room && roomStatus(f, room, connectedRooms(f), owned).working;
  let roomFun = 0;
  let yardFun = 0;
  let top: { name: string; value: number } | null = null;
  const consider = (name: string, value: number) => {
    if (value > 0 && (!top || value > top.value)) top = { name, value };
  };
  for (const it of f.items) {
    if (it.closed || !isActive(it.kind, owned)) continue;
    if (it.room !== null) {
      if (!roomWorks || it.room !== roomUid) continue;
      const fd = furnitureDef(it.kind);
      if (!fd?.fun) continue;
      roomFun += fd.fun;
      consider(fd.name, ROOM_FUN_HAPPY * fd.fun);
    } else {
      const od = outdoorDef(it.kind);
      if (od?.tab !== "play" || !od.fun) continue;
      const v = od.fun[it.level - 1] ?? 0;
      yardFun += v;
      consider(od.name, v);
    }
  }
  const fromRoom = Math.min(ROOM_FUN_MAX, ROOM_FUN_HAPPY * roomFun);
  const fromYard = Math.min(YARD_FUN_MAX, yardFun);
  const picked = top as { name: string; value: number } | null;
  return { base, fromFun, fromRoom, fromYard, total: base + fromFun + fromRoom + fromYard, topItem: picked ? picked.name : null };
}
