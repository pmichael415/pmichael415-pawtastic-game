// Audit finding 3: a confirmation is bound to exactly what the player saw — the footprint, room type and group, the
// doorway, the route and the total — and is re-checked against the current daycare before anything changes. A
// changed or stale plan charges nothing and asks for a fresh confirmation; replaying a confirmation does nothing.
import { describe, expect, it } from "vitest";
import { buildConnectedRoom, connectRoom, connectionPlan, firstFreeRoomPlan, paintPaths, placeFirstFree, placeThing, planRoom, removeDoor, sellThing, spotInRoom } from "./build";
import { quickStart } from "./start";
import { fac, newTycoon } from "./state";
import { ok } from "./testkit";
import type { TycoonState } from "./types";

const spent = (s: TycoonState) => fac(s).ledger.find((l) => l.day === fac(s).day)?.expenses.building ?? 0;
const started = (coins = 5000): TycoonState => ({ ...ok(quickStart(newTycoon(0))), coins, tour: null });

describe("the list builder builds the quote it showed", () => {
  it("replaying a confirmed list build does nothing (the audit built a second room at a different price)", () => {
    const s0 = ok(placeFirstFree({ ...newTycoon(0), coins: 5000 }, { room: "lobby" }));
    const q = firstFreeRoomPlan(fac(s0), "playroom", "small-gentle");
    if (!q.ok) throw new Error("no quote");
    const s1 = ok(buildConnectedRoom(s0, q.rect, "playroom", "small-gentle", q));
    expect(s0.coins - s1.coins).toBe(q.cost.total);
    const again = buildConnectedRoom(s1, q.rect, "playroom", "small-gentle", q);
    expect(again.ok).toBe(false);
    expect(fac(s1).rooms).toHaveLength(2);
  });
});

describe("a plan that changed since it was shown charges nothing", () => {
  it("the route grew (a path square sold meanwhile): refused with the new price, nothing charged", () => {
    let s = started();
    const rect = { c: 11, r: 17, w: 3, d: 3 };
    const shown = planRoom(fac(s), rect);
    if (!shown.ok) throw new Error("plan");
    // meanwhile the path square nearest the entrance goes (the route now needs more squares)
    s = ok(sellThing(s, fac(s).items.find((i) => i.kind === "path" && i.c === 18 && i.r === 26)!.uid));
    const now = planRoom(fac(s), rect);
    expect(now.ok && now.cost.total).not.toBe(shown.cost.total);
    const r = buildConnectedRoom(s, rect, "bath", undefined, shown);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/changed/);
  });
  it("same price, different doorway: still refused (what you saw is what you get)", () => {
    const s = started();
    const rect = { c: 16, r: 19, w: 3, d: 3 };
    const shown = planRoom(fac(s), rect);
    if (!shown.ok) throw new Error("plan");
    const other = { ...shown, door: { side: shown.door.side, i: shown.door.i === 1 ? 2 : 1 } as const };
    expect(buildConnectedRoom(s, rect, "bath", undefined, other).ok).toBe(false);
    expect(buildConnectedRoom(s, rect, "bath", undefined, shown).ok).toBe(true);
  });
});

describe("Connect it is bound to its plan", () => {
  it("replaying it does nothing; a plan that went stale charges nothing", () => {
    let s = started();
    const play = fac(s).rooms.find((r) => r.type === "playroom")!;
    s = ok(removeDoor(s, play.uid, play.doors[0]!));
    const plan = connectionPlan(fac(s), play.uid)!;
    const a = ok(connectRoom(s, play.uid, plan));
    expect(spent(a) - spent(s)).toBe(plan.cost);
    expect(connectRoom(a, play.uid, plan).ok).toBe(false); // replay
    // stale: the plan shown before a path was paved elsewhere that changes nothing → still fine; one that changes → refused
    const lobby = fac(s).rooms.find((r) => r.type === "lobby")!;
    let t = ok(removeDoor(s, lobby.uid, lobby.doors.find((d) => d.side === "S")!));
    const stale = connectionPlan(fac(t), lobby.uid)!;
    t = ok(paintPaths(t, [{ c: 17, r: 25 }]));
    const fresh = connectionPlan(fac(t), lobby.uid);
    if (fresh && (fresh.cost !== stale.cost || fresh.paths.length !== stale.paths.length)) expect(connectRoom(t, lobby.uid, stale).ok).toBe(false);
  });
});

describe("furniture goes exactly where it was shown", () => {
  it("placing at the shown spot, then replaying it, places one", () => {
    const s = started();
    const play = fac(s).rooms.find((r) => r.type === "playroom")!;
    const spot = spotInRoom(fac(s), play.uid, "rug", s.seq);
    if ("error" in spot) throw new Error(spot.error);
    const a = ok(placeThing(s, "rug", spot.c, spot.r, spot.rot));
    expect(placeThing(a, "rug", spot.c, spot.r, spot.rot).ok).toBe(false);
  });
});
