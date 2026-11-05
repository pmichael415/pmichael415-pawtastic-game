// Audit gap E: an expansion is bound to the complete purchase the player saw — the footprint, the room type and pup
// group, its door, the furnishings and the total — not just the spot's coordinates. If any of it changed since it was
// shown, nothing is built or charged and a fresh confirmation is needed. A replay does nothing; buying again on
// purpose (from a fresh quote) works.
import { describe, expect, it } from "vitest";
import { groupOf } from "@/game/engine";
import { EXPANSION_LEVEL, buyExpansion, expansionQuote, expansionSpots } from "./expansion";
import { xpForLevel } from "./progress";
import { createArrival } from "./run";
import { quickStart } from "./start";
import { fac, newTycoon, withFac } from "./state";
import { ok } from "./testkit";
import type { TycoonState } from "./types";

const spent = (s: TycoonState) => fac(s).ledger.find((l) => l.day === fac(s).day)?.expenses.building ?? 0;
const ready = (): TycoonState => ({ ...ok(quickStart(newTycoon(0))), coins: 3000, xp: xpForLevel(EXPANSION_LEVEL), tour: null });
/** A family waiting at the desk with a pup of this kind (a real arrival, then its size and temper set). */
function waiting(s: TycoonState, size: "small" | "large", temper: "gentle" | "active"): TycoonState {
  const f = fac(s);
  const t = ok(createArrival(withFac(s, { ...f, open: true, clockMin: 9 * 60, dogs: [] }), () => 0.1));
  return withFac(t, { ...fac(t), dogs: fac(t).dogs.map((d) => ({ ...d, size, temper, boarding: false })) });
}

describe("an expansion is bound to the purchase that was shown (audit gap E)", () => {
  it("the quote says exactly what will be built: room, pup group, door, furnishings and total", () => {
    const s = waiting(ready(), "large", "gentle");
    const spot = expansionSpots(s, "playroom")[0]!;
    const q = expansionQuote(s, "playroom", spot);
    if (typeof q === "string") throw new Error(q);
    expect(q.rooms).toHaveLength(1);
    expect(q.rooms[0]).toMatchObject({ type: "playroom", group: "large-gentle", c: spot.c, r: spot.r });
    expect(q.rooms[0]!.doors).toHaveLength(1);
    expect(q.things.filter((t) => t.kind === "dog_bed")).toHaveLength(3);
    expect(q.cost).toBe(spot.cost);
    const t = ok(buyExpansion(s, "playroom", spot, q));
    expect(fac(t).rooms.at(-1)).toMatchObject({ type: "playroom", group: "large-gentle" });
    expect(spent(t) - spent(s)).toBe(q.cost);
  });

  it("the waiting family changed after the spot was shown: the same spot would now be a different playroom — refused, nothing charged", () => {
    const shown = waiting(ready(), "large", "gentle");
    const spot = expansionSpots(shown, "playroom")[0]!;
    const q = expansionQuote(shown, "playroom", spot);
    if (typeof q === "string") throw new Error(q);
    // by the time Build here is tapped, a Small & Active family is the one waiting
    const now = waiting(shown, "small", "active");
    expect(groupOf(fac(now).dogs[0]!)).toBe("small-active");
    // what the coordinates-only confirmation did: it builds a playroom for whoever waits now — not the one shown
    const coordsOnly = buyExpansion(now, "playroom", { c: spot.c, r: spot.r });
    expect(coordsOnly.ok && fac(coordsOnly.state).rooms.at(-1)!.group).toBe("small-active");
    expect(q.rooms[0]!.group).toBe("large-gentle");
    const r = buyExpansion(now, "playroom", spot, q);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/changed/i);
    // and the fresh quote names what it would build now
    const fresh = expansionQuote(now, "playroom", spot);
    if (typeof fresh === "string") throw new Error(fresh);
    expect(fresh.rooms[0]!.group).toBe("small-active");
  });

  it("replaying a confirmed expansion does nothing; buying the improvement again from a fresh quote works", () => {
    const s = waiting(ready(), "large", "gentle");
    const spot = expansionSpots(s, "playroom")[0]!;
    const q = expansionQuote(s, "playroom", spot);
    if (typeof q === "string") throw new Error(q);
    const a = ok(buyExpansion(s, "playroom", spot, q));
    expect(buyExpansion(a, "playroom", spot, q).ok).toBe(false);
    expect(fac(a).rooms.filter((r) => r.type === "playroom")).toHaveLength(2);
    // an improvement (no spot): the same quote twice builds once; a fresh quote buys another
    const b0 = { ...a, coins: 3000 };
    const imp = expansionQuote(b0, "bath");
    if (typeof imp === "string") throw new Error(imp);
    const b1 = ok(buyExpansion(b0, "bath", expansionSpots(b0, "bath")[0], imp));
    expect(buyExpansion(b1, "bath", expansionSpots(b0, "bath")[0], imp).ok).toBe(false);
  });
});
