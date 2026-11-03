// PAWtastic Daycare Tycoon — private test scenarios (phone readiness plan, tasks 1 and 6): repeatable daycares for
// measuring and testing on a phone. They live in their own save (store.ts TEST_KEY), never the player's. Pure.
import { groupOf, type GroupId } from "@/game/engine";
import { caps } from "./connect";
import { buyExpansion } from "./expansion";
import { xpForLevel } from "./progress";
import { setOpen } from "./run";
import { quickStart } from "./start";
import { fac, newTycoon, withFac } from "./state";
import { hire } from "./team";
import { defaultVisit } from "./visit";
import type { Role, TDog, TResult, TycoonState } from "./types";

export type ScenarioId = "normal" | "busy";
export const SCENARIOS: { id: ScenarioId; name: string; detail: string }[] = [
  { id: "normal", name: "A normal day", detail: "The quick-start daycare at 10:00 with a receptionist and an attendant, 4 pups placed and 2 families at the desk." },
  { id: "busy", name: "The busy scene", detail: "A grown daycare (playroom wing, two bath stations) with 6 staff and 30 pups: playrooms full, more calming down, families at the desk." },
];

const must = (r: TResult): TycoonState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const DONE_TOUR = { mode: "quick" as const, beat: "goals" as const, startedAt: 0, upgrade: null, done: true, skipped: false };
const BREEDS_BY_GROUP: Record<GroupId, number> = { "small-gentle": 1, "small-active": 3, "large-gentle": 0, "large-active": 2 };

function pup(s: TycoonState, i: number, group: GroupId, place: TDog["place"], checkedIn: boolean, bath: boolean): TDog {
  const f = fac(s);
  const [size, temper] = group.split("-") as [TDog["size"], TDog["temper"]];
  const d: TDog = { id: `t${i}`, name: ["Biscuit", "Luna", "Milo", "Daisy", "Rocky", "Pepper", "Ziggy", "Maple", "Otis", "Hazel"][i % 10]! + (i >= 10 ? ` ${Math.floor(i / 10) + 1}` : ""), breed: BREEDS_BY_GROUP[group] + (i % 2) * 4, size, temper, visits: 1 + (i % 3), place, checkedIn, happiness: 45 + ((i * 7) % 45), clean: 50 + ((i * 11) % 40), boarding: false, played: 0, bathed: false };
  const v = defaultVisit(f, d);
  return { ...d, visit: { ...v, requests: bath ? ["daycare", "bath"] : ["daycare"], arrivedDay: f.day, arrived: checkedIn ? 8 * 60 + i : f.clockMin, checkedInAt: checkedIn ? 8 * 60 + i : null, pickup: 16 * 60 + (i % 6) * 15 } };
}

/** A scenario's starting save. `now` is the real time (for lastSeen). */
export function buildScenario(id: ScenarioId, now: number): TycoonState {
  let s = must(quickStart(newTycoon(now)));
  s = { ...s, tour: DONE_TOUR, lastSeen: now, pendingLevel: null };
  if (id === "normal") {
    s = { ...s, coins: 3000, xp: xpForLevel(3) };
    for (const r of ["reception", "attendant"] as Role[]) s = must(hire(s, r));
  } else {
    s = { ...s, coins: 60000, xp: xpForLevel(6) };
    for (const e of ["playroom", "playroom", "bath", "bath"] as const) s = must(buyExpansion(s, e));
    for (const r of ["reception", "attendant", "attendant", "bath", "cleaner"] as Role[]) s = must(hire(s, r));
  }
  s = must(setOpen(s, true));
  const f0 = fac(s);
  s = withFac(s, { ...f0, name: id === "normal" ? "Test daycare — normal day" : "Test daycare — busy", clockMin: 10 * 60, dogs: [] });
  const c = caps(fac(s));
  const slots = c.playrooms.flatMap((p) => Array.from({ length: p.spots }, () => p));
  const calm = fac(s).rooms.find((r) => r.type === "calm");
  const total = id === "normal" ? 6 : 30;
  const placed = id === "normal" ? Math.min(4, slots.length) : slots.length;
  const dogs: TDog[] = [];
  for (let i = 0; i < total; i++) {
    if (i < placed) dogs.push(pup(s, i, slots[i]!.group, { kind: "room", room: slots[i]!.room.uid }, true, id === "busy" && i % 2 === 0));
    else if (id === "busy" && i < 24 && calm) dogs.push(pup(s, i, slots[i % slots.length]!.group, { kind: "calm", room: calm.uid }, true, false));
    else {
      const other = (["large-active", "small-gentle", "large-gentle", "small-active"] as GroupId[])[i % 4]!;
      dogs.push(pup(s, i, other, { kind: "lobby" }, false, false));
    }
  }
  const f = fac(s);
  return withFac(s, { ...f, dogs: dogs.map((d) => ({ ...d, visit: { ...d.visit!, owner: d.visit!.owner } })) });
}

export const scenarioOf = (s: TycoonState): ScenarioId | null => (/^Test daycare/.test(fac(s).name) ? (fac(s).name.includes("busy") ? "busy" : "normal") : null);
export const _groupOf = groupOf;
