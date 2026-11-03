// PAWtastic Daycare Tycoon — what each pup is doing, readable from the world (combined-loop plan, task 3). Pure: the
// 3D view and the 2D map both draw from it; nothing here changes the game.
import { inActiveScuffle } from "./run";
import type { Facility, TDog } from "./types";
import { waitStage } from "./waiting";

export type ActivityKind = "needs" | "moment" | "bath" | "play" | "wait" | "rest";
export type Activity = { kind: ActivityKind; emoji: string; label: string };

/** Below this a settled pup needs you (the same line the pup's panel uses for "Needs: play" is 70; this is "now"). */
export const NEEDS_YOU_BELOW = 35;

/**
 * The one bubble over a pup, most urgent first: ❗ needs you, ✨ asking for you, 🫧 in the bath, 🎾 being played with,
 * ⏳ waiting (drop-off or pickup), 💤 resting. A contented pup shows nothing, so the bubbles that do show mean something.
 */
export function dogActivity(f: Facility, d: TDog): Activity | null {
  const wait = waitStage(f, d);
  const placed = d.place.kind === "room" || d.place.kind === "bed";
  if (inActiveScuffle(f, d)) return { kind: "needs", emoji: "❗", label: "scuffle — needs you" };
  if (wait?.stage === "upset") return { kind: "needs", emoji: "❗", label: wait.kind === "dropoff" ? "family upset at the desk" : "family upset at pickup" };
  if (placed && !d.bathing && d.happiness < NEEDS_YOU_BELOW) return { kind: "needs", emoji: "❗", label: "unhappy — needs you" };
  if (d.visit?.moment?.state === "open") return { kind: "moment", emoji: "✨", label: "asking for you" };
  if (d.bathing) return { kind: "bath", emoji: "🫧", label: "in the bath" };
  if (f.staff.some((st) => st.job?.kind === "play" && st.job.phase === "work" && st.job.dog === d.id)) return { kind: "play", emoji: "🎾", label: "playing" };
  if (wait || d.visit?.finishing) return { kind: "wait", emoji: "⏳", label: wait?.kind === "pickup" || d.visit?.finishing ? "family waiting" : "waiting to check in" };
  if (d.place.kind === "bed" || d.place.kind === "calm") return { kind: "rest", emoji: "💤", label: "resting" };
  return null;
}

/** Families standing at the desk: dropping off (until check-in) or picking up. In the order they came. */
export function familiesAtDesk(f: Facility): TDog[] {
  return f.dogs.filter((d) => d.visit && ((!d.checkedIn && d.place.kind === "lobby") || (d.visit.ownerHere !== null && d.visit.ownerHere !== undefined) || !!d.visit.finishing));
}
