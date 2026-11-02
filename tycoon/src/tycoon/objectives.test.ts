// One clear next objective and one longer-term goal, always (staff design §7).
import { describe, expect, it } from "vitest";
import { EXPANSION_LEVEL, buyExpansion } from "./expansion";
import { longGoal, nextObjective, objectives } from "./objectives";
import { xpForLevel } from "./progress";
import { quickStart } from "./start";
import { fac, newTycoon, withFac } from "./state";
import { hire } from "./team";
import { ok } from "./testkit";
import { defaultVisit } from "./visit";
import type { TDog, TycoonState } from "./types";

const started = (): TycoonState => {
  const s = ok(quickStart(newTycoon(0)));
  return withFac({ ...s, tour: null }, { ...fac(s), open: true });
};
const served = (s: TycoonState) => withFac(s, { ...fac(s), stats: { ...fac(s).stats, checkouts: 1 } });

describe("the next objective", () => {
  it("an empty lot: open your daycare", () => {
    expect(nextObjective(newTycoon(0)).id).toBe("open");
  });
  it("first, care for a pup and check them out", () => {
    expect(nextObjective(started()).id).toBe("first-pup");
  });
  it("after the first checkout, the staffing decision — with the role, sign-on fee and wage", () => {
    const o = nextObjective(served(started()));
    expect(o.id).toBe("hire");
    expect(o.title).toMatch(/receptionist/i);
    expect(o.detail).toMatch(/coins a day/);
    expect(o.action).toBe("team");
  });
  it("then the first expansion (after level 2)", () => {
    let s = ok(hire({ ...served(started()), coins: 3000 }, "reception"));
    s = { ...s, xp: 0 };
    expect(nextObjective(s).id).toBe("level-expand");
    s = { ...s, xp: xpForLevel(EXPANSION_LEVEL) };
    expect(nextObjective(s)).toMatchObject({ id: "expand", action: "expand" });
    s = ok(buyExpansion({ ...s, coins: 5000 }, "bath"));
    expect(nextObjective(s).id).not.toBe("expand");
  });
  it("a family kept waiting comes before plans", () => {
    const s = served(started());
    const f = fac(s);
    const d: TDog = { id: "d50", name: "Bruno", breed: 0, size: "small", temper: "gentle", visits: 1, place: { kind: "lobby" }, checkedIn: false, happiness: 80, clean: 60, boarding: false, played: 0, bathed: false };
    const w = withFac(s, { ...f, clockMin: 9 * 60 + 30, dogs: [{ ...d, visit: { ...defaultVisit(f, d), arrivedDay: f.day, arrived: 9 * 60 } }] });
    expect(nextObjective(w)).toMatchObject({ id: "waiting", title: "Check Bruno in" });
  });
  it("stalled income: the free fix comes first", () => {
    const s = { ...served(started()), coins: -40 };
    expect(nextObjective(s).id).toMatch(/^fix-/);
  });
});

describe("the longer-term goal", () => {
  it("is always there, and different from the next objective", () => {
    for (const s of [newTycoon(0), started(), served(started())]) {
      const o = objectives(s);
      expect(o.long.title.length).toBeGreaterThan(5);
      expect(o.long.id).not.toBe(o.next.id);
    }
  });
  it("climbs: a profitable day, then a team of 3 with a bath station", () => {
    expect(longGoal(started()).id).toBe("long-profit");
    expect(longGoal({ ...started(), bestProfit: 50 }).id).toBe("long-team");
  });
});
