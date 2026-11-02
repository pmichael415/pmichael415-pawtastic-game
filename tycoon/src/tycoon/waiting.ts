// PAWtastic Daycare Tycoon — families kept waiting (staff design §4): fair, visible stages before anyone leaves.
// Pure. A turn-away is never a wait (it's free); a closed daycare's clock doesn't move.
import type { Facility, TDog } from "./types";

/** A family ignored at the desk this long takes their pup home (upset, no charge). */
export const DESK_GIVES_UP = 60;
export const DESK_IMPATIENT = 20;
export const DESK_UPSET = 40;
/** At pickup: a complaint from 30 (OWNER_PATIENCE), a warning at 45, they leave at 60 (OWNER_GIVES_UP). */
export const PICKUP_IMPATIENT = 30;
export const PICKUP_UPSET = 45;
export const PICKUP_GIVES_UP = 60;

export type WaitStage = { kind: "dropoff" | "pickup"; stage: "waiting" | "impatient" | "upset"; minutes: number; leavesIn: number };

/** How long this family has been waiting, and how they feel about it (null when nobody is waiting). */
export function waitStage(f: Facility, d: TDog): WaitStage | null {
  const v = d.visit;
  if (!v) return null;
  if (!d.checkedIn && d.place.kind === "lobby" && v.arrivedDay === f.day) {
    const minutes = Math.max(0, Math.floor(f.clockMin - v.arrived));
    return { kind: "dropoff", minutes, stage: minutes >= DESK_UPSET ? "upset" : minutes >= DESK_IMPATIENT ? "impatient" : "waiting", leavesIn: Math.max(0, DESK_GIVES_UP - minutes) };
  }
  if (v.ownerHere !== null && v.ownerHere !== undefined) {
    const minutes = Math.max(0, Math.floor(f.clockMin - v.ownerHere));
    return { kind: "pickup", minutes, stage: minutes >= PICKUP_UPSET ? "upset" : minutes >= PICKUP_IMPATIENT ? "impatient" : "waiting", leavesIn: Math.max(0, PICKUP_GIVES_UP - minutes) };
  }
  return null;
}

export const STAGE_WORDS: Record<WaitStage["stage"], string> = { waiting: "Waiting", impatient: "Getting impatient", upset: "Upset" };
