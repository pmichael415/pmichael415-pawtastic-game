import { describe, expect, it } from "vitest";
import { buyLand } from "./build";
import { TROPHIES, checkTrophies } from "./trophies";
import { fac, newTycoon, withFac } from "./state";
import { guidedBuild, ok, richState } from "./testkit";
import type { Facility, TDog, TycoonState } from "./types";

const setF = (s: TycoonState, over: Partial<Facility>) => withFac(s, { ...fac(s), ...over });
const dog = (id: string, place: TDog["place"], boarding = false): TDog =>
  ({ id, name: id, breed: 5, size: "small", temper: "gentle", visits: 1, place, checkedIn: true, happiness: 50, clean: 70, boarding, played: 0, bathed: false }) as TDog;
const ids = (r: ReturnType<typeof checkTrophies>) => r.unlocked.map((t) => t.id);

describe("trophies", () => {
  it("the list and rewards", () => {
    expect(TROPHIES.map((t) => [t.id, t.reward])).toEqual([
      ["first_dog", 50], ["dogs_10", 100], ["dogs_50", 200], ["dogs_250", 400], ["profit_1000", 300],
      ["first_boarder", 100], ["fully_booked", 150], ["all_room_types", 250], ["all_land", 500],
    ]);
  });
  it("first_dog unlocks on the first checkout and pays 50, once", () => {
    const s = newTycoon(0);
    expect(ids(checkTrophies(s))).toEqual([]);
    const one = setF(s, { stats: { ...fac(s).stats, checkouts: 1 } });
    const a = checkTrophies(one);
    expect(ids(a)).toEqual(["first_dog"]);
    expect(a.state.coins).toBe(s.coins + 50);
    expect(a.state.trophies).toEqual(["first_dog"]);
    const b = checkTrophies(a.state);
    expect(b.unlocked).toEqual([]);
    expect(b.state.coins).toBe(a.state.coins);
  });
  it("dogs served, profit and boarders", () => {
    const s = setF({ ...newTycoon(0), bestProfit: 1200 }, { stats: { ...fac(newTycoon(0)).stats, checkouts: 50, boarders: 1 } });
    expect(ids(checkTrophies(s))).toEqual(["first_dog", "dogs_10", "dogs_50", "profit_1000", "first_boarder"]);
  });
  it("fully booked: every playroom spot and every bed taken at once", () => {
    const s = richState();
    const f = fac(s);
    const play = f.rooms.find((r) => r.type === "playroom")!.uid;
    const beds = f.items.filter((i) => i.kind === "boarding_bed");
    const nearly = setF(s, { dogs: [dog("a", { kind: "room", room: play }), dog("b", { kind: "room", room: play }), dog("c", { kind: "bed", room: beds[0]!.room!, bed: beds[0]!.uid }, true)] });
    expect(ids(checkTrophies(nearly))).not.toContain("fully_booked");
    const full = setF(nearly, { dogs: [...fac(nearly).dogs, dog("d", { kind: "bed", room: beds[1]!.room!, bed: beds[1]!.uid }, true)] });
    expect(ids(checkTrophies(full))).toContain("fully_booked");
    expect(ids(checkTrophies(setF(guidedBuild(newTycoon(0)), { dogs: [] })))).not.toContain("fully_booked");
  });
  it("every room type, and every parcel of land", () => {
    expect(ids(checkTrophies(richState()))).toContain("all_room_types");
    expect(ids(checkTrophies(guidedBuild(newTycoon(0))))).not.toContain("all_room_types");
    let s: TycoonState = { ...newTycoon(0), xp: 50 * 12 * 11, coins: 30000 };
    for (const p of ["west", "east", "north", "northwest", "northeast"] as const) s = ok(buyLand(s, p));
    expect(ids(checkTrophies(s))).toContain("all_land");
  });
});
