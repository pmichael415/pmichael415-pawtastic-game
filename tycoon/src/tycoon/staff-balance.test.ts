// A hired team does the routine work for real (staff design §1–§2, §5): a quick-start daycare with a playroom
// wing and a receptionist, an attendant and a cleaner — and no taps from the player — runs at a profit with happy
// families. (An attentive bot is no evidence that beginners understand the game; that needs real players.)
import { describe, expect, it } from "vitest";
import { mulberry, seedFrom } from "@/game/engine";
import { buyExpansion } from "./expansion";
import { setOpen, tick } from "./run";
import { quickStart } from "./start";
import { fac, newTycoon } from "./state";
import { hire } from "./team";
import { ok } from "./testkit";

function week() {
  const rand = mulberry(seedFrom("staffsim"));
  let s = { ...ok(quickStart(newTycoon(0))), coins: 4000 };
  s = { ...s, tour: { mode: "quick" as const, beat: "meet" as const, startedAt: 0, upgrade: null, done: true, skipped: true } };
  s = ok(buyExpansion(s, "playroom"));
  for (const r of ["reception", "attendant", "cleaner"] as const) s = ok(hire(s, r));
  s = ok(setOpen(s, true));
  const days: { profit: number; checkouts: number }[] = [];
  while (fac(s).day <= 6) {
    const d0 = fac(s).day;
    s = tick(s, 1, rand);
    if (fac(s).day !== d0) days.push({ profit: fac(s).report!.profit, checkouts: fac(s).report!.checkouts });
  }
  return { s, days };
}

describe("a hands-off team", () => {
  const { s, days } = week();
  it("turns a profit every day after the build day", () => {
    for (const d of days.slice(1)) expect(d.profit).toBeGreaterThan(0);
  });
  it("serves families well: nobody leaves upset, reputation stays high", () => {
    expect(fac(s).outcomes.filter((o) => o.mood === "upset")).toHaveLength(0);
    expect(fac(s).reputation).toBeGreaterThanOrEqual(90);
  });
  it("checks out at least 8 families a day on average", () => {
    const later = days.slice(1);
    expect(later.reduce((a, d) => a + d.checkouts, 0) / later.length).toBeGreaterThanOrEqual(8);
  });
});
