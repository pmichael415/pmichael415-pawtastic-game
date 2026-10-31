import { describe, expect, it } from "vitest";
import {
  admitDog, assignRoom, assignSuite, bath, BREAK_START, buyUpgrade, checkIn, checkout, createArrival, DAY_OPEN, inActiveScuffle, LOBBY_CAP, lobbyDogs,
  newGame, nyDateKey, parseSave, playtime, recoveryDogs, roomDogs, separateDog, tick, type GameState,
} from "./engine";

const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]!; };
const smallGentle = seq([0.2, 0, 0.1, 0.5, 0.5, 0.5, 0.5]);
const largeActive = seq([0, 0, 0.9, 0.5, 0.5, 0.5, 0.5]);
const must = (r: { ok: boolean; state?: GameState; error?: string }) => { if (!r.ok) throw new Error(r.error); return r.state!; };
const rich = (): GameState => ({ ...newGame(0, "d"), coins: 5000, clockMin: 9 * 60 });

describe("arrival → staff check-in → assignment", () => {
  it("random arrivals wait unchecked and earn nothing until check-in", () => {
    const s = tick(rich(), 10, () => 0); // always arrive
    const waiting = lobbyDogs(s, "hawthorne");
    expect(waiting.length).toBeGreaterThan(0);
    expect(waiting.every((d) => !d.checkedIn)).toBe(true);
    expect(s.coins).toBe(5000);
    expect(s.stats.admitted).toBe(0);
  });

  it("check-in credits admission exactly once; repeating is refused", () => {
    const s0 = must(createArrival(rich(), smallGentle));
    const id = s0.dogs[0]!.id;
    const s1 = must(checkIn(s0, id));
    expect(s1.coins).toBe(5020);
    expect(s1.stats.admitted).toBe(1);
    const again = checkIn(s1, id);
    expect(again.ok).toBe(false);
    expect(s1.coins).toBe(5020);
  });

  it("unchecked pups cannot be roomed, bathed or checked out", () => {
    const s0 = must(createArrival(rich(), smallGentle));
    const id = s0.dogs[0]!.id;
    expect(assignRoom(s0, id, "small-gentle").ok).toBe(false);
    expect(bath(s0, id).ok).toBe(false);
    expect(checkout(s0, id, false).ok).toBe(false);
    const s1 = must(checkIn(s0, id));
    expect(assignRoom(s1, id, "small-gentle").ok).toBe(true);
  });

  it("check-in desk is closed 12:00–14:00", () => {
    const s0 = must(createArrival(rich(), smallGentle));
    expect(checkIn({ ...s0, clockMin: BREAK_START }, s0.dogs[0]!.id).ok).toBe(false);
    expect(checkIn({ ...s0, clockMin: 14 * 60 }, s0.dogs[0]!.id).ok).toBe(true);
  });

  it("suites require check-in too", () => {
    let s = must(buyUpgrade(rich(), "boarding"));
    s = must(createArrival(s, smallGentle, true));
    expect(assignSuite(s, s.dogs[0]!.id, 0).ok).toBe(false);
  });
});

describe("safe separation", () => {
  it("full lobby + closed + zero staff energy: emergency recovery still works", () => {
    let s = rich();
    s = must(admitDog(s, smallGentle));
    const sg = s.dogs[0]!.id;
    s = must(assignRoom(s, sg, "small-gentle"));
    s = must(admitDog(s, largeActive));
    const la = s.dogs[1]!.id;
    s = must(assignRoom(s, la, "small-gentle", true));
    for (let i = 0; i < LOBBY_CAP; i++) s = must(admitDog(s, smallGentle));
    s = { ...s, clockMin: BREAK_START + 30, staff: s.staff.map((x) => ({ ...x, energy: 0 })), scuffles: [{ site: "hawthorne", group: "small-gentle" }] };
    const coins = s.coins;
    const r = must(separateDog(s, la));
    expect(recoveryDogs(r, "hawthorne").map((d) => d.id)).toEqual([la]);
    expect(lobbyDogs(r, "hawthorne").length).toBe(LOBBY_CAP);
    expect(r.scuffles).toEqual([]);
    expect(r.coins).toBe(coins);
  });

  it("a single pup can be separated preventively (no risk yet), without coins or penalty", () => {
    let s = must(admitDog(rich(), largeActive));
    const id = s.dogs[0]!.id;
    s = must(assignRoom(s, id, "small-gentle", true));
    const r = must(separateDog(s, id));
    expect(r.dogs[0]!.place.kind).toBe("recovery");
    expect(r.dogs[0]!.happiness).toBe(s.dogs[0]!.happiness);
    expect(r.coins).toBe(s.coins);
  });

  it("play, bath and checkout are blocked for active scuffle participants", () => {
    let s = must(admitDog(rich(), smallGentle));
    const a = s.dogs[0]!.id;
    s = must(assignRoom(s, a, "small-gentle"));
    s = must(admitDog(s, largeActive));
    const b = s.dogs[1]!.id;
    s = must(assignRoom(s, b, "small-gentle", true));
    s = { ...s, scuffles: [{ site: "hawthorne", group: "small-gentle" }] };
    expect(inActiveScuffle(s, s.dogs[0]!)).toBe(true);
    for (const id of [a, b]) {
      expect(playtime(s, id).ok).toBe(false);
      expect(bath(s, id).ok).toBe(false);
      expect(checkout(s, id, false).ok).toBe(false);
    }
    const r = must(separateDog(s, b));
    expect(playtime(r, a).ok).toBe(true);
  });
});

