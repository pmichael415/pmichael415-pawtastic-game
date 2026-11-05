import { describe, expect, it } from "vitest";
import { buyLand, drawRoom, moveRoom, moveThing, paintPaths, placeThing, sellRoom, sellThing, setClosed, setRoomType, upgradeThing } from "./build";
import { fac, newTycoon, withFac } from "./state";
import type { Placed, TDog, TResult, TycoonState } from "./types";

const ok = (r: TResult): TycoonState => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const lastRoom = (s: TycoonState) => fac(s).rooms[fac(s).rooms.length - 1]!;
const lastThing = (s: TycoonState) => fac(s).items[fac(s).items.length - 1]!;
/** A daycare that has opened its doors at least once (before that, building can be undone for a full refund). */
const opened = (s: TycoonState): TycoonState => withFac(s, { ...fac(s), introDay: 0 });
const atLevel = (s: TycoonState, n: number): TycoonState => ({ ...s, xp: 50 * n * (n - 1) });
const dog = (place: TDog["place"]): TDog =>
  ({ id: "d1", name: "Biscuit", breed: 0, size: "small", temper: "gentle", visits: 1, place, checkedIn: true, happiness: 70, clean: 70, boarding: false, played: 0, bathed: false }) as TDog;
const withDog = (s: TycoonState, place: TDog["place"]): TycoonState => withFac(s, { ...fac(s), dogs: [dog(place)] });

/** A 4 × 3 room at (10,16) with the given type. */
const typed = (type: "lobby" | "playroom" | "staff", s = newTycoon(0)) => {
  const a = ok(drawRoom(s, 10, 16, 4, 3));
  const uid = lastRoom(a).uid;
  return { s: ok(setRoomType(a, uid, type, type === "playroom" ? "small-gentle" : undefined)), uid };
};

describe("furniture", () => {
  it("is placed in the room that holds all its squares, and pays its price", () => {
    const { s, uid } = typed("playroom");
    const t = ok(placeThing(s, "dog_bed", 11, 17, 0));
    expect(t.coins).toBe(s.coins - 60);
    expect(lastThing(t)).toMatchObject({ kind: "dog_bed", c: 11, r: 17, rot: 0, level: 1, spent: 60, room: uid, closed: false });
  });
  it("must suit the room type", () => {
    const { s } = typed("playroom");
    expect(placeThing(atLevel(s, 2), "bath_tub", 10, 16, 0)).toEqual({ ok: false, error: "Bath tubs go in a Bath Room." });
  });
  it("must sit inside a room", () => {
    expect(placeThing(newTycoon(0), "water_bowl", 12, 20, 0)).toEqual({ ok: false, error: "Furniture goes inside a room." });
  });
  it("can't overlap other furniture in the room", () => {
    const { s } = typed("playroom");
    const t = ok(placeThing(s, "dog_bed", 11, 17, 0));
    expect(placeThing(t, "play_mat", 11, 17, 0)).toEqual({ ok: false, error: "Overlaps the Dog Bed." });
  });
  it("only one front desk counter per daycare", () => {
    const { s } = typed("lobby");
    const t = ok(placeThing(s, "front_counter", 10, 16, 0));
    expect(placeThing(t, "front_counter", 12, 17, 0)).toEqual({ ok: false, error: "Only one Front Desk Counter per daycare." });
  });
  it("respects unlock levels", () => {
    const { s } = typed("staff");
    expect(placeThing(s, "staff_couch", 10, 16, 0)).toEqual({ ok: false, error: "Unlocks at level 5." });
    expect(placeThing(atLevel(s, 5), "staff_couch", 10, 16, 0).ok).toBe(true);
  });
  it("can't be moved or sold while dogs are in its room", () => {
    const { s, uid } = typed("playroom");
    const t = withDog(ok(placeThing(s, "dog_bed", 11, 17, 0)), { kind: "room", room: uid });
    const bed = lastThing(t).uid;
    expect(sellThing(t, bed)).toEqual({ ok: false, error: "Move the dogs out first." });
    expect(moveThing(t, bed, 12, 17, 0)).toEqual({ ok: false, error: "Move the dogs out first." });
  });
  it("moves for free inside its room, rotating", () => {
    const { s } = typed("lobby");
    const t = ok(placeThing(s, "front_counter", 10, 16, 0));
    const m = ok(moveThing(t, lastThing(t).uid, 13, 16, 1));
    expect(m.coins).toBe(t.coins);
    expect(lastThing(m)).toMatchObject({ c: 13, r: 16, rot: 1 });
    expect(moveThing(t, lastThing(t).uid, 13, 16, 0)).toEqual({ ok: false, error: "Furniture goes inside a room." });
  });
  it("waiting dogs block selling the Lobby or its furniture", () => {
    const { s, uid } = typed("lobby");
    const t = withDog(ok(placeThing(s, "bench", 10, 16, 0)), { kind: "lobby" });
    expect(sellThing(t, lastThing(t).uid)).toEqual({ ok: false, error: "Move the dogs out first." });
    expect(sellRoom(t, uid)).toEqual({ ok: false, error: "Move the dogs out first." });
    expect(moveRoom(t, uid, 16, 16)).toEqual({ ok: false, error: "Move the dogs out first." });
  });
});

