import { describe, expect, it } from "vitest";
import { caps, connectedRooms } from "./connect";
import { fac, newTycoon } from "./state";
import { ok } from "./testkit";
import { startTour } from "./tour";
import { buildPlayroomFor, playroomCost, playroomQuote, restAtHome } from "./tourActions";
import { placeThing } from "./build";

describe("the tour's one-tap choices", () => {
  it("builds a working Large & Active playroom with a dog spot, for exactly the cost shown", () => {
    const s = startTour({ ...newTycoon(0), coins: 5000 }, "quick", 0);
    const cost = playroomCost(s, "large-active")!;
    expect(cost).toBeGreaterThan(200);
    const after = ok(buildPlayroomFor(s, "large-active"));
    const room = caps(fac(after)).playrooms.find((p) => p.room.group === "large-active");
    expect(room?.spots).toBe(1);
    const spentBefore = fac(s).rooms.reduce((n, r) => n + r.spent, 0) + fac(s).items.reduce((n, i) => n + i.spent, 0);
    const spentAfter = fac(after).rooms.reduce((n, r) => n + r.spent, 0) + fac(after).items.reduce((n, i) => n + i.spent, 0);
    expect(spentAfter - spentBefore).toBe(cost);
  });
  it("the new playroom joins the building — next to a room, with a door into it — not out on the lot behind a path (play-session finding)", () => {
    const s = startTour({ ...newTycoon(0), coins: 5000 }, "quick", 0);
    const after = ok(buildPlayroomFor(s, "large-active"));
    const f = fac(after);
    const room = f.rooms.at(-1)!;
    expect(connectedRooms(f).has(room.uid)).toBe(true);
    const touching = fac(s).rooms.some((r) => room.c < r.c + r.w + 1 && r.c < room.c + room.w + 1 && room.r < r.r + r.d + 1 && r.r < room.r + room.d + 1);
    expect(touching).toBe(true);
    expect(f.items.filter((i) => i.kind === "path").length).toBe(fac(s).items.filter((i) => i.kind === "path").length);
  });
  it("letting a pup rest sends them home free, from the lobby, with no pay", () => {
    const s = startTour(newTycoon(0), "quick", 0);
    const r = restAtHome(s, fac(s).dogs[0]!.id);
    expect(r.ok && fac(r.state).dogs).toEqual([]);
    expect(r.ok && r.state.coins).toBe(s.coins);
    expect(r.ok && fac(r.state).stats.checkouts).toBe(0);
  });
});

describe("letting a pup rest is truly free", () => {
  it("an unchecked pup goes home without counting a check-in (so no supplies are charged for it)", async () => {
    const { fac: facOf, newTycoon: fresh } = await import("./state");
    const { startTour: start } = await import("./tour");
    const { today } = await import("./business");
    let s = start(fresh(Date.now()), "quick", Date.now());
    const f0 = facOf(s);
    const dog = f0.dogs[0]!;
    const before = today(f0).checkIns;
    const r = restAtHome(s, dog.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    s = r.state;
    expect(facOf(s).dogs.some((d) => d.id === dog.id)).toBe(false);
    expect(today(facOf(s)).checkIns).toBe(before);
    expect(s.coins).toBe(start(fresh(Date.now()), "quick", Date.now()).coins);
  });
});

describe("the guide's \"Build a playroom\" is bound to what its button showed (audit gap E)", () => {
  it("a layout change behind the button (its spot taken) charges nothing; the fresh quote builds; a replay does nothing", () => {
    const s = startTour({ ...newTycoon(0), coins: 5000 }, "quick", 0);
    const shown = playroomQuote(s, "large-active")!;
    expect(shown.rooms[0]).toMatchObject({ type: "playroom", group: "large-active" });
    expect(shown.things.map((x) => x.kind)).toContain("dog_bed");
    // meanwhile a flower bed goes where that playroom would have been
    const r0 = shown.rooms[0]!;
    const blocked = ok(placeThing(s, "flowers", r0.c + 1, r0.r + 1, 0));
    const coins = blocked.coins;
    const r = buildPlayroomFor(blocked, "large-active", shown);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/as shown|no spot/);
    expect(fac(blocked).rooms).toHaveLength(fac(s).rooms.length);
    expect(blocked.coins).toBe(coins);
    // from what the button shows now, it builds — once
    const fresh = playroomQuote(blocked, "large-active")!;
    const built = ok(buildPlayroomFor(blocked, "large-active", fresh));
    expect(coins - built.coins).toBeLessThanOrEqual(fresh.cost); // (a level-up reward can come back)
    expect(fac(built).rooms.at(-1)).toMatchObject({ type: "playroom", group: "large-active", c: fresh.rooms[0]!.c, r: fresh.rooms[0]!.r });
    expect(buildPlayroomFor(built, "large-active", fresh).ok).toBe(false);
    expect(fac(built).rooms.filter((x) => x.type === "playroom" && x.group === "large-active")).toHaveLength(1);
  });
});
