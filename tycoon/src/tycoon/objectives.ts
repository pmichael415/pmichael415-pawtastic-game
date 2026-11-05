// PAWtastic Daycare Tycoon — always one clear next objective and one longer-term goal (staff design §7), worked out
// from the save. Recovery comes first: when income is blocked, the next objective is the free fix.
import { WAGES } from "./business";
import { canOpen, caps } from "./connect";
import { EXPANSION_LEVEL, EXPANSION_LEVELS, askedToday, demandGroup, expansionOptions, idleRooms, type ExpansionId } from "./expansion";
import { roomName } from "./rooms";
import { groupName } from "@/game/engine";
import { pickupView } from "./pickup";
import { level, xpForLevel } from "./progress";
import { incomeBlockers } from "./blockers";
import { ROLE_NAME } from "./roles";
import { fac } from "./state";
import { hireCostFor, recommendRole } from "./team";
import { waitStage } from "./waiting";
import { facilityStage, type GrowthWay } from "./stages";
import type { TycoonState } from "./types";

/** Which way to grow builds each part of a facility stage. */
const WAY_EXPANSION: Record<GrowthWay, ExpansionId> = { playrooms: "playroom", bath: "bath", boarding: "boarding", yard: "yard", staff: "staff" };
export type ObjectiveAction = "team" | "expand" | "finances" | "build";
export type Objective = { id: string; title: string; detail: string; progress?: [number, number]; action?: ObjectiveAction };
const coins = (n: number) => n.toLocaleString("en-US");

/** True once the daycare has grown past the starter layout (any of the five ways to grow — a Growing daycare). */
export const hasExpanded = (s: TycoonState) => facilityStage(fac(s)).index >= 1;

export function nextObjective(s: TycoonState): Objective {
  const f = fac(s);
  const open = canOpen(f);
  if (!open.ok) return { id: "open", title: "Open your daycare", detail: `Still needed: ${open.missing.join(", ")}.`, action: "build" };
  const block = incomeBlockers(s).find((b) => b.id !== "closed");
  if (block) return { id: `fix-${block.id}`, title: block.title, detail: block.fix };
  const concern = f.dogs.find((d) => d.visit?.ownerHere != null && !d.bathing && pickupView(s, d.id, false).assessment.complaints.length > 0);
  if (concern) return { id: "concern", title: `${concern.visit!.owner} is waiting to talk to you`, detail: `Tap ${concern.name}, then Check out to hear their concern and choose an answer.` };
  const waiting = f.dogs.map((d) => ({ d, w: waitStage(f, d) })).find((x) => x.w?.kind === "dropoff" && x.w.stage !== "waiting");
  if (waiting) return { id: "waiting", title: `Check ${waiting.d.name} in`, detail: `${waiting.d.visit!.owner} is ${waiting.w!.stage === "upset" ? `upset and will leave in ${waiting.w!.leavesIn} minutes` : "getting impatient"} at the desk. If there's no spot for them, turning them away is free.` };
  if (!f.open) return { id: "open-doors", title: "Open the doors", detail: "Switch Open on in the status bar so families can drop off." };
  if ((f.stats.checkouts ?? 0) === 0) return { id: "first-pup", title: "Care for your first pup and check them out", detail: "Check them in, settle them in a matching playroom, play, then Check out when their family arrives." };
  // a room you built that's closed or not working: opening it again is free and comes before building anything
  const idle = idleRooms(f)[0];
  if (idle && (f.stats.checkouts ?? 0) > 0) return { id: "reopen", title: `Reopen your ${roomName(f, idle.uid)}`, detail: "It's closed or not working, so it doesn't count right now. Tap it in the daycare to open it again (free) or see what it needs." };
  // families asking for a kind of pup you can't take: growth comes before more wages
  const want = demandGroup(f);
  const asked = want ? (askedToday(f).find((a) => a.group === want)?.n ?? 0) : 0;
  if (want && asked >= 2 && level(s) >= EXPANSION_LEVEL) {
    const wing = expansionOptions(s).find((o) => o.id === "playroom");
    return { id: "demand", title: `${asked} ${groupName(want)} families asked today — give them a playroom`, detail: `You have no room for ${groupName(want)} pups, so they booked elsewhere. A playroom wing for them adds 3 spots, each worth about ${f.prices.daycare} coins a day.`, action: "expand", ...(wing && wing.cost > 0 ? { progress: [Math.max(0, Math.min(s.coins, wing.cost)), wing.cost] as [number, number] } : {}) };
  }
  const hired = f.staff.filter((x) => !x.founder);
  if (!hired.length) {
    const role = recommendRole(f);
    return { id: "hire", title: `Hire your first employee — a ${ROLE_NAME[role].toLowerCase()}`, detail: `They take over the repetitive work. Sign-on ${coins(hireCostFor(f))} coins, then ${WAGES[f.wage]} coins a day.`, action: "team", progress: [Math.max(0, Math.min(s.coins, hireCostFor(f))), hireCostFor(f)] };
  }
  const roleless = hired.find((x) => !x.role);
  if (roleless) return { id: "role", title: `Give ${roleless.name} a role`, detail: "Without a role they only help when you tap.", action: "team" };
  if (!hasExpanded(s)) {
    if (level(s) < EXPANSION_LEVEL) return { id: "level-expand", title: `Reach level ${EXPANSION_LEVEL} to unlock your first expansion`, detail: "Every check-in, play and happy checkout earns experience.", progress: [s.xp - xpForLevel(level(s)), xpForLevel(EXPANSION_LEVEL) - xpForLevel(level(s))] };
    const cheapest = Math.min(...expansionOptions(s).map((o) => o.cost).filter((c) => c > 0));
    return { id: "expand", title: "Choose your first expansion", detail: "Five ways to grow — more families, new services, comfort or your team — or keep saving. Compare what each costs and makes possible, then choose where it goes.", action: "expand", ...(Number.isFinite(cheapest) ? { progress: [Math.max(0, Math.min(s.coins, cheapest)), cheapest] as [number, number] } : {}) };
  }
  if (!f.staff.some((x) => x.role === "attendant")) return { id: "attendant", title: "Hire a daycare attendant", detail: "Busy days need someone keeping pups happy while you run the business.", action: "team" };
  // nothing urgent: the next step toward the next facility stage, with its price and how close you are
  const st = facilityStage(f);
  const need = st.next?.needs.find((n) => !n.done);
  if (st.next && need) {
    const id = WAY_EXPANSION[need.way];
    const o = expansionOptions(s).find((x) => x.id === id);
    if (o && level(s) < EXPANSION_LEVELS[id]) return { id: `stage-${id}`, title: `Reach level ${EXPANSION_LEVELS[id]} for ${need.label}`, detail: `It's the next step to a ${st.next.name}. Every check-in, play and happy checkout earns experience.`, progress: [s.xp - xpForLevel(level(s)), xpForLevel(EXPANSION_LEVELS[id]) - xpForLevel(level(s))] };
    if (o && o.cost > 0) return { id: `stage-${id}`, title: `Next: ${need.label}`, detail: `A step to a ${st.next.name}. ${o.unlocks}`, action: "expand", progress: [Math.max(0, Math.min(s.coins, o.cost)), o.cost] };
  }
  return { id: "grow", title: "Keep the families happy and grow", detail: "Watch the Today strip: when revenue beats wages comfortably, hire or expand again.", action: "finances" };
}