describe("outdoor items", () => {
  const s0 = newTycoon(0);
  it("a play yard costs 200 and sits on the grounds", () => {
    const t = ok(placeThing(s0, "play_yard", 12, 22, 0));
    expect(t.coins).toBe(s0.coins - 200);
    expect(lastThing(t)).toMatchObject({ kind: "play_yard", level: 1, spent: 200, room: null });
  });
  it("can't overlap rooms, paths or the entrance", () => {
    const { s } = typed("playroom");
    expect(placeThing(s, "play_yard", 12, 17, 0)).toEqual({ ok: false, error: "Overlaps the Playroom." });
    expect(placeThing(s0, "play_yard", 17, 26, 0)).toEqual({ ok: false, error: "Overlaps the entrance." });
    const p = ok(paintPaths(s0, [{ c: 12, r: 22 }]));
    expect(placeThing(p, "play_yard", 11, 21, 0)).toEqual({ ok: false, error: "Overlaps the Path." });
  });
  it("upgrades to level 2 for 360 and level 3 for 640, then stops", () => {
    // Start at player level 2 so the building XP doesn't cross a level (which would add a coin reward).
    const t = ok(placeThing(opened(atLevel(s0, 2)), "play_yard", 12, 22, 0));
    const uid = lastThing(t).uid;
    const two = ok(upgradeThing(t, uid));
    expect(two.coins).toBe(t.coins - 360);
    expect(lastThing(two)).toMatchObject({ level: 2, spent: 560 });
    const three = ok(upgradeThing(two, uid));
    expect(three.coins).toBe(two.coins - 640);
    expect(lastThing(three)).toMatchObject({ level: 3, spent: 1200 });
    expect(upgradeThing(three, uid)).toEqual({ ok: false, error: "Already at the top level." });
    const sold = ok(sellThing(three, uid));
    expect(sold.coins).toBe(three.coins + 900);
    expect(fac(sold).items.some((i) => i.uid === uid)).toBe(false);
  });
  it("scenery and furniture can't be upgraded", () => {
    const f = ok(placeThing(s0, "flowers", 12, 22, 0));
    expect(upgradeThing(f, lastThing(f).uid)).toEqual({ ok: false, error: "This can't be upgraded." });
    const { s } = typed("playroom");
    const b = ok(placeThing(s, "dog_bed", 11, 17, 0));
    expect(upgradeThing(b, lastThing(b).uid)).toEqual({ ok: false, error: "This can't be upgraded." });
  });
  it("the entrance stays", () => {
    expect(sellThing(s0, "entrance")).toEqual({ ok: false, error: "The entrance stays." });
    expect(moveThing(s0, "entrance", 12, 22, 0)).toEqual({ ok: false, error: "The entrance stays." });
    expect(setClosed(s0, "entrance", true)).toEqual({ ok: false, error: "The entrance stays open." });
  });
});

