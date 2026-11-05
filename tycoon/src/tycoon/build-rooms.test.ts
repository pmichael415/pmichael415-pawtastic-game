import { describe, expect, it } from "vitest";
import { addDoor, drawRoom, moveRoom, paintRoom, removeDoor, sellRoom, setRoomType } from "./build";
import { START_COINS } from "./catalog";
import { fac, newTycoon, withFac } from "./state";
import type { TDog, TResult, TycoonState } from "./types";

const ok = (r: TResult): TycoonState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
/** A daycare that has opened its doors at least once (before that, building can be undone for a full refund). */
const opened = (s: TycoonState): TycoonState => withFac(s, { ...fac(s), introDay: 0 });
const lastRoom = (s: TycoonState) => fac(s).rooms[fac(s).rooms.length - 1]!;
const dogIn = (s: TycoonState, room: string): TycoonState =>
  withFac(s, {
    ...fac(s),
    dogs: [{ id: "d1", name: "Biscuit", breed: 0, size: "small", temper: "gentle", visits: 1, place: { kind: "room", room }, checkedIn: true, happiness: 70, clean: 70, boarding: false, played: 0, bathed: false } as TDog],
  });

describe("drawing rooms", () => {
  const s0 = newTycoon(0);
  it("costs walls plus floor and starts without a type or doors", () => {
    const s = ok(drawRoom(s0, 10, 16, 4, 3));
    expect(s.coins).toBe(START_COINS - 400);
    expect(lastRoom(s)).toMatchObject({ c: 10, r: 16, w: 4, d: 3, type: null, doors: [], spent: 400 });
  });
  it("must be 2–10 squares a side, on owned land", () => {
    expect(drawRoom(s0, 10, 16, 1, 3)).toEqual({ ok: false, error: "Rooms are 2–10 squares a side." });
    expect(drawRoom(s0, 10, 16, 11, 3)).toEqual({ ok: false, error: "Rooms are 2–10 squares a side." });
    expect(drawRoom(s0, 2, 20, 3, 3)).toEqual({ ok: false, error: "Buy this land first." });
  });
  it("can't overlap another room, but can share a wall with it", () => {
    const s = ok(drawRoom(s0, 10, 16, 4, 3));
    expect(drawRoom(s, 12, 16, 3, 3)).toMatchObject({ ok: false, error: expect.stringMatching(/Overlaps/) });
    expect(drawRoom(s, 14, 16, 3, 3).ok).toBe(true);
  });
  it("can't cover the entrance", () => {
    expect(drawRoom(s0, 17, 25, 3, 3)).toEqual({ ok: false, error: "Overlaps the entrance." });
  });
  it("needs enough coins", () => {
    expect(drawRoom({ ...s0, coins: 100 }, 10, 16, 4, 3)).toEqual({ ok: false, error: "Need 300 more coins." });
  });
});

describe("doors", () => {
  const s = ok(drawRoom(opened(newTycoon(0)), 10, 16, 4, 3));
  const uid = lastRoom(s).uid;
  it("cost 30 and add to what the room is worth", () => {
    const t = ok(addDoor(s, uid, { side: "S", i: 1 }));
    expect(t.coins).toBe(s.coins - 30);
    expect(lastRoom(t)).toMatchObject({ doors: [{ side: "S", i: 1 }], spent: 430 });
  });
  it("can't go on corners, can't repeat, and a room has at most 4", () => {
    expect(addDoor(s, uid, { side: "S", i: 0 })).toEqual({ ok: false, error: "Doors can't go on corners." });
    const one = ok(addDoor(s, uid, { side: "S", i: 1 }));
    expect(addDoor(one, uid, { side: "S", i: 1 })).toEqual({ ok: false, error: "There's already a door there." });
    let t = one;
    for (const d of [{ side: "S" as const, i: 2 }, { side: "N" as const, i: 1 }, { side: "N" as const, i: 2 }]) t = ok(addDoor(t, uid, d));
    expect(addDoor(t, uid, { side: "E", i: 1 })).toEqual({ ok: false, error: "A room can have up to 4 doors." });
  });
  it("removing a door refunds 75%", () => {
    const one = ok(addDoor(s, uid, { side: "S", i: 1 }));
    const t = ok(removeDoor(one, uid, { side: "S", i: 1 }));
    expect(t.coins).toBe(one.coins + 22);
    expect(lastRoom(t).doors).toEqual([]);
  });
});