/**
 * The longer-term ladder: a profitable day, then the facility stages (Growing → Full-service → Campus) with what the
 * next one still needs, then a second location.
 */
export function longGoal(s: TycoonState): Objective {
  const f = fac(s);
  if (s.bestProfit <= 0) return { id: "long-profit", title: "Have a profitable day", detail: "Earn more than the day's wages, upkeep and supplies by closing time (18:00).", action: "finances" };
  const st = facilityStage(f);
  if (st.next) {
    const n = st.next;
    const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ${n.anyOf ? "or" : "and"} ${xs.at(-1)}`);
    const todo = n.needs.filter((x) => !x.done).map((x) => x.label);
    const detail = n.anyOf
      ? `You're a ${st.name}. Grow one way — ${list(n.needs.map((x) => x.label))}. ${n.means}`
      : `You're a ${st.name}. Still to build: ${list(todo)}. ${n.means}`;
    return { id: `long-stage-${n.id}`, title: `Grow into a ${n.name}`, detail, progress: n.progress, action: "expand" };
  }
  return { id: "long-next", title: "A second location is the next milestone", detail: "You've built a whole PAWtastic campus. Coming in a future update: plan Hawthorne or Hillsdale (fictional layouts)." };
}

/**
 * The expansion you're saving toward, its price and the coins you have (owner brief: "see the next expansion's cost and
 * your progress toward affording it"). What families asked for comes first, then the cheapest that's unlocked and has a
 * spot. Null before expansions unlock, or when nothing is left to buy.
 */
export function savingFor(s: TycoonState, next: Objective = nextObjective(s)): { id: string; title: string; cost: number; have: number; purpose: string } | null {
  if (level(s) < EXPANSION_LEVEL) return null;
  const f = fac(s);
  const open = expansionOptions(s).filter((o) => o.cost > 0 && (o.why === null || /more coins needed/.test(o.why)));
  if (!open.length) return null;
  // what Next is pointing at comes first, then what families asked for, then the cheapest
  const named = next.id.startsWith("stage-") ? open.find((o) => o.id === next.id.slice("stage-".length)) : undefined;
  const want = demandGroup(f);
  const pick = named || (want && open.find((o) => o.id === "playroom" && o.mode === "new")) || [...open].sort((a, b) => a.cost - b.cost)[0]!;
  // why it's worth it, in one line (the expansion card carries the labelled estimate with its numbers)
  return { id: pick.id, title: pick.title, cost: pick.cost, have: Math.max(0, s.coins), purpose: pick.goodIf };
}

export function objectives(s: TycoonState): { next: Objective; long: Objective } {
  return { next: nextObjective(s), long: longGoal(s) };
}
