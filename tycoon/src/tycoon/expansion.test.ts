// The first expansion decision (staff design §5): two real options with honest costs, built for real, and improved
// rather than duplicated the second time.
import { describe, expect, it } from "vitest";
import { facilityUpkeep } from "./business";
import { caps } from "./connect";
import { EXPANSION_LEVEL, askedToday, buyExpansion, demandGroup, expansionOptions } from "./expansion";
import { xpForLevel } from "./progress";
import { tick } from "./run";
import { quickStart } from "./start";
import { fac, newTycoon, withFac } from "./state";
import { hire } from "./team";
import { ok } from "./testkit";
import { defaultVisit } from "./visit";
import type { TDog, TycoonState } from "./types";

const still = () => 0.99;
/** A quick-start daycare at the expansion level with savings. */
function ready(coins = 2500): TycoonState {
  const s = ok(quickStart(newTycoon(0)));
  return { ...s, coins, xp: xpForLevel(EXPANSION_LEVEL), tour: null };
}
const opt = (s: TycoonState, id: "playroom" | "bath") => expansionOptions(s).find((o) => o.id === id)!;

describe("the choice", () => {
  it("below the expansion level the options are shown but locked", () => {
    const s = { ...ready(), xp: 0 };
    for (const o of expansionOptions(s)) {
      expect(o.available).toBe(false);
      expect(o.why).toMatch(/level/i);
    }
  });
  it("the first two options (playroom wing, bath station) have a coin cost, capacity, staffing, upkeep and what they make possible", () => {
    // (the other three ways to grow are in expansion-ways.test.ts)
    const opts = expansionOptions(ready()).filter((o) => o.id === "playroom" || o.id === "bath");
    expect(opts.map((o) => o.id).sort()).toEqual(["bath", "playroom"]);
    for (const o of opts) {
      expect(o.cost).toBeGreaterThan(0);
      expect(o.upkeep).toBeGreaterThan(0);
      expect(o.capacity.length).toBeGreaterThan(5);
      expect(o.staffing).toMatch(/attendant/);
      expect(o.unlocks.length).toBeGreaterThan(5);
      expect(o.available).toBe(true);
    }
  });
  it("not enough coins: refused, nothing changes", () => {
    const s = ready(100);
    expect(opt(s, "bath").available).toBe(false);
    const r = buyExpansion(s, "bath");
    expect(r.ok).toBe(false);
  });
});

describe("a bath station", () => {
  it("is built for real: a working bath room with a tub, for exactly the quoted cost and upkeep", () => {
    const s = ready();
    const o = opt(s, "bath");
    const r = ok(buyExpansion(s, "bath"));
    const spent = (x: TycoonState) => fac(x).ledger.find((l) => l.day === fac(x).day)?.expenses.building ?? 0;
    expect(spent(r) - spent(s)).toBe(o.cost);
    expect(caps(fac(r)).tubs).toHaveLength(1);
    expect(facilityUpkeep(fac(r)) - facilityUpkeep(fac(s))).toBe(o.upkeep);
  });
  it("the second time it adds a second tub to the same bath room instead of building another", () => {
    let s = ok(buyExpansion(ready(5000), "bath"));
    expect(opt(s, "bath").mode).toBe("improve");
    s = ok(buyExpansion(s, "bath"));
    expect(caps(fac(s)).tubs).toHaveLength(2);
    expect(fac(s).rooms.filter((r) => r.type === "bath")).toHaveLength(1);
  });
});

describe("a playroom wing", () => {
  it("is built for the group that's waiting without a room, with 3 spots, connected and working", () => {
    let s = ready();
    const f = fac(s);
    const d: TDog = { id: "d90", name: "Bruno", breed: 0, size: "large", temper: "active", visits: 1, place: { kind: "lobby" }, checkedIn: false, happiness: 80, clean: 60, boarding: false, played: 0, bathed: false };
    s = withFac(s, { ...f, dogs: [{ ...d, visit: defaultVisit(f, d) }] });
    const hadLarge = caps(f).playrooms.some((p) => p.group === "large-active");
    s = ok(buyExpansion(s, "playroom"));
    const rooms = caps(fac(s)).playrooms;
    expect(rooms.length).toBe(caps(f).playrooms.length + 1);
    if (!hadLarge) expect(rooms.at(-1)).toMatchObject({ group: "large-active", spots: 3 });
  });
  it("and it's used: a receptionist settles the waiting pup there", () => {
    let s = ready();
    const f = fac(s);
    const d: TDog = { id: "d90", name: "Bruno", breed: 0, size: "large", temper: "active", visits: 1, place: { kind: "lobby" }, checkedIn: false, happiness: 80, clean: 60, boarding: false, played: 0, bathed: false };
    s = withFac(s, { ...f, open: true, clockMin: 9 * 60, dogs: [{ ...d, visit: { ...defaultVisit(f, d), arrivedDay: f.day, arrived: 9 * 60 } }] });
    s = ok(buyExpansion(s, "playroom"));
    s = ok(hire(s, "reception"));
    for (let i = 0; i < 40; i++) s = tick(s, 0.5, still);
    const bruno = fac(s).dogs.find((x) => x.id === "d90")!;
    const wing = caps(fac(s)).playrooms.at(-1)!.room.uid;
    expect(bruno.place).toMatchObject({ kind: "room", room: wing });
  });
  it("the second time it improves the busiest playroom (+1 spot) instead of building another", () => {
    let s = ok(buyExpansion(ready(5000), "playroom"));
    expect(opt(s, "playroom").mode).toBe("improve");
    const before = caps(fac(s)).playrooms.reduce((a, p) => a + p.spots, 0);
    const count = fac(s).rooms.filter((r) => r.type === "playroom").length;
    s = ok(buyExpansion(s, "playroom"));
    expect(caps(fac(s)).playrooms.reduce((a, p) => a + p.spots, 0)).toBe(before + 1);
    expect(fac(s).rooms.filter((r) => r.type === "playroom")).toHaveLength(count);
  });
});

// Found in the first-session play-through: with two kinds of pup asked for equally often, Next named one kind and the
// card, seconds later, the other — the tie went to whichever was recorded first. Ties now break the same way always.
describe("the kind of pup families want most", () => {
  it("a tie doesn't depend on which kind asked first", () => {
    const f = fac(ok(quickStart(newTycoon(0))));
    const a = { ...f, asked: { day: f.day, groups: { "large-gentle": 8, "large-active": 8 } } };
    const b = { ...f, asked: { day: f.day, groups: { "large-active": 8, "large-gentle": 8 } } };
    expect(askedToday(a).map((x) => x.group)).toEqual(askedToday(b).map((x) => x.group));
    expect(demandGroup(a)).toBe(demandGroup(b));
  });
  it("more asks still come first", () => {
    const f = fac(ok(quickStart(newTycoon(0))));
    expect(demandGroup({ ...f, asked: { day: f.day, groups: { "large-active": 7, "large-gentle": 8 } } })).toBe("large-gentle");
  });
});
