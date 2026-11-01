import { describe, expect, it } from "vitest";
import { fac, newTycoon, parseTycoon } from "./state";

const room = (uid: string, c: number, r: number, w: number, d: number, extra: Record<string, unknown> = {}) => ({
  uid, c, r, w, d, type: null, group: null, doors: [], floor: "wood", wall: "#F4EDE4", spent: 0, closed: false, ...extra,
});
const thing = (uid: string, kind: string, c: number, r: number, extra: Record<string, unknown> = {}) => ({
  uid, kind, c, r, rot: 0, level: 1, spent: 0, room: null, closed: false, ...extra,
});

describe("a new game", () => {
  it("starts on an empty lot with an entrance, 3,000 coins and one staff member, closed", () => {
    const s = newTycoon(0);
    const f = fac(s);
    expect(s.coins).toBe(3000);
    expect(s.xp).toBe(0);
    expect(f.rooms).toEqual([]);
    expect(f.items).toEqual([expect.objectContaining({ uid: "entrance", kind: "path", c: 18, r: 27 })]);
    expect(f.staff).toHaveLength(1);
    expect(f.open).toBe(false);
    expect(f.land).toEqual(["starter"]);
    expect(f.prices).toEqual({ daycare: 40, boarding: 90, bath: 25, exitBath: 30 });
  });
});

describe("loading saves", () => {
  it("rejects things that aren't saves", () => {
    expect(parseTycoon("x")).toBeNull();
    expect(parseTycoon({ v: 2 })).toBeNull();
    expect(parseTycoon(null)).toBeNull();
  });

  it("round-trips a new game", () => {
    const s = newTycoon(5);
    expect(parseTycoon(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it("repairs a hand-edited save by dropping only the broken parts", () => {
    const raw = JSON.parse(JSON.stringify(newTycoon(0)));
    const f = raw.facilities.f1;
    f.items = []; // entrance missing
    f.rooms = [
      room("A", 10, 16, 4, 3, { type: "lobby", doors: [{ side: "S", i: 1 }, { side: "S", i: 0 }] }), // corner door
      room("B", 12, 17, 3, 3), // overlaps A
      room("C", 16, 22, 3, 3, { type: "playroom", group: "small-gentle" }),
    ];
    f.items = [
      thing("t1", "bath_tub", 16, 22, { room: "C" }), // tub in a playroom
      thing("k1", "front_counter", 10, 16, { room: "A" }),
      thing("k2", "front_counter", 12, 17, { room: "A" }), // second counter
      thing("y1", "play_yard", 2, 20), // west lot isn't owned
    ];
    const s = parseTycoon(raw)!;
    expect(s).not.toBeNull();
    const out = fac(s);
    expect(out.rooms.map((r) => r.uid)).toEqual(["A", "C"]);
    expect(out.rooms[0]!.doors).toEqual([{ side: "S", i: 1 }]);
    expect(out.items.map((i) => i.uid).sort()).toEqual(["entrance", "k1"]);
  });

  it("puts the entrance back if it's missing", () => {
    const raw = JSON.parse(JSON.stringify(newTycoon(0)));
    raw.facilities.f1.items = [];
    expect(fac(parseTycoon(raw)!).items.some((i) => i.uid === "entrance" && i.c === 18 && i.r === 27)).toBe(true);
  });

  it("keeps prices inside their ranges", () => {
    const raw = JSON.parse(JSON.stringify(newTycoon(0)));
    raw.facilities.f1.prices = { daycare: 999, boarding: 1, bath: "x", exitBath: 30 };
    expect(fac(parseTycoon(raw)!).prices).toEqual({ daycare: 80, boarding: 50, bath: 25, exitBath: 30 });
  });
});
