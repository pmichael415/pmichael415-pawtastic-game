// Families book what you offer (play-session finding, combined loop): a family whose pup has no playroom of its kind
// doesn't drop off — no tap needed, nothing charged, no reputation change — and is counted as asking today. The count
// is the reason to grow: the Playroom wing names that group and how many asked, and the next objective says so.
import { describe, expect, it } from "vitest";
import { groupOf, mulberry, seedFrom } from "@/game/engine";
import { askedToday, buyExpansion, expansionOptions, neededGroup } from "./expansion";
import { nextObjective } from "./objectives";
import { xpForLevel } from "./progress";
import { assignRoom, checkIn, tick, turnAway } from "./run";
import { caps } from "./connect";
import { quickStart } from "./start";
import { fac, parseTycoon, withFac } from "./state";
import { hire } from "./team";
import { ok } from "./testkit";
import { newTycoon } from "./state";
import type { TycoonState } from "./types";

/** A quick-start daycare (a Small & Gentle playroom only), open, past its first pup and introductory day. */
function open(): TycoonState {
  const s = ok(quickStart(newTycoon(0)));
  const f = fac(s);
  return { ...withFac(s, { ...f, open: true, clockMin: 7 * 60, introDay: 0, stats: { ...f.stats, checkouts: 1 } }), coins: 5000, xp: xpForLevel(3), tour: null, bestProfit: 50 };
}
/** A morning (07:00 → 12:00) played like a player: every family that drops off is checked in and settled. */
const morning = (s: TycoonState, seed = "demand") => {
  const r = mulberry(seedFrom(seed));
  for (let i = 0; i < 150; i++) {
    s = tick(s, 1, r);
    for (const d of fac(s).dogs.filter((x) => !x.checkedIn)) {
      const c = checkIn(s, d.id);
      if (!c.ok) continue;
      const room = caps(fac(c.state)).playrooms.find((p) => p.group === groupOf(d) && fac(c.state).dogs.filter((x) => x.place.kind === "room" && x.place.room === p.room.uid).length < p.spots);
      s = room ? ok(assignRoom(c.state, d.id, room.room.uid)) : ok(turnAway(s, d.id));
    }
  }
  return s;
};

describe("families book what you offer", () => {
  it("only pups with a playroom of their kind come in; the others are counted as asking today", () => {
    const s = morning(open());
    const f = fac(s);
    expect(f.dogs.length).toBeGreaterThan(0);
    expect(f.dogs.filter((d) => !d.boarding).every((d) => groupOf(d) === "small-gentle")).toBe(true);
    const asked = f.asked!;
    expect(asked.day).toBe(f.day);
    const total = Object.values(asked.groups).reduce((a, b) => a + (b ?? 0), 0);
    expect(total).toBeGreaterThan(0);
    expect(asked.groups["small-gentle"] ?? 0).toBe(0);
  });
  it("it costs nothing: no family leaves upset, no reputation change, no tap", () => {
    const s0 = open();
    const s = morning(s0);
    expect(fac(s).outcomes.filter((o) => o.how === "left")).toHaveLength(0);
    expect(fac(s).reputation).toBeGreaterThanOrEqual(fac(s0).reputation);
  });
  it("the count starts again each day, and saves keep it (older saves load without it)", () => {
    let s = morning(open());
    const p = parseTycoon(JSON.parse(JSON.stringify(s)))!;
    expect(fac(p).asked).toEqual(fac(s).asked);
    const old = JSON.parse(JSON.stringify(s));
    delete old.facilities.f1.asked;
    expect(fac(parseTycoon(old)!).asked ?? null).toBeNull();
    const r = mulberry(seedFrom("next"));
    for (let i = 0; i < 600 && fac(s).day === 1; i++) s = tick(s, 1, r);
    expect(askedToday(fac(s))).toEqual([]); // a new day: nobody has asked yet
  });
});

describe("the reason to grow", () => {
  it("the playroom wing is for the group most families asked for, and says how many asked", () => {
    let s = open();
    s = withFac(s, { ...fac(s), asked: { day: fac(s).day, groups: { "large-gentle": 2, "small-active": 6 } } });
    expect(neededGroup(fac(s))).toBe("small-active");
    const o = expansionOptions(s).find((x) => x.id === "playroom")!;
    expect(o.title).toMatch(/Small & Active/);
    expect(o.goodIf).toMatch(/6 Small & Active families asked today/);
  });
  it("the next objective says families are asking and points at the playroom wing — before hiring", () => {
    let s = open();
    s = withFac(s, { ...fac(s), asked: { day: fac(s).day, groups: { "small-active": 3 } } });
    const o = nextObjective(s);
    expect(o).toMatchObject({ id: "demand", action: "expand" });
    expect(o.title).toMatch(/Small & Active/);
    // once they have a room, the objective moves on
    s = ok(buyExpansion(s, "playroom"));
    expect(nextObjective(s).id).not.toBe("demand");
  });
  it("with a team already, it still points at the demand (growth before more wages)", () => {
    let s = ok(hire(open(), "reception"));
    s = withFac(s, { ...fac(s), asked: { day: fac(s).day, groups: { "large-active": 4 } } });
    expect(nextObjective(s).id).toBe("demand");
  });
});