describe("paths", () => {
  it("paints every free square and charges 10 each", () => {
    const s = newTycoon(0);
    const tiles = [14, 15, 16, 17, 18].map((c) => ({ c, r: 27 }));
    const r = paintPaths(s, tiles);
    expect(r).toMatchObject({ ok: true, msg: expect.stringContaining("4") });
    const t = ok(r);
    expect(t.coins).toBe(s.coins - 40);
    expect(fac(t).items.filter((i) => i.kind === "path")).toHaveLength(5);
  });
  it("places only what you can afford, and says when nothing fits", () => {
    const s = { ...newTycoon(0), coins: 25 };
    const t = ok(paintPaths(s, [12, 13, 14].map((c) => ({ c, r: 20 }))));
    expect(t.coins).toBe(5);
    expect(fac(t).items.filter((i) => i.kind === "path")).toHaveLength(3);
    expect(paintPaths(s, [{ c: 18, r: 27 }])).toEqual({ ok: false, error: "There's no free square to pave there." });
    expect(paintPaths({ ...s, coins: 5 }, [{ c: 12, r: 20 }])).toEqual({ ok: false, error: "Need 5 more coins." });
  });
});

describe("land", () => {
  it("unlocks by level, costs coins, and opens up building", () => {
    const s = newTycoon(0);
    expect(buyLand(s, "west")).toEqual({ ok: false, error: "Unlocks at level 3." });
    expect(buyLand({ ...atLevel(s, 3), coins: 1499 }, "west")).toEqual({ ok: false, error: "Need 1 more coins." });
    const t = ok(buyLand(atLevel(s, 3), "west"));
    expect(t.coins).toBe(s.coins - 1500);
    expect(fac(t).land).toEqual(["starter", "west"]);
    expect(buyLand(t, "west")).toEqual({ ok: false, error: "You already own this land." });
    expect(drawRoom(t, 2, 20, 3, 3).ok).toBe(true);
    expect(placeThing(t, "play_yard", 2, 20, 0).ok).toBe(true);
  });
});

describe("open and closed", () => {
  it("works for rooms and things and costs nothing", () => {
    const { s, uid } = typed("playroom");
    const t = ok(setClosed(s, uid, true));
    expect(lastRoom(t).closed).toBe(true);
    expect(t.coins).toBe(s.coins);
    const y = ok(placeThing(t, "play_yard", 12, 22, 0));
    const c = ok(setClosed(y, lastThing(y).uid, true));
    expect(lastThing(c).closed).toBe(true);
    expect(lastThing(ok(setClosed(c, lastThing(c).uid, false))).closed).toBe(false);
    expect(setClosed(s, "nope", true)).toEqual({ ok: false, error: "That's gone." });
  });
});

describe("limits", () => {
  it("the 201st thing doesn't fit", () => {
    const s = newTycoon(0);
    const f = fac(s);
    const land = ["starter", "west", "east"] as const;
    const items: Placed[] = [...f.items];
    for (let c = 0; c < 36 && items.length < 200; c++)
      for (let r = 16; r < 28 && items.length < 200; r++)
        if (!(c === 18 && r === 27)) items.push({ uid: `p${c}-${r}`, kind: "path", c, r, rot: 0, level: 1, spent: 10, room: null, closed: false });
    const full = withFac(s, { ...f, land: [...land], items });
    expect(fac(full).items).toHaveLength(200);
    expect(placeThing(full, "flowers", 35, 27, 0)).toEqual({ ok: false, error: "This daycare is full (200 things)." });
  });
});
