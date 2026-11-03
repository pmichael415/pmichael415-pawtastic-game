// PAWtastic Daycare Tycoon — personal moments (combined-loop plan, task 1). A settled pup sometimes asks for YOU: its
// favourite game. Answering is a small joy — a happier pup, XP, and a tip the family adds at pickup. Missing one costs
// nothing. Staff never take them; this is the hands-on part that stays yours however big the daycare grows. Pure;
// timing comes from the pup and the day (no dice), so moments never disturb any other randomness.
import { FAVORITE_LABEL, personalityOf, seedFrom, type Favorite } from "@/game/engine";
import { XP, gainXp } from "./progress";
import { fac, withFac } from "./state";
import type { Facility, TDog, TResult, TycoonState } from "./types";
import { fmtTime, logVisit, visitOf } from "./visit";

/** Game minutes a moment waits for you before it quietly fades. */
export const MOMENT_LIFE = 60;
export const MAX_OPEN_MOMENTS = 3;
/** What the family adds at pickup when their pup tells them about it (game coins). */
export const MOMENT_TIP = 5;
export const MOMENT_HAPPY = 15;

export const MOMENT_ASK: Record<Favorite, string> = {
  fetch: "wants to play fetch with you",
  tug: "brought you a rope toy",
  zoomies: "is ready for zoomies with you",
  cuddles: "wants a cuddle from you",
  splash: "wants a splash with you",
};
const MOMENT_DONE: Record<Favorite, (n: string) => string> = {
  fetch: (n) => `${n} drops the ball at your feet, you throw it, and ${n} sprints back with it. Fetch! 🎾`,
  tug: (n) => `${n} tugs the rope toy with all four paws — and lets you win, just once. 🪢`,
  zoomies: (n) => `${n} does three laps of the room and skids to a stop right in front of you. 💨`,
  cuddles: (n) => `${n} leans into you for a long, happy cuddle. 🤗`,
  splash: (n) => `${n} splashes the water bowl at you — happily. 🫧`,
};
/** The button that answers a moment, in the pup's panel. */
export const MOMENT_ACTION: Record<Favorite, string> = { fetch: "Throw the ball", tug: "Play tug", zoomies: "Zoomies together", cuddles: "Give a cuddle", splash: "Splash together" };
const ACTIVITY: Record<Favorite, string> = { fetch: "fetch", tug: "tug-of-war", zoomies: "zoomies", cuddles: "cuddles", splash: "the splashing" };
export const activityOf = (k: Favorite) => ACTIVITY[k];
export { FAVORITE_LABEL };

/** The game minute a pup asks for you on this visit: 45–164 minutes after check-in, set by the pup and the day. */
export function momentAt(f: Facility, d: TDog): number {
  const v = visitOf(f, d);
  const start = v.checkedInAt ?? v.arrived;
  return start + 45 + (seedFrom(`moment:${d.id}:${v.arrivedDay}:${f.day}`) % 120);
}

const settled = (d: TDog) => d.checkedIn && (d.place.kind === "room" || d.place.kind === "bed") && !d.bathing;
const isOpen = (d: TDog) => d.visit?.moment?.state === "open";

/** Opens moments that are due (at most MAX_OPEN_MOMENTS at once) and fades ones nobody answered. While open only. */
export function openMoments(s: TycoonState): TycoonState {
  const f = fac(s);
  let open = f.dogs.filter(isOpen).length;
  let changed = false;
  const dogs = f.dogs.map((d) => {
    const v = d.visit;
    if (!v) return d;
    const m = v.moment;
    if (m && m.state === "open" && (m.day !== f.day || f.clockMin - m.at >= MOMENT_LIFE || !settled(d) || v.ownerHere !== null)) {
      changed = true;
      open--;
      return { ...d, visit: { ...v, moment: { ...m, state: "missed" as const } } };
    }
    if (m || !f.open || open >= MAX_OPEN_MOMENTS || !settled(d) || v.ownerHere !== null) return d;
    if (f.clockMin < momentAt(f, d)) return d;
    changed = true;
    open++;
    return { ...d, visit: { ...v, moment: { kind: personalityOf(d).favorite, at: Math.floor(f.clockMin), day: f.day, state: "open" as const } } };
  });
  return changed ? withFac(s, { ...f, dogs }) : s;
}

/** You answer a pup's moment: its favourite game, with you. */
export function answerMoment(s: TycoonState, dogId: string): TResult {
  const f = fac(s);
  const d = f.dogs.find((x) => x.id === dogId);
  if (!d) return { ok: false, error: "That pup already went home." };
  const m = d.visit?.moment;
  if (!m || m.state !== "open") return { ok: false, error: `${d.name} isn't asking for anything right now.` };
  if (!settled(d)) return { ok: false, error: `${d.name} isn't settled right now.` };
  const v = visitOf(f, d);
  const nf: Facility = {
    ...f,
    dogs: f.dogs.map((x) => (x.id === dogId ? { ...x, happiness: Math.min(100, x.happiness + MOMENT_HAPPY), visit: logVisit({ ...v, moment: { ...m, state: "done" } }, `${activityOf(m.kind)} with you ${fmtTime(f.clockMin)}`) } : x)),
  };
  return { ok: true, state: gainXp(withFac(s, nf), XP.moment), msg: MOMENT_DONE[m.kind](d.name) };
}
