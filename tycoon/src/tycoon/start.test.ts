// Quick start (Stage A): a small working daycare built with the real build rules, so every coin is really spent.
import { describe, expect, it } from "vitest";
import { START_COINS, furnitureDef } from "./catalog";
import { canOpen } from "./connect";
import { guideProgress } from "./guide";
import { level, levelReward } from "./progress";
import { isFreshSave, quickStart } from "./start";
import { fac, newTycoon } from "./state";
import { ok, richState } from "./testkit";
import { playroomQuote } from "./tourActions";

describe("quick start", () => {
  const s = ok(quickStart(newTycoon(0)));
  const f = fac(s);
  it("is a daycare that can open straight away", () => {
    expect(canOpen(f)).toEqual({ ok: true, missing: [] });
  });
  it("has a Small & Gentle playroom with beds, a water bowl and a play mat, plus the sign and flowers outside", () => {
    const play = f.rooms.find((r) => r.type === "playroom")!;
    expect(play.group).toBe("small-gentle");
    const inPlay = f.items.filter((i) => i.room === play.uid).map((i) => i.kind).sort();
    expect(inPlay).toEqual(["dog_bed", "dog_bed", "play_mat", "water_bowl"]);
    expect(f.items.filter((i) => i.kind === "sign")).toHaveLength(1);
    expect(f.items.filter((i) => i.kind === "flowers")).toHaveLength(2);
  });
  it("costs exactly what was built: coins = starting coins − everything spent", () => {
    const spent = f.rooms.reduce((n, r) => n + r.spent, 0) + f.items.reduce((n, i) => n + i.spent, 0);
    expect(spent).toBeGreaterThan(1000);
    // Building earns XP like any build; a level reached pays its reward.
    let rewards = 0;
    for (let n = 2; n <= level(s); n++) rewards += levelReward(n);
    expect(s.coins).toBe(START_COINS - spent + rewards);
    // enough left for the guide's first upgrade, but not for a second playroom: that's paid for by serving families
    // (milestone "feel like a daycare tycoon" §4 — earnings visibly contribute to the first expansion)
    expect(s.coins).toBeGreaterThanOrEqual(furnitureDef("toy_bin")!.price);
    expect(s.coins).toBeLessThan(playroomQuote(s, "large-active")!.cost);
  });
  it("counts as the guide's building steps done (the painting step is next)", () => {
    expect(guideProgress(s).step).toBe(4);
  });
  it("only a brand-new save is offered a start", () => {
    expect(isFreshSave(newTycoon(0))).toBe(true);
    expect(isFreshSave(s)).toBe(false);
    expect(isFreshSave(richState())).toBe(false);
    expect(isFreshSave({ ...newTycoon(0), guide: { done: false, skipped: true, painted: false } })).toBe(false);
  });
  it("refuses to build over a daycare that already has rooms", () => {
    expect(quickStart(s).ok).toBe(false);
  });
});
