// PAWtastic Daycare Tycoon — Fun and Appeal (spec §4.4).
import { furnitureDef, outdoorDef } from "./catalog";
import { connectedRooms, roomStatus } from "./connect";
import type { Facility } from "./types";
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
