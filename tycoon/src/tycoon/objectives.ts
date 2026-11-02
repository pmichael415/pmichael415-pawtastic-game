// PAWtastic Daycare Tycoon — always one clear next objective and one longer-term goal (staff design §7), worked out
// from the save. Recovery comes first: when income is blocked, the next objective is the free fix.
import { WAGES } from "./business";
import { canOpen, caps } from "./connect";
import { EXPANSION_LEVEL, expansionOptions } from "./expansion";
import { pickupView } from "./pickup";
import { level, xpForLevel } from "./progress";
import { incomeBlockers } from "./blockers";
import { ROLE_NAME } from "./roles";
import { fac } from "./state";
import { hireCostFor, recommendRole } from "./team";
import { waitStage } from "./waiting";
import type { TycoonState } from "./types";

export type ObjectiveAction = "team" | "expand" | "finances" | "build";
export type Objective = { id: string; title: string; detail: string; progress?: [number, number]; action?: ObjectiveAction };
const coins = (n: number) => n.toLocaleString("en-US");

/** True once the daycare has grown past the starter layout (a bath station or a second playroom). */
export const hasExpanded = (s: TycoonState) => {
  const f = fac(s);
  return caps(f).tubs.length > 0 || caps(f).playrooms.length >= 2;
};

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
    return { id: "expand", title: "Choose your first expansion", detail: "A playroom wing or a bath station — or keep saving. Compare the costs, capacity and staffing.", action: "expand", ...(Number.isFinite(cheapest) ? { progress: [Math.max(0, Math.min(s.coins, cheapest)), cheapest] as [number, number] } : {}) };
  }
  if (!f.staff.some((x) => x.role === "attendant")) return { id: "attendant", title: "Hire a daycare attendant", detail: "Busy days need someone keeping pups happy while you run the business.", action: "team" };
  return { id: "grow", title: "Keep the families happy and grow", detail: "Watch the Today strip: when revenue beats wages comfortably, hire or expand again.", action: "finances" };
}

/** The longer-term ladder: a profitable day → a team of 3 with a bath station → level 6 with 2 playrooms. */
export function longGoal(s: TycoonState): Objective {
  const f = fac(s);
  if (s.bestProfit <= 0) return { id: "long-profit", title: "Have a profitable day", detail: "Earn more than the day's wages, upkeep and supplies by closing time (18:00).", action: "finances" };
  const team = f.staff.length;
  const bath = caps(f).tubs.length > 0;
  if (team < 3 || !bath) return { id: "long-team", title: "Build a team of 3 and a bath station", detail: `${team} of 3 on the team${bath ? ", bath station built" : ", no bath station yet"}.`, progress: [Math.min(3, team) + (bath ? 1 : 0), 4] };
  const play = caps(f).playrooms.length;
  if (level(s) < 6 || play < 2) return { id: "long-location", title: "Reach level 6 with 2 playrooms", detail: "Then you're ready to plan a second PAWtastic location (Hawthorne and Hillsdale come next).", progress: [Math.min(s.xp, xpForLevel(6)), xpForLevel(6)] };
  return { id: "long-next", title: "A second location is the next milestone", detail: "Coming in a future update: plan Hawthorne or Hillsdale (fictional layouts)." };
}

export function objectives(s: TycoonState): { next: Objective; long: Objective } {
  return { next: nextObjective(s), long: longGoal(s) };
}
