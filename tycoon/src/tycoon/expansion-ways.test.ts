// Five ways to grow (combined-loop plan, task 4): each a real room or yard built by the build rules, with up to three
// spots to choose from, priced by a dry run, refused (nothing changed) at a spot that wasn't offered.
import { describe, expect, it } from "vitest";
import { facilityUpkeep } from "./business";
import { caps, connectedRooms, roomStatus } from "./connect";
import { decayMultiplier, funAppeal } from "./effects";
import { EXPANSION_GROUPS, buyExpansion, expansionOptions, expansionSpots, type ExpansionId } from "./expansion";
import { containsTile, isOwned, rectTiles } from "./grid";
import { xpForLevel } from "./progress";
import { createArrival } from "./run";
import { quickStart } from "./start";
import { fac, newTycoon, withFac } from "./state";
import { ok } from "./testkit";
import type { TycoonState } from "./types";

function ready(lvl = 6, coins = 20000): TycoonState {
  const s = ok(quickStart(newTycoon(0)));
  return { ...s, coins, xp: xpForLevel(lvl), tour: null };
}
const opt = (s: TycoonState, id: ExpansionId) => expansionOptions(s).find((o) => o.id === id)!;
const spent = (x: TycoonState) => fac(x).ledger.find((l) => l.day === fac(x).day)?.expenses.building ?? 0;

describe("five ways to grow", () => {
  it("grouped by what they're for — more families, services, comfort, team — each with its cost, what it adds, what it needs and why you'd want it", () => {
    const opts = expansionOptions(ready());
    expect(opts.map((o) => o.id).sort()).toEqual(["bath", "boarding", "playroom", "staff", "yard"]);
    expect(EXPANSION_GROUPS.map((g) => g.id)).toEqual(["families", "services", "comfort", "team"]);
    for (const o of opts) {
      expect(EXPANSION_GROUPS.some((g) => g.id === o.group)).toBe(true);
      expect(o.cost).toBeGreaterThan(0);
      expect(o.capacity.length).toBeGreaterThan(5);
      expect(o.unlocks.length).toBeGreaterThan(5);
      expect(o.goodIf.length).toBeGreaterThan(5);
      expect(o.available).toBe(true);
    }
  });
  it("the boarding wing opens at level 3 and the staff room at level 5 — shown before then, locked, with the level", () => {
    const s = ready(2);
    expect(opt(s, "boarding")).toMatchObject({ available: false, why: expect.stringMatching(/level 3/) });
    expect(opt(s, "staff")).toMatchObject({ available: false, why: expect.stringMatching(/level 5/) });
    expect(opt(s, "yard").available).toBe(true);
  });
});

describe("each is real", () => {
  it("boarding wing: a connected, working boarding room with beds — and overnight guests can now arrive", () => {
    const s = ready();
    expect(createArrival(withFac(s, { ...fac(s), open: true, clockMin: 600 }), () => 0.5, true).ok).toBe(false);
    const o = opt(s, "boarding");
    const r = ok(buyExpansion(s, "boarding"));
    expect(spent(r) - spent(s)).toBe(o.cost);
    expect(facilityUpkeep(fac(r)) - facilityUpkeep(fac(s))).toBe(o.upkeep);
    const room = fac(r).rooms.find((x) => x.type === "boarding")!;
    expect(roomStatus(fac(r), room).working).toBe(true);
    expect(caps(fac(r)).beds.length).toBe(3);
    expect(createArrival(withFac(r, { ...fac(r), open: true, clockMin: 600 }), () => 0.5, true).ok).toBe(true);
    // the second time it's improved (one more bed), not duplicated
    expect(opt(r, "boarding").mode).toBe("improve");
    const r2 = ok(buyExpansion(r, "boarding"));
    expect(caps(fac(r2)).beds.length).toBe(4);
    expect(fac(r2).rooms.filter((x) => x.type === "boarding")).toHaveLength(1);
  });
  it("play yard: an outdoor play yard, water station and shade tree — pups' happiness falls more slowly and more families come", () => {
    const s = ready();
    const before = funAppeal(fac(s));
    const r = ok(buyExpansion(s, "yard"));
    const after = funAppeal(fac(r));
    expect(fac(r).items.filter((i) => ["play_yard", "water", "shade_tree"].includes(i.kind))).toHaveLength(3);
    expect(after.fun).toBeGreaterThan(before.fun);
    expect(after.appeal).toBeGreaterThan(before.appeal);
    expect(decayMultiplier(after.fun)).toBeLessThan(decayMultiplier(before.fun));
    // improving it raises the play yard's level
    expect(opt(r, "yard").mode).toBe("improve");
    const r2 = ok(buyExpansion(r, "yard"));
    expect(fac(r2).items.find((i) => i.kind === "play_yard")!.level).toBe(2);
    expect(funAppeal(fac(r2)).fun).toBeGreaterThan(after.fun);
  });
  it("staff room: a working staff room with a staff couch — the team recovers energy faster; improving adds a couch", () => {
    const s = ready();
    expect(caps(fac(s)).staffBoost).toBe(0);
    const r = ok(buyExpansion(s, "staff"));
    expect(caps(fac(r)).staffBoost).toBeGreaterThan(0);
    const room = fac(r).rooms.find((x) => x.type === "staff")!;
    expect(connectedRooms(fac(r)).has(room.uid)).toBe(true);
    expect(opt(r, "staff").mode).toBe("improve");
    const r2 = ok(buyExpansion(r, "staff"));
    expect(caps(fac(r2)).staffBoost).toBeGreaterThan(caps(fac(r)).staffBoost);
  });
});

describe("choosing where it goes", () => {
  it("up to three different spots, each on owned land, none overlapping another or a room", () => {
    const s = ready();
    for (const id of ["playroom", "bath", "boarding", "staff", "yard"] as ExpansionId[]) {
      const spots = expansionSpots(s, id);
      expect(spots.length, id).toBeGreaterThanOrEqual(2);
      expect(spots.length).toBeLessThanOrEqual(3);
      for (const [i, sp] of spots.entries()) {
        const tiles = rectTiles(sp.c, sp.r, sp.w, sp.d);
        expect(tiles.every((t) => isOwned(fac(s).land, t.c, t.r))).toBe(true);
        expect(fac(s).rooms.some((room) => tiles.some((t) => containsTile(room, t)))).toBe(false);
        for (const other of spots.slice(i + 1)) expect(tiles.some((t) => containsTile(other, t)), `${id} spots overlap`).toBe(false);
        expect(sp.near.length).toBeGreaterThan(3);
        expect(sp.cost).toBeGreaterThan(0);
      }
    }
  });
  it("building at the second spot builds there, for that spot's price", () => {
    const s = ready();
    const sp = expansionSpots(s, "boarding")[1]!;
    const r = ok(buyExpansion(s, "boarding", { c: sp.c, r: sp.r }));
    const room = fac(r).rooms.find((x) => x.type === "boarding")!;
    expect({ c: room.c, r: room.r, w: room.w, d: room.d }).toEqual({ c: sp.c, r: sp.r, w: sp.w, d: sp.d });
    expect(spent(r) - spent(s)).toBe(sp.cost);
  });
  it("a spot that wasn't offered is refused and nothing changes", () => {
    const s = ready();
    const r = buyExpansion(s, "playroom", { c: 0, r: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/spot/i);
  });
  it("an improvement has no spot to choose (it goes where it's needed)", () => {
    const r = ok(buyExpansion(ready(), "bath"));
    expect(opt(r, "bath").mode).toBe("improve");
    expect(expansionSpots(r, "bath")).toEqual([]);
  });
});
