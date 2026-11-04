import { describe, expect, it } from "vitest";
import { weekKey } from "@/game/engine";
import { closeDay, earn } from "./business";
import { fac, newTycoon, parseTycoon, withFac } from "./state";
import { WEEKLY_GOALS, claimWeekly, goalFor, rollWeekly, weeklyStatus } from "./weekly";
import type { Facility, TycoonState } from "./types";

const W1 = "2026-W45";
const W2 = "2026-W46";
const setF = (s: TycoonState, over: Partial<Facility>) => withFac(s, { ...fac(s), ...over });
const bump = (s: TycoonState, stat: "checkouts" | "plays" | "baths" | "admitted" | "boarders", n: number) =>
  setF(s, { stats: { ...fac(s).stats, [stat]: fac(s).stats[stat] + n } });
/** A rolled state whose goal is the given one (the pool picks by week, so set it directly). */
const withGoal = (s: TycoonState, id: string, week = W1): TycoonState => {
  const r = rollWeekly(s, week).state;
  return { ...r, weekly: { ...r.weekly!, goal: id } };
};

describe("weekly challenge", () => {
  it("uses New York weeks starting Monday", () => {
    expect(weekKey(Date.parse("2026-11-02T15:00:00Z"))).toBe(W1); // Monday
    expect(weekKey(Date.parse("2026-11-09T04:30:00Z"))).toBe(W1); // still Sunday night in New York
    expect(weekKey(Date.parse("2026-11-09T05:30:00Z"))).toBe(W2);
  });
  it("the same week gives the same goal, among those open at the player's level", () => {
    expect(goalFor(W1, 1).id).toBe(goalFor(W1, 1).id);
    for (let w = 1; w <= 52; w++) {
      const wk = `2027-W${String(w).padStart(2, "0")}`;
      expect(goalFor(wk, 1).level).toBe(1);
      expect(goalFor(wk, 20).level).toBeLessThanOrEqual(20);
    }
    const seen = new Set(Array.from({ length: 52 }, (_, w) => goalFor(`2027-W${String(w + 1).padStart(2, "0")}`, 20).id));
    expect(seen.size).toBeGreaterThan(3);
  });
  it("starts with the week and counts progress from then", () => {
    let s = bump(newTycoon(0), "checkouts", 7);
    s = withGoal(s, "serve");
    expect(weeklyStatus(s)).toMatchObject({ progress: 0, target: 25, done: false, claimed: false });
    s = bump(s, "checkouts", 10);
    expect(weeklyStatus(s)!.progress).toBe(10);
    s = bump(s, "checkouts", 30);
    expect(weeklyStatus(s)).toMatchObject({ progress: 25, done: true });
  });
  it("claims once, for game coins", () => {
    let s = withGoal(newTycoon(0), "serve");
    expect(claimWeekly(s)).toEqual({ ok: false, error: "Not finished yet (0/25)." });
    s = bump(s, "checkouts", 25);
    const r = claimWeekly(s);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.coins).toBe(s.coins + WEEKLY_GOALS.find((g) => g.id === "serve")!.reward);
    expect(fac(r.state).ledger.at(-1)!.income.bonus).toBe(WEEKLY_GOALS.find((g) => g.id === "serve")!.reward);
    expect(claimWeekly(r.state)).toEqual({ ok: false, error: "Already claimed — a new challenge starts Monday." });
  });
  it("nothing to claim before the week starts", () => {
    expect(claimWeekly(newTycoon(0))).toEqual({ ok: false, error: "This week's challenge hasn't started yet." });
  });
  it("rolling keeps the goal mid-week, starts a new one next week, and pays a finished unclaimed goal", () => {
    let s = withGoal(newTycoon(0), "serve");
    expect(rollWeekly(s, W1)).toEqual({ state: s, paid: 0 });
    s = bump(s, "checkouts", 25);
    const next = rollWeekly(s, W2);
    expect(next.paid).toBe(WEEKLY_GOALS.find((g) => g.id === "serve")!.reward);
    expect(next.state.coins).toBe(s.coins + next.paid);
    expect(next.state.weekly).toMatchObject({ week: W2, claimed: false });
    expect(weeklyStatus(next.state)!.progress).toBe(0);
    // a missed week costs nothing
    const missed = rollWeekly(withGoal(newTycoon(0), "serve"), W2);
    expect(missed.paid).toBe(0);
    expect(missed.state.coins).toBe(3000);
  });
  it("a profit day counts closed days this week, building not counted against it", () => {
    let s = withGoal(setF(newTycoon(0), { open: true }), "profit_day");
    s = { ...s, coins: 5000 };
    s = earn(s, { daycare: 600 });
    s = setF(s, { ledger: fac(s).ledger.map((d) => (d.day === fac(s).day ? { ...d, expenses: { ...d.expenses, building: 2000 } } : d)) });
    expect(weeklyStatus(s)!.progress).toBe(0); // today isn't over
    s = closeDay(s);
    expect(weeklyStatus(s)!.progress).toBe(300); // 600 − 40 wages, capped at the target, building ignored
    expect(weeklyStatus(s)!.done).toBe(true);
  });
  it("a profit day is the day's operating profit, as the day report shows it: game rewards don't count, refunds do (review finding)", () => {
    let s = withGoal(setF(newTycoon(0), { open: true }), "profit_day");
    s = { ...s, coins: 5000 };
    s = earn(s, { daycare: 200, bonus: 500 });
    s = setF(s, { ledger: fac(s).ledger.map((d) => (d.day === fac(s).day ? { ...d, expenses: { ...d.expenses, refunds: 30 } } : d)) });
    s = closeDay(s);
    const report = fac(s).report!;
    expect(report.running).toBe(200 - 40 - 30); // revenue − wages − refunds; the 500 reward is a bonus, apart
    expect(weeklyStatus(s)!.progress).toBe(report.running);
    expect(weeklyStatus(s)!.done).toBe(false);
  });
  it("Fun and Appeal goals use the daycare's current value", () => {
    const s = withGoal(newTycoon(0), "fun");
    expect(weeklyStatus(s)).toMatchObject({ progress: 0, target: 20 });
    const yard = setF(s, { items: [...fac(s).items, { uid: "y", kind: "play_yard", c: 12, r: 20, rot: 0, level: 3, spent: 0, room: null, closed: false }] });
    expect(weeklyStatus(yard)!.progress).toBe(10);
  });
  it("a hostile or broken weekly entry in a save is dropped, never trusted", () => {
    const base = withGoal(newTycoon(0), "serve");
    for (const bad of [{ week: "x", goal: "serve" }, { ...base.weekly, goal: "free_money" }, { ...base.weekly, base: { checkouts: -5 } }, "nope", 7]) {
      const s = parseTycoon(JSON.parse(JSON.stringify({ ...base, weekly: bad })))!;
      expect(s).not.toBeNull();
      expect(s.weekly).toBeNull();
    }
    const kept = parseTycoon(JSON.parse(JSON.stringify(base)))!;
    expect(kept.weekly).toEqual(base.weekly);
  });
});
