// Weekly challenge for the new Daycare: one goal per New York week (Monday start), paid in game coins. Missing a week
// costs nothing; a finished goal that wasn't claimed pays automatically when the next week starts.
import { mulberry, seedFrom } from "@/game/engine";
import { dayMoney, earn } from "./business";
import { funAppeal } from "./effects";
import { level } from "./progress";
import { fac } from "./state";
import type { TResult, TycoonState, WeeklyStat } from "./types";

type Metric = { kind: "stat"; stat: WeeklyStat } | { kind: "profitDay" } | { kind: "fun" } | { kind: "appeal" };
export type WeeklyGoal = { id: string; label: string; metric: Metric; target: number; reward: number; level: number };

/** The pool. `level` is the player level a goal needs (so a new daycare always gets one it can finish). */
export const WEEKLY_GOALS: WeeklyGoal[] = [
  { id: "serve", label: "Send 25 pups home happy", metric: { kind: "stat", stat: "checkouts" }, target: 25, reward: 300, level: 1 },
  { id: "plays", label: "Host 40 playtimes", metric: { kind: "stat", stat: "plays" }, target: 40, reward: 250, level: 1 },
  { id: "checkins", label: "Check in 30 pups", metric: { kind: "stat", stat: "admitted" }, target: 30, reward: 250, level: 1 },
  { id: "profit_day", label: "Have a 300-coin profit day", metric: { kind: "profitDay" }, target: 300, reward: 300, level: 2 },
  { id: "baths", label: "Give 15 baths", metric: { kind: "stat", stat: "baths" }, target: 15, reward: 300, level: 3 },
  { id: "fun", label: "Reach Fun 20", metric: { kind: "fun" }, target: 20, reward: 250, level: 3 },
  { id: "appeal", label: "Reach Appeal 15", metric: { kind: "appeal" }, target: 15, reward: 250, level: 4 },
  { id: "boarders", label: "Host 3 overnight boarders", metric: { kind: "stat", stat: "boarders" }, target: 3, reward: 300, level: 4 },
];
export const WEEKLY_STATS: WeeklyStat[] = ["checkouts", "plays", "admitted", "baths", "boarders"];

/** This week's goal for a player of this level (the same for the whole week). */
export function goalFor(week: string, lv: number): WeeklyGoal {
  const open = WEEKLY_GOALS.filter((g) => g.level <= lv);
  const r = mulberry(seedFrom("tycoon-weekly-" + week));
  return open[Math.floor(r() * open.length)] ?? WEEKLY_GOALS[0]!;
}

export type WeeklyStatus = { goal: WeeklyGoal; progress: number; target: number; done: boolean; claimed: boolean };

export function weeklyStatus(s: TycoonState): WeeklyStatus | null {
  const w = s.weekly;
  const goal = w ? WEEKLY_GOALS.find((g) => g.id === w.goal) : null;
  if (!w || !goal) return null;
  const f = fac(s);
  let value = 0;
  switch (goal.metric.kind) {
    case "stat":
      value = f.stats[goal.metric.stat] - w.base[goal.metric.stat];
      break;
    case "profitDay":
      // finished days this week, by the day's operating profit (the same calculation as the day report): revenue from
      // families minus operating costs. Building is an investment and game rewards are bonuses, so neither counts.
      for (const d of f.ledger) {
        if (d.day < w.baseDay || d.day >= f.day) continue;
        value = Math.max(value, dayMoney(d).profitAtClose);
      }
      break;
    case "fun":
      value = funAppeal(f).fun;
      break;
    case "appeal":
      value = funAppeal(f).appeal;
      break;
  }
  const progress = Math.max(0, Math.min(goal.target, Math.floor(value)));
  return { goal, progress, target: goal.target, done: progress >= goal.target, claimed: w.claimed };
}

/** Starts the week's challenge if it's a new week. A finished, unclaimed goal from last week is paid first. */
export function rollWeekly(s: TycoonState, week: string): { state: TycoonState; paid: number } {
  if (s.weekly?.week === week) return { state: s, paid: 0 };
  const last = weeklyStatus(s);
  let paid = 0;
  let next = s;
  if (last && last.done && !last.claimed) {
    paid = last.goal.reward;
    next = earn(next, { bonus: paid });
  }
  const f = fac(next);
  const base = Object.fromEntries(WEEKLY_STATS.map((k) => [k, f.stats[k]])) as Record<WeeklyStat, number>;
  return { state: { ...next, weekly: { week, goal: goalFor(week, level(next)).id, base, baseDay: f.day, claimed: false } }, paid };
}

export function claimWeekly(s: TycoonState): TResult {
  const st = weeklyStatus(s);
  if (!st) return { ok: false, error: "This week's challenge hasn't started yet." };
  if (st.claimed) return { ok: false, error: "Already claimed — a new challenge starts Monday." };
  if (!st.done) return { ok: false, error: `Not finished yet (${st.progress}/${st.target}).` };
  const paid = earn({ ...s, weekly: { ...s.weekly!, claimed: true } }, { bonus: st.goal.reward });
  return { ok: true, state: paid, earned: st.goal.reward, msg: `Weekly challenge complete! +${st.goal.reward} coins` };
}