describe("room types and paint", () => {
  const s = ok(drawRoom(newTycoon(0), 10, 16, 4, 3));
  const uid = lastRoom(s).uid;
  it("setting a type is free; playrooms need a group; one lobby per daycare", () => {
    const t = ok(setRoomType(s, uid, "lobby"));
    expect(t.coins).toBe(s.coins);
    expect(lastRoom(t).type).toBe("lobby");
    expect(setRoomType(s, uid, "playroom")).toEqual({ ok: false, error: "Pick a group for this playroom." });
    const two = ok(drawRoom(t, 16, 16, 3, 3));
    expect(setRoomType(two, lastRoom(two).uid, "lobby")).toEqual({ ok: false, error: "Only one Lobby per daycare." });
  });
  it("won't change while dogs are inside", () => {
    const t = dogIn(ok(setRoomType(s, uid, "playroom", "small-gentle")), uid);
    expect(setRoomType(t, uid, "calm")).toEqual({ ok: false, error: "Move the dogs out first." });
  });
  it("paint is free and only uses the offered floors and colours", () => {
    const t = ok(paintRoom(s, uid, "carpet", "#DCEBFA"));
    expect(t.coins).toBe(s.coins);
    expect(lastRoom(t)).toMatchObject({ floor: "carpet", wall: "#DCEBFA" });
    expect(paintRoom(s, uid, "marble" as never, "#DCEBFA")).toEqual({ ok: false, error: "Pick one of the offered floors and colours." });
  });
});

describe("moving and selling rooms", () => {
  const base = ok(setRoomType(ok(drawRoom(opened(newTycoon(0)), 10, 16, 4, 3)), "r1", "lobby"));
  it("moving is free and takes the furniture along", () => {
    const withCounter = withFac(base, { ...fac(base), items: [...fac(base).items, { uid: "k1", kind: "front_counter", c: 11, r: 17, rot: 0, level: 1, spent: 300, room: "r1", closed: false }] });
    const t = ok(moveRoom(withCounter, "r1", 12, 18));
    expect(t.coins).toBe(withCounter.coins);
    expect(lastRoom(t)).toMatchObject({ c: 12, r: 18 });
    expect(fac(t).items.find((i) => i.uid === "k1")).toMatchObject({ c: 13, r: 19 });
  });
  it("a move that doesn't fit is refused and nothing changes", () => {
    const blocked = ok(drawRoom(base, 20, 16, 3, 3));
    expect(moveRoom(blocked, "r1", 19, 16)).toMatchObject({ ok: false, error: expect.stringMatching(/Overlaps/) });
    expect(moveRoom(blocked, "r1", 23, 16)).toEqual({ ok: false, error: "Buy this land first." });
    expect(lastRoom(blocked).uid).not.toBe("r1");
    expect(fac(blocked).rooms.find((r) => r.uid === "r1")).toMatchObject({ c: 10, r: 16 });
  });
  it("selling refunds 75% of the room and everything in it", () => {
    const withCounter = withFac(base, { ...fac(base), items: [...fac(base).items, { uid: "k1", kind: "front_counter", c: 11, r: 17, rot: 0, level: 1, spent: 300, room: "r1", closed: false }] });
    const t = ok(sellRoom(withCounter, "r1"));
    expect(t.coins).toBe(withCounter.coins + Math.floor(0.75 * 700));
    expect(fac(t).rooms).toHaveLength(0);
    expect(fac(t).items.some((i) => i.uid === "k1")).toBe(false);
  });
  it("before the daycare first opens, changing your mind is free: selling refunds everything", () => {
    const fresh = ok(setRoomType(ok(drawRoom(newTycoon(0), 10, 16, 4, 3)), "r1", "lobby"));
    const withCounter = withFac(fresh, { ...fac(fresh), items: [...fac(fresh).items, { uid: "k1", kind: "front_counter", c: 11, r: 17, rot: 0, level: 1, spent: 300, room: "r1", closed: false }] });
    expect(ok(sellRoom(withCounter, "r1")).coins).toBe(withCounter.coins + 700);
    const one = ok(addDoor(fresh, "r1", { side: "S", i: 1 }));
    expect(ok(removeDoor(one, "r1", { side: "S", i: 1 })).coins).toBe(fresh.coins);
  });
  it("rooms with dogs inside can't be moved or sold", () => {
    const t = dogIn(base, "r1");
    expect(moveRoom(t, "r1", 12, 18)).toEqual({ ok: false, error: "Move the dogs out first." });
    expect(sellRoom(t, "r1")).toEqual({ ok: false, error: "Move the dogs out first." });
  });
});
