// Building a room you can use (empire milestone §2): choose the room, see its footprint, entrance, route and the full
// price before you pay; confirming builds room + door + path + type in one step for exactly that price, or refuses with
// nothing charged. A door snaps into a neighbouring room when there is one; otherwise a path leads to the entrance.
import { describe, expect, it } from "vitest";
import { buildConnectedRoom, placeInRoom, planRoom, spotInRoom } from "./build";
import { DOOR_PRICE } from "./catalog";
import { connectedRooms, roomStatus } from "./connect";
import { roomPrice } from "./grid";
import { quickStart } from "./start";
import { fac, newTycoon } from "./state";
import { ok } from "./testkit";
import type { TycoonState } from "./types";

const start = (coins = 5000): TycoonState => ({ ...ok(quickStart(newTycoon(0))), coins, tour: null });
const spent = (s: TycoonState) => fac(s).ledger.find((l) => l.day === fac(s).day)?.expenses.building ?? 0;

describe("planning a room", () => {
  it("next to a room: the door snaps into it — no path, room + door", () => {
    const f = fac(start());
    const p = planRoom(f, { c: 16, r: 19, w: 3, d: 3 });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.paths).toEqual([]);
    expect(p.via).toBe(f.rooms.find((r) => r.type === "lobby")!.uid);
    expect(p.cost).toEqual({ room: roomPrice(3, 3), door: DOOR_PRICE, paths: 0, total: roomPrice(3, 3) + DOOR_PRICE });
  });
  it("away from the building: a path to the entrance, priced square by square", () => {
    const p = planRoom(fac(start()), { c: 11, r: 17, w: 3, d: 3 });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.via).toBeNull();
    expect(p.paths.length).toBeGreaterThan(0);
    expect(p.cost.total).toBe(p.cost.room + p.cost.door + p.cost.paths);
  });
  it("on top of another room: refused, with the reason", () => {
    const p = planRoom(fac(start()), { c: 17, r: 22, w: 3, d: 3 });
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.reason).toMatch(/overlap/i);
  });
});

describe("confirming", () => {
  it("builds a typed, connected, working room for exactly the planned price — once", () => {
    const s = start();
    const rect = { c: 11, r: 17, w: 3, d: 3 };
    const p = planRoom(fac(s), rect);
    if (!p.ok) throw new Error("plan failed");
    const r = ok(buildConnectedRoom(s, rect, "bath"));
    const room = fac(r).rooms.at(-1)!;
    expect(room).toMatchObject({ type: "bath", ...rect });
    expect(connectedRooms(fac(r)).has(room.uid)).toBe(true);
    expect(roomStatus(fac(r), room).connected).toBe(true);
    expect(spent(r) - spent(s)).toBe(p.cost.total);
  });
  it("a playroom needs its group; not enough coins: refused with nothing charged", () => {
    const s = start();
    expect(buildConnectedRoom(s, { c: 16, r: 19, w: 3, d: 3 }, "playroom").ok).toBe(false);
    const poor = start(50);
    const r = buildConnectedRoom(poor, { c: 16, r: 19, w: 3, d: 3 }, "playroom", "small-active");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/more coins/);
  });
});

describe("furnishing a chosen room", () => {
  it("puts the item inside that room — never another — for its price, once", () => {
    const s = start();
    const play = fac(s).rooms.find((r) => r.type === "playroom")!;
    const spot = spotInRoom(fac(s), play.uid, "water_bowl");
    expect("c" in spot && spot.c >= play.c && spot.c < play.c + play.w && spot.r >= play.r && spot.r < play.r + play.d).toBe(true);
    const r = ok(placeInRoom(s, play.uid, "water_bowl"));
    expect(fac(r).items.at(-1)).toMatchObject({ kind: "water_bowl", room: play.uid });
    expect(spent(r) - spent(s)).toBe(20);
  });
  it("an item that doesn't belong there is refused with the reason and nothing charged", () => {
    const s = start();
    const play = fac(s).rooms.find((r) => r.type === "playroom")!;
    const r = placeInRoom(s, play.uid, "bath_tub");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Bath Room/);
  });
});
