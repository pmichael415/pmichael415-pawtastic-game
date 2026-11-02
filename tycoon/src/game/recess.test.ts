import { describe, expect, it } from "vitest";
import {
  applyRun,
  newGame,
  parseSave,
  recessCoinsLeft,
  recessMaxScore,
  RECESS_DAILY_COIN_CAP,
  RECESS_RUN_COIN_CAP,
} from "./engine";

const fresh = () => newGame(0, "2026-10-31");

describe("Recess Rush rewards are capped and validated", () => {
  it("a course's maximum possible score is finite and plausible", () => {
    const max = recessMaxScore("2026-10-31");
    expect(max).toBeGreaterThan(300);
    expect(max).toBeLessThan(2500);
    expect(recessMaxScore("2026-10-31")).toBe(max); // deterministic per seed
  });

  it("an impossible score for the course earns nothing and doesn't set a best", () => {
    const r = applyRun(fresh(), 99999, { seed: "2026-10-31", day: "2026-10-31" });
    expect(r.coins).toBe(0);
    expect(r.rejected).toMatch(/not possible/);
    expect(r.state.recessBest).toBe(0);
    expect(r.state.coins).toBe(500);
  });

  it("each run pays at most the per-run cap", () => {
    const score = Math.min(recessMaxScore("x"), 2000);
    const r = applyRun(fresh(), score, { seed: "x", day: "d1" });
    expect(r.coins).toBeLessThanOrEqual(RECESS_RUN_COIN_CAP);
  });

  it("coins stop at the daily cap, then reset the next day; cosmetics and best still update", () => {
    let s = fresh();
    let total = 0;
    for (let i = 0; i < 10; i++) {
      const r = applyRun(s, 400, { seed: "d1", day: "d1" });
      total += r.coins;
      s = r.state;
    }
    expect(total).toBe(RECESS_DAILY_COIN_CAP);
    expect(recessCoinsLeft(s, "d1")).toBe(0);
    expect(s.recessBest).toBe(400);
    expect(s.cosmetics).toContain("bandana-red");
    const next = applyRun(s, 400, { seed: "d2", day: "d2" });
    expect(next.coins).toBe(40);
    expect(recessCoinsLeft(next.state, "d2")).toBe(RECESS_DAILY_COIN_CAP - 40);
  });

  it("a tampered save can't pre-load extra daily allowance", () => {
    const s = parseSave({ ...fresh(), recessDay: "d1", recessCoinsToday: -500 })!;
    expect(s.recessCoinsToday).toBe(0);
    const t = parseSave({ ...fresh(), recessDay: "d1", recessCoinsToday: 99999 })!;
    expect(recessCoinsLeft(t, "d1")).toBe(0);
  });
});

describe("Recess Rush power-ups (bought in the hub)", () => {
  it("switched-on power-ups are used at the start: 4 lives and a shield, one of each", async () => {
    const { startRun } = await import("./engine");
    const s = { ...newGame(0, "2026-11-02"), recessPowerups: { shield: 1, life: 1 } };
    const r = startRun(s, { shield: true, life: true });
    expect(r.lives).toBe(4);
    expect(r.shield).toBe(true);
    expect(r.state.recessPowerups).toEqual({ shield: 0, life: 0 });
  });
  it("nothing is used when none are left, or when they're switched off", async () => {
    const { startRun } = await import("./engine");
    const empty = newGame(0, "2026-11-02");
    const r = startRun(empty, { shield: true, life: true });
    expect([r.lives, r.shield]).toEqual([3, false]);
    expect(r.state).toBe(empty);
    const some = { ...empty, recessPowerups: { shield: 5, life: 5 } };
    const off = startRun(some, { shield: false, life: false });
    expect([off.lives, off.shield]).toEqual([3, false]);
    expect(off.state).toBe(some);
  });
});
