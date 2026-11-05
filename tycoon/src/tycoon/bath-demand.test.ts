// Two credible ways to grow (milestone §4): families whose pups love bath time ask for a bath at drop-off. With no
// bath room that is recorded as demonstrated demand (nothing booked, nothing lost); with one, it's booked. The
// playroom wing and the bath station then carry estimates from today's demand — labelled, with their assumptions —
// and which one comes out ahead depends on that demand.
import { describe, expect, it } from "vitest";
import { NAMES, personalityOf } from "@/game/engine";
import { EXPANSION_LEVEL, buyExpansion, expansionOptions } from "./expansion";
import { xpForLevel } from "./progress";
import { createArrival } from "./run";
import { quickStart } from "./start";
import { fac, newTycoon, withFac } from "./state";
import { ok } from "./testkit";
import { newVisit } from "./visit";
import type { GroupId } from "@/game/engine";
import type { TycoonState } from "./types";

const ready = (): TycoonState => ({ ...ok(quickStart(newTycoon(0))), coins: 5000, xp: xpForLevel(EXPANSION_LEVEL), tour: null });
const fan = NAMES.map((name) => ({ name, breed: 1 })).find((d) => personalityOf(d).favorite === "splash")!;
const notFan = NAMES.map((name) => ({ name, breed: 1 })).find((d) => personalityOf(d).favorite !== "splash")!;
const opt = (s: TycoonState, id: "playroom" | "bath") => expansionOptions(s).find((o) => o.id === id)!;
const withAsked = (s: TycoonState, groups: Partial<Record<GroupId, number>>, baths: number) => withFac(s, { ...fac(s), asked: { day: fac(s).day, groups, baths } });

describe("families ask for baths (demonstrated demand)", () => {
  it("a bath-time fan's family asks for a bath: with no bath room it's interest, not a booking; with one it's booked", () => {
    const f = fac(ready());
    const none = newVisit(f, { ...fan, boarding: false }, () => 0.99, false);
    expect(none.requests).toEqual(["daycare"]);
    expect(none.bathAsked).toBe(true);
    const booked = newVisit(f, { ...fan, boarding: false }, () => 0.99, true);
    expect(booked.requests).toContain("bath");
    expect(newVisit(f, { ...notFan, boarding: false }, () => 0.99, false).bathAsked ?? false).toBe(false);
  });
  it("arrivals count today's bath asks while there's no bath room", () => {
    let s = withFac(ready(), { ...fac(ready()), open: true, clockMin: 9 * 60 });
    let fans = 0;
    for (let i = 0; i < 40; i++) {
      const r = createArrival(withFac(s, { ...fac(s), dogs: [] }), () => ((i * 0.137) % 1));
      if (!r.ok) continue;
      s = withFac(r.state, { ...fac(r.state), dogs: [] });
      if (personalityOf(fac(r.state).dogs.at(-1)!).favorite === "splash") fans++;
    }
    expect(fans).toBeGreaterThan(0);
    expect(fac(s).asked?.baths).toBe(fans);
  });
});

describe("the two ways to grow carry estimates from today's demand", () => {
  it("each option says what it would earn a day after upkeep and supplies, and what that assumes", () => {
    const s = withAsked(ready(), { "large-gentle": 3 }, 2);
    for (const id of ["playroom", "bath"] as const) {
      const o = opt(s, id);
      expect(o.estimate).toBeTruthy();
      expect(o.estimate!.text).toMatch(/estimate/i);
      expect(o.estimate!.text).toMatch(/upkeep/);
    }
    expect(opt(s, "playroom").estimate!.text).toMatch(/3 Large & Gentle families asked today/);
    expect(opt(s, "bath").estimate!.text).toMatch(/2 families asked for a bath today/);
  });
  it("neither is always best: lots of turned-away families favour the playroom; lots of bath asks and few turned away favour the bath", () => {
    const busyDoor = withAsked(ready(), { "large-gentle": 5 }, 1);
    expect(opt(busyDoor, "playroom").estimate!.perDay).toBeGreaterThan(opt(busyDoor, "bath").estimate!.perDay);
    const bathy = withAsked(ready(), { "large-gentle": 1 }, 5);
    expect(opt(bathy, "bath").estimate!.perDay).toBeGreaterThan(opt(bathy, "playroom").estimate!.perDay);
  });
  it("once built, the bath room books the families who love baths", () => {
    const s = ok(buyExpansion(withAsked(ready(), {}, 3), "bath"));
    const v = newVisit(fac(s), { ...fan, boarding: false }, () => 0.99, true);
    expect(v.requests).toContain("bath");
  });
});
