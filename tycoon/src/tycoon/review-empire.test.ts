// Independent review of the empire milestone: each confirmed finding, pinned (they failed before the fix).
import { describe, expect, it } from "vitest";
import { buildConnectedRoom, connectRoom, connectionPlan, moveThing, planRoom, removeDoor, sellRoom, sellThing } from "./build";
import { MAX_THINGS } from "./catalog";
import { connectedRooms } from "./connect";
import { buyExpansion } from "./expansion";
import { xpForLevel } from "./progress";
import { applyStaffPlan, staffPlanFor } from "./roomCare";
import { wayIn } from "./rooms";
import { createArrival } from "./run";
import { quickStart } from "./start";
import { fac, newTycoon, withFac } from "./state";
import { hire, setRooms } from "./team";
import { ok } from "./testkit";
import type { Placed, TycoonState } from "./types";

const start = (coins = 5000): TycoonState => ({ ...ok(quickStart(newTycoon(0))), coins, tour: null, xp: xpForLevel(5) });
const room = (s: TycoonState, type: string, i = 0) => fac(s).rooms.filter((r) => r.type === type)[i]!;
const spent = (s: TycoonState) => fac(s).ledger.find((l) => l.day === fac(s).day)?.expenses.building ?? 0;
const pupIn = (s: TycoonState, place: { kind: "room"; room: string }, extra = {}): TycoonState => {
  const f = fac(s);
  const d = { ...fac(ok(createArrival(withFac(s, { ...f, open: true, clockMin: 480 }), () => 0.1))).dogs.at(-1)!, checkedIn: true, place, ...extra };
  return withFac(s, { ...f, dogs: [...f.dogs, d] });
};
const fill = (s: TycoonState, n: number): TycoonState => {
  const f = fac(s);
  const extra: Placed[] = Array.from({ length: n }, (_, i) => ({ uid: `fill${i}`, kind: "flowers", c: 30 + (i % 4), r: i % 30, rot: 0, level: 1, spent: 0, room: null, closed: false }));
  return withFac(s, { ...f, items: [...f.items, ...extra] });
};

describe("1. a route that would pass the 200-thing limit is refused up front, never half-built", () => {
  it("Connect it: refused with the reason and nothing charged when the path squares won't fit", () => {
    let s = start();
    for (const c of [26, 25]) s = ok(sellThing(s, fac(s).items.find((i) => i.kind === "path" && i.c === 18 && i.r === c)!.uid));
    const plan = connectionPlan(fac(s), room(s, "lobby").uid)!;
    expect(plan.paths.length).toBeGreaterThanOrEqual(2);
    s = fill(s, MAX_THINGS - fac(s).items.length - 1);
    const r = connectRoom(s, room(s, "lobby").uid);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/full/);
  });
  it("planning a room whose path won't fit says so", () => {
    const s = fill(start(), MAX_THINGS - fac(start()).items.length);
    const p = planRoom(fac(s), { c: 11, r: 17, w: 3, d: 3 });
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.reason).toMatch(/full/);
  });
});

describe("3. a pup in the bath counts as inside the bath room", () => {
  it("its door can't be removed, and the room can't be sold, mid-bath", () => {
    let s = ok(buyExpansion(start(), "bath"));
    const bath = room(s, "bath");
    const tub = fac(s).items.find((i) => i.room === bath.uid && /tub/.test(i.kind))!;
    s = pupIn(s, { kind: "room", room: room(s, "playroom").uid }, { bathing: 20, bathTub: tub.uid });
    const r = removeDoor(s, bath.uid, bath.doors[0]!);
    expect(r.ok).toBe(false);
    expect(sellRoom(s, bath.uid).ok).toBe(false);
  });
});

describe("4. moving a path square can't cut off pups either", () => {
  it("moving the path in front of the lobby away is refused while pups are inside", () => {
    const s = pupIn(start(), { kind: "room", room: room(start(), "playroom").uid });
    const path = fac(s).items.find((i) => i.kind === "path" && i.c === 18 && i.r === 26)!;
    const r = moveThing(s, path.uid, 11, 25, 0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cut off/);
  });
});

describe("5. 'Add it to X's rooms' only lists playrooms, so it can be done", () => {
  it("an attendant whose old playroom became a calm room can still take the new playroom", () => {
    let s = ok(hire(start(), "attendant"));
    s = ok(buyExpansion(s, "playroom"));
    const att = fac(s).staff.at(-1)!;
    const [p1, p2] = [room(s, "playroom", 0), room(s, "playroom", 1)];
    s = ok(setRooms(s, att.id, [p2.uid]));
    // the second playroom is retyped while it's on their list
    s = withFac(s, { ...fac(s), rooms: fac(s).rooms.map((r) => (r.uid === p2.uid ? { ...r, type: "calm" as const, group: null } : r)) });
    const plan = staffPlanFor(fac(s), p1);
    expect(plan.kind).toBe("assign");
    expect(applyStaffPlan(s, plan).ok).toBe(true);
  });
});

describe("6. Connect it never offers a fifth door", () => {
  it("a room with 4 doors leading nowhere gets no new-door plan", () => {
    let s = start();
    const lobby = room(s, "lobby");
    const doors = [{ side: "N" as const, i: 1 }, { side: "N" as const, i: 2 }, { side: "E" as const, i: 1 }, { side: "S" as const, i: 1 }];
    s = withFac(s, { ...fac(s), rooms: fac(s).rooms.map((r) => (r.uid === lobby.uid ? { ...r, doors } : r)) });
    const plan = connectionPlan(fac(s), lobby.uid);
    expect(!plan || !plan.newDoor).toBe(true);
  });
});

describe("7. a small room right against a room gets its door on the neighbour's wall", () => {
  it("a 2 × 2 room beside the lobby can be planned and built connected (as the starter calm room is)", () => {
    const s = start();
    const rect = { c: 16, r: 20, w: 2, d: 2 };
    const p = planRoom(fac(s), rect);
    expect(p.ok).toBe(true);
    const r = ok(buildConnectedRoom(s, rect, "calm"));
    const calm = fac(r).rooms.at(-1)!;
    expect(connectedRooms(fac(r)).has(calm.uid)).toBe(true);
    if (p.ok) expect(spent(r) - spent(s)).toBe(p.cost.total);
  });
});

describe("8. 'Way in' names only the ways in", () => {
  it("the starter lobby: the door onto the path to the entrance — not the rooms reached through it", () => {
    const s = start();
    expect(wayIn(fac(s), room(s, "lobby")).text).toBe("Way in: a door onto the path to the entrance");
    expect(wayIn(fac(s), room(s, "playroom")).text).toBe("Way in: a door into the Lobby");
  });
});

describe("9. building charges the price you saw, or nothing", () => {
  it("a quote that no longer matches is refused with the new price, nothing charged", () => {
    const s = start();
    const rect = { c: 11, r: 17, w: 3, d: 3 };
    const p = planRoom(fac(s), rect);
    if (!p.ok) throw new Error("plan");
    const r = buildConnectedRoom(s, rect, "bath", undefined, p.cost.total - 10);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(new RegExp(`${p.cost.total}`));
  });
});