describe("fractional tick timing", () => {
  it("0.25s steps accumulate exactly like one 1s step", () => {
    let a = rich();
    for (let i = 0; i < 4; i++) a = tick(a, 0.25, () => 0.99);
    const b = tick(rich(), 1, () => 0.99);
    expect(a.clockMin).toBeCloseTo(b.clockMin, 6);
    expect(b.clockMin).toBe(9 * 60 + 2);
  });

  it("no arrival on reaching exactly 12:00, arrivals possible on reaching 14:00", () => {
    const s1 = tick({ ...rich(), clockMin: BREAK_START - 0.5 }, 0.25, () => 0);
    expect(s1.clockMin).toBe(BREAK_START);
    expect(s1.dogs.length).toBe(0);
    const s2 = tick({ ...rich(), clockMin: 14 * 60 - 0.5 }, 0.25, () => 0);
    expect(s2.clockMin).toBe(14 * 60);
    expect(s2.dogs.length).toBe(1);
  });
});

describe("malformed / legacy saves", () => {
  it("partial saves load with defaults instead of crashing", () => {
    const s = parseSave({ v: 3, coins: 77, dogs: [{ name: "Rex", breed: 99, place: { kind: "moon" } }] })!;
    expect(s.coins).toBe(77);
    expect(s.stats.admitted).toBe(0);
    expect(s.upgrades).toEqual([]);
    expect(s.scuffles).toEqual([]);
    expect(s.dogs[0]!.breed).toBe(0);
    expect(s.dogs[0]!.place.kind).toBe("lobby");
    expect(s.dogs[0]!.checkedIn).toBe(true);
  });

  it("garbage is rejected", () => {
    expect(parseSave(null)).toBeNull();
    expect(parseSave({ v: 99, coins: 1 })).toBeNull();
    expect(parseSave({ v: 3, coins: "lots" })).toBeNull();
    expect(parseSave({ v: 3, coins: -5 })).toBeNull();
  });

  it("duplicate suite occupancy and overfull rooms move extras to recovery without losing dogs or coins", () => {
    const base = { ...newGame(0, "d"), upgrades: ["boarding"], coins: 900 };
    const dog = (id: string, place: object, boarding = false) => ({ id, name: id, breed: 1, size: "small", temper: "gentle", site: "hawthorne", place, happiness: 50, clean: 50, boarding, played: 0, bathed: false, x: 0.5, y: 0.5, checkedIn: true });
    const s = parseSave({
      ...base,
      dogs: [
        dog("a", { kind: "suite", index: 0 }, true), dog("b", { kind: "suite", index: 0 }, true),
        dog("c", { kind: "room", group: "small-gentle" }), dog("d", { kind: "room", group: "small-gentle" }), dog("e", { kind: "room", group: "small-gentle" }),
      ],
    })!;
    expect(s.dogs.length).toBe(5);
    expect(s.coins).toBe(900);
    expect(s.dogs.filter((d) => d.place.kind === "suite").length).toBe(1);
    expect(roomDogs(s, "hawthorne", "small-gentle").length).toBe(2);
    expect(recoveryDogs(s, "hawthorne").map((d) => d.id).sort()).toEqual(["b", "e"]);
  });

  it("v1 saves migrate with every dog checked in at the Hawthorne lobby", () => {
    const s = parseSave({ v: 1, coins: 40, dogs: [{ id: "x", name: "Old", breed: 2, happiness: 50, clean: 50 }], staff: [] })!;
    expect(s.v).toBe(4);
    expect(s.dogs[0]).toMatchObject({ site: "hawthorne", place: { kind: "lobby" }, size: "large", checkedIn: true });
    expect(s.staff.length).toBe(1);
    expect(s.clockMin).toBe(DAY_OPEN);
  });

  it("paid ownership fields in a save are stripped", () => {
    const s = parseSave({ ...newGame(0, "d"), entitlements: ["blue-ribbon"], paid: true, cosmetics: ["paid:blue-ribbon", "bandana-red"], equipped: "paid:blue-ribbon" }) as unknown as Record<string, unknown>;
    expect(s["entitlements"]).toBeUndefined();
    expect(s["paid"]).toBeUndefined();
    expect(s["cosmetics"]).toEqual(["bandana-red"]);
    expect(s["equipped"]).toBeNull();
  });
});

describe("daily key uses America/New_York", () => {
  it("rolls at New York midnight, not UTC", () => {
    expect(nyDateKey(Date.UTC(2026, 9, 31, 3, 59))).toBe("2026-10-30"); // 23:59 EDT
    expect(nyDateKey(Date.UTC(2026, 9, 31, 4, 0))).toBe("2026-10-31"); // 00:00 EDT
    expect(nyDateKey(Date.UTC(2026, 11, 1, 4, 59))).toBe("2026-11-30"); // 23:59 EST
    expect(nyDateKey(Date.UTC(2026, 11, 1, 5, 0))).toBe("2026-12-01");
  });
});
