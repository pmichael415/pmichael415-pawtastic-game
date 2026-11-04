// Building a room you can use (empire milestone §2): choose the room, see its footprint, entrance, route and the full
// price before you pay; confirming builds room + door + path + type in one step for exactly that price, or refuses with
// nothing charged. A door snaps into a neighbouring room when there is one; otherwise a path leads to the entrance.
import { describe, expect, it } from "vitest";
import { buildConnectedRoom, connectRoom, connectionPlan, placeInRoom, placeThing, planRoom, removeDoor, sellRoom, sellThing, spotInRoom } from "./build";
import { DOOR_PRICE } from "./catalog";
import { connectedRooms, roomStatus } from "./connect";
import { wayIn } from "./rooms";
import { roomPrice } from "./grid";
import { quickStart } from "./start";
import { createArrival } from "./run";
import { fac, newTycoon, withFac } from "./state";
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
  it("builds a typed, connected room for exactly the price shown; it works once it has its tub; replaying it does nothing", () => {
    const s = start();
    const rect = { c: 11, r: 17, w: 3, d: 3 };
    const p = planRoom(fac(s), rect);
    if (!p.ok) throw new Error("plan failed");
    const r = ok(buildConnectedRoom(s, rect, "bath", undefined, p));
    const room = fac(r).rooms.at(-1)!;
    expect(room).toMatchObject({ type: "bath", ...rect });
    expect(connectedRooms(fac(r)).has(room.uid)).toBe(true);
    expect(roomStatus(fac(r), room).connected).toBe(true);
    expect(spent(r) - spent(s)).toBe(p.cost.total);
    // connected isn't working: a bath room does nothing for families until it has a tub
    expect(roomStatus(fac(r), room).working).toBe(false);
    expect(roomStatus(fac(r), room).reason).toMatch(/tub/i);
    const tubbed = ok(placeInRoom(r, room.uid, "bath_tub"));
    expect(roomStatus(fac(tubbed), fac(tubbed).rooms.at(-1)!).working).toBe(true);
    // the same confirmation again (a replay or a retry): refused, nothing more built or charged
    const again = buildConnectedRoom(r, rect, "bath", undefined, p);
    expect(again.ok).toBe(false);
    expect(fac(r).rooms).toHaveLength(fac(s).rooms.length + 1);
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
  it("puts the item inside that room — never another — for its price; a replayed placement does nothing, a new purchase still works", () => {
    const s = start();
    const play = fac(s).rooms.find((r) => r.type === "playroom")!;
    const spot = spotInRoom(fac(s), play.uid, "water_bowl", s.seq);
    if ("error" in spot) throw new Error(spot.error);
    expect(spot.c >= play.c && spot.c < play.c + play.w && spot.r >= play.r && spot.r < play.r + play.d).toBe(true);
    const r = ok(placeThing(s, "water_bowl", spot.c, spot.r, spot.rot));
    expect(fac(r).items.at(-1)).toMatchObject({ kind: "water_bowl", room: play.uid, c: spot.c, r: spot.r });
    expect(spent(r) - spent(s)).toBe(20);
    // the same placement again (a replay or a retry): refused, charged once
    expect(placeThing(r, "water_bowl", spot.c, spot.r, spot.rot).ok).toBe(false);
    // buying a second one on purpose still works, at a new spot, for its own price
    const second = ok(placeInRoom(r, play.uid, "water_bowl"));
    expect(fac(second).items.filter((i) => i.kind === "water_bowl")).toHaveLength(fac(r).items.filter((i) => i.kind === "water_bowl").length + 1);
    expect(spent(second) - spent(r)).toBe(20);
  });
  it("an item that doesn't belong there is refused with the reason and nothing charged", () => {
    const s = start();
    const play = fac(s).rooms.find((r) => r.type === "playroom")!;
    const r = placeInRoom(s, play.uid, "bath_tub");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Bath Room/);
  });
});

describe("never trapping pups (empire milestone §2)", () => {
  const withPupIn = (s: TycoonState, room: string): TycoonState => {
    const f = fac(s);
    const pup = { ...fac(ok(createArrival(withFac(s, { ...f, open: true, clockMin: 480 }), () => 0.1))).dogs.at(-1)!, checkedIn: true, place: { kind: "room" as const, room } };
    return withFac(s, { ...f, dogs: [...f.dogs, pup] });
  };
  const play = (s: TycoonState) => fac(s).rooms.find((r) => r.type === "playroom")!;
  const lobby = (s: TycoonState) => fac(s).rooms.find((r) => r.type === "lobby")!;
  it("removing the only door of a room with pups inside is refused, with nothing changed", () => {
    const s = withPupIn(start(), play(start()).uid);
    const r = removeDoor(s, play(s).uid, play(s).doors[0]!);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/cut off the Playroom/);
  });
  it("selling the path or the lobby that pups depend on is refused", () => {
    const s = withPupIn(start(), play(start()).uid);
    const path = fac(s).items.find((i) => i.kind === "path" && i.c === 18 && i.r === 26)!;
    const a = sellThing(s, path.uid);
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.error).toMatch(/cut off/);
    const b = sellRoom(s, lobby(s).uid);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.error).toMatch(/cut off the Playroom/);
  });
  it("with nobody inside it's your call: the door comes off and the room shows it isn't connected", () => {
    const s = start();
    const r = ok(removeDoor(s, play(s).uid, play(s).doors[0]!));
    expect(roomStatus(fac(r), play(r)).connected).toBe(false);
  });
});

describe("how a room is reached, and fixing it (empire milestone §2)", () => {
  const room = (s: TycoonState, type: string) => fac(s).rooms.find((r) => r.type === type)!;
  it("a connected room says how you get in", () => {
    const s = start();
    expect(wayIn(fac(s), room(s, "playroom"))).toEqual({ ok: true, text: "Way in: a door into the Lobby" });
    expect(wayIn(fac(s), room(s, "lobby")).text).toMatch(/^Way in: a door onto the path/);
  });
  it("a room with no door says so; Connect it adds the cheapest door for its price", () => {
    let s = start();
    s = ok(removeDoor(s, room(s, "playroom").uid, room(s, "playroom").doors[0]!));
    expect(wayIn(fac(s), room(s, "playroom"))).toMatchObject({ ok: false, text: expect.stringMatching(/no door/i) });
    const plan = connectionPlan(fac(s), room(s, "playroom").uid)!;
    expect(plan).toMatchObject({ newDoor: true, paths: [], cost: DOOR_PRICE });
    const r = ok(connectRoom(s, room(s, "playroom").uid));
    expect(roomStatus(fac(r), room(r, "playroom")).connected).toBe(true);
    expect(spent(r) - spent(s)).toBe(DOOR_PRICE);
  });
  it("a door onto grass says to pave a path; Connect it paves it", () => {
    let s = start();
    const path = fac(s).items.find((i) => i.kind === "path" && i.c === 18 && i.r === 26)!;
    s = ok(sellThing(s, path.uid));
    expect(wayIn(fac(s), room(s, "lobby"))).toMatchObject({ ok: false, text: expect.stringMatching(/path/) });
    const plan = connectionPlan(fac(s), room(s, "lobby").uid)!;
    expect(plan.newDoor).toBe(false);
    expect(plan.cost).toBe(plan.paths.length * 10);
    const r = ok(connectRoom(s, room(s, "lobby").uid));
    expect(roomStatus(fac(r), room(r, "lobby")).connected).toBe(true);
    expect(roomStatus(fac(r), room(r, "playroom")).connected).toBe(true);
  });
});
