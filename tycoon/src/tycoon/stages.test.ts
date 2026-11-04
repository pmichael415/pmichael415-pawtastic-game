// Facility stages (combined-loop plan, task 5): Starter → Growing → Full-service → Campus, worked out from the layout
// (never stored, so they can't drift), with the next stage's needs always known. Any order of growing works.
import { describe, expect, it } from "vitest";
import { buyExpansion } from "./expansion";
import { longGoal } from "./objectives";
import { xpForLevel } from "./progress";
import { facilityStage, STAGES } from "./stages";
import { setClosed, sellRoom } from "./build";
import { quickStart } from "./start";
import { fac, newTycoon } from "./state";
import { ok } from "./testkit";
import type { TycoonState } from "./types";

function ready(): TycoonState {
  const s = ok(quickStart(newTycoon(0)));
  return { ...s, coins: 50000, xp: xpForLevel(6), tour: null, bestProfit: 100 };
}
const stage = (s: TycoonState) => facilityStage(fac(s));
const grow = (s: TycoonState, ...ids: Parameters<typeof buyExpansion>[1][]) => ids.reduce((x, id) => ok(buyExpansion({ ...x, coins: 50000 }, id)), s);

describe("facility stages", () => {
  it("four stages, in order", () => {
    expect(STAGES.map((x) => x.id)).toEqual(["starter", "growing", "full", "campus"]);
  });
  it("a new daycare is a Starter daycare; its next stage, Growing, needs any one way to grow", () => {
    const st = stage(ready());
    expect(st.id).toBe("starter");
    expect(st.next?.id).toBe("growing");
    expect(st.next?.anyOf).toBe(true);
    expect(st.next?.needs.map((n) => n.way).sort()).toEqual(["bath", "boarding", "playrooms", "staff", "yard"]);
  });
  it("any one way makes it Growing — a play yard as much as a playroom wing", () => {
    expect(stage(grow(ready(), "yard")).id).toBe("growing");
    expect(stage(grow(ready(), "playroom")).id).toBe("growing");
    expect(stage(grow(ready(), "staff")).id).toBe("growing");
  });
  it("Full-service: daycare, baths and boarding — every PAWtastic service; the needs show what's done", () => {
    let s = grow(ready(), "bath");
    expect(stage(s).id).toBe("growing");
    expect(stage(s).next).toMatchObject({ id: "full", anyOf: false, needs: [{ way: "bath", done: true }, { way: "boarding", done: false }] });
    s = grow(s, "boarding");
    expect(stage(s).id).toBe("full");
  });
  it("Campus: all five ways; after that there's no next stage", () => {
    const s = grow(ready(), "bath", "boarding", "playroom", "yard", "staff");
    expect(stage(s).id).toBe("campus");
    expect(stage(s).next).toBeNull();
  });
  it("worked out from the layout: closing or selling a room takes the stage back down (nothing stored to drift)", () => {
    const s = grow(ready(), "bath", "boarding");
    expect(stage(s).id).toBe("full");
    const boarding = fac(s).rooms.find((r) => r.type === "boarding")!;
    expect(stage(ok(setClosed(s, boarding.uid, true))).id).toBe("growing");
    expect(stage(ok(sellRoom(s, boarding.uid))).id).toBe("growing");
    expect(JSON.stringify(s)).not.toMatch(/"stage"/);
  });
});

describe("the next objective names the next stage's next step", () => {
  it("with nothing urgent, Next is the next thing the stage needs, with its price and progress — not a vague 'keep growing'", async () => {
    const { nextObjective } = await import("./objectives");
    const { hire } = await import("./team");
    const { withFac } = await import("./state");
    let s = grow(ready(), "playroom");
    s = ok(hire(ok(hire(s, "reception")), "attendant"));
    s = withFac(s, { ...fac(s), open: true, clockMin: 9 * 60, introDay: 0, stats: { ...fac(s).stats, checkouts: 3 } });
    const o = nextObjective({ ...s, coins: 300 });
    expect(o.id).toBe("stage-bath");
    expect(o.title).toMatch(/bath station/i);
    expect(o.detail).toMatch(/Full-service/);
    expect(o.action).toBe("expand");
    expect(o.progress?.[0]).toBe(300);
    expect(o.progress?.[1]).toBeGreaterThan(300);
  });
});

describe("the goal ladder follows the stages", () => {
  it("after a profitable day, the long goal is the next stage, with what it still needs", () => {
    expect(longGoal({ ...ready(), bestProfit: 0 }).id).toBe("long-profit");
    const g = longGoal(ready());
    expect(g.id).toBe("long-stage-growing");
    expect(g.title).toMatch(/Growing/);
    expect(g.action).toBe("expand");
    const h = longGoal(grow(ready(), "bath"));
    expect(h.id).toBe("long-stage-full");
    expect(h.detail).toMatch(/boarding/i);
    expect(h.progress).toEqual([1, 2]);
  });
  it("a campus looks ahead to a second location", () => {
    expect(longGoal(grow(ready(), "bath", "boarding", "playroom", "yard", "staff")).id).toBe("long-next");
  });
});
