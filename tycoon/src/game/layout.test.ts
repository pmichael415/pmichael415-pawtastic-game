import { describe, expect, it } from "vitest";
import { admitDog, assignRoom, assignSuite, checkout, lobbyDogs, LOBBY_CAP, newGame, parseSave, playtime, roomBlockReason, roomCapacity, suiteCount, type GameState } from "./engine";

const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]!; };
// rand order in admitDog: breed, name, temper, happiness, clean, x, y
const small_gentle = seq([0.2, 0, 0.1, 0.5, 0.5, 0.5, 0.5]); // breed 1 Beagle (small), gentle
const large_active = seq([0, 0.0, 0.9, 0.5, 0.5, 0.5, 0.5]); // breed 0 Golden (large), active
const fresh = () => ({ ...newGame(0, "2026-10-31"), coins: 10000 });
function must(r: ReturnType<typeof admitDog>): GameState { if (!r.ok) throw new Error(r.error); return r.state; }

describe("lobby → playroom layout", () => {
  it("new arrivals wait in the lobby, not a playroom", () => {
    const s = must(admitDog(fresh(), small_gentle));
    expect(s.dogs[0]!.place).toEqual({ kind: "lobby" });
    expect(playtime(s, s.dogs[0]!.id).ok).toBe(false);
  });

  it("lobby holds 4 waiting pups", () => {
    let s = fresh();
    for (let i = 0; i < LOBBY_CAP; i++) s = must(admitDog(s, small_gentle));
    expect(admitDog(s, small_gentle).ok).toBe(false);
  });

  it("small gentle pup fits only the Small & Gentle room", () => {
    const s = must(admitDog(fresh(), small_gentle));
    const d = s.dogs[0]!;
    expect(d.size).toBe("small");
    expect(d.temper).toBe("gentle");
    expect(roomBlockReason(s, d, "small-gentle")).toBeNull();
    expect(roomBlockReason(s, d, "large-gentle")).toMatch(/small/);
    expect(roomBlockReason(s, d, "small-active")).toMatch(/gentl/);
    const moved = assignRoom(s, d.id, "small-gentle");
    expect(moved.ok && lobbyDogs(moved.state, "hawthorne").length).toBe(0);
    expect(moved.ok && playtime(moved.state, d.id).ok).toBe(true);
  });

  it("playrooms start at 2 spots and the yard upgrades add 1 then 2", () => {
    const s = fresh();
    expect(roomCapacity(s)).toBe(2);
    expect(roomCapacity({ ...s, upgrades: ["yard1"] })).toBe(3);
    expect(roomCapacity({ ...s, upgrades: ["yard1", "yard2"] })).toBe(5);
  });

  it("a full playroom blocks a third compatible pup", () => {
    let s = fresh();
    for (let i = 0; i < 3; i++) s = must(admitDog(s, large_active));
    s = must(assignRoom(s, s.dogs[0]!.id, "large-active"));
    s = must(assignRoom(s, s.dogs[1]!.id, "large-active"));
    const r = assignRoom(s, s.dogs[2]!.id, "large-active");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/full/);
  });
});

describe("individual boarding suites", () => {
  const withBoarding = () => ({ ...fresh(), upgrades: ["boarding"] });

  it("boarding upgrade builds 3 private suites", () => {
    expect(suiteCount(fresh())).toBe(0);
    expect(suiteCount(withBoarding())).toBe(3);
  });

  it("one boarder per suite; daycare pups can't use suites", () => {
    let s = must(admitDog(withBoarding(), small_gentle, true));
    s = must(admitDog(s, small_gentle, true));
    s = must(admitDog(s, small_gentle, false));
    const [a, b, c] = s.dogs;
    s = must(assignSuite(s, a!.id, 0));
    expect(assignSuite(s, b!.id, 0).ok).toBe(false);
    expect(assignSuite(s, c!.id, 1).ok).toBe(false);
    expect(assignRoom(s, b!.id, "small-gentle").ok).toBe(false);
    expect(assignSuite(s, b!.id, 1).ok).toBe(true);
  });

  it("boarders check out from their suite with the overnight fee, freeing it", () => {
    let s = must(admitDog(withBoarding(), small_gentle, true));
    const id = s.dogs[0]!.id;
    expect(checkout(s, id, false).ok).toBe(false); // still in lobby
    s = must(assignSuite(s, id, 2));
    const before = s.coins;
    const out = checkout(s, id, false);
    expect(out.ok && out.state.coins - before).toBeGreaterThanOrEqual(70); // 10 + happiness*0.4 + 60
    if (!out.ok) throw 0;
    const next = must(admitDog(out.state, small_gentle, true));
    expect(assignSuite(next, next.dogs[0]!.id, 2).ok).toBe(true);
  });
});

describe("save migration", () => {
  it("v1 saves keep coins and move dogs to the Hawthorne lobby with traits", () => {
    const v1 = { ...newGame(0, "x"), v: 1, coins: 777, dogs: [{ id: "d1", name: "Old", breed: 2, happiness: 50, clean: 50, boarding: false, played: 0, bathed: false, x: 0.5, y: 0.5 }] };
    const s = parseSave(v1)!;
    expect(s.coins).toBe(777);
    expect(s.dogs[0]!.place).toEqual({ kind: "lobby" });
    expect(s.dogs[0]!.size).toBe("large");
    expect(s.dogs[0]!.site).toBe("hawthorne");
  });
});
