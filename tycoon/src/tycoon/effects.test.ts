import { describe, expect, it } from "vitest";
import { addDoor, drawRoom, setRoomType, placeThing } from "./build";
import { arrivalMultiplier, decayMultiplier, funAppeal, playBonus, tip } from "./effects";
import { fac, newTycoon, withFac } from "./state";
import { guidedBuild, ok } from "./testkit";
import type { OutdoorId, Placed, TycoonState } from "./types";

const outdoor = (kind: OutdoorId, level: 1 | 2 | 3, i: number, closed = false): Placed => ({ uid: `o${i}`, kind, c: i, r: 0, rot: 0, level, spent: 0, room: null, closed });
const withItems = (s: TycoonState, items: Placed[]) => withFac(s, { ...fac(s), items: [...fac(s).items, ...items] });

describe("fun and appeal", () => {
  it("sum open outdoor items by level, capped at 60 and 50", () => {
    const s = withItems(newTycoon(0), [0, 1, 2, 3, 4, 5, 6].map((i) => outdoor("play_yard", 3, i)));
    expect(funAppeal(fac(s)).fun).toBe(60);
    const a = withItems(newTycoon(0), [outdoor("agility", 2, 0), outdoor("water", 1, 1), outdoor("flowers", 1, 2)]);
    expect(funAppeal(fac(a))).toEqual({ fun: 13 + 1, appeal: 3 + 1 + 1 });
    const many = withItems(newTycoon(0), Array.from({ length: 9 }, (_, i) => outdoor("fountain", 1, i)));
    expect(funAppeal(fac(many)).appeal).toBe(50);
  });
  it("a closed fountain adds nothing", () => {
    expect(funAppeal(fac(withItems(newTycoon(0), [outdoor("fountain", 1, 0, true)])))).toEqual({ fun: 0, appeal: 0 });
  });
  it("furniture counts only in working rooms", () => {
    const g = guidedBuild(newTycoon(0));
    expect(funAppeal(fac(g))).toEqual({ fun: 1, appeal: 0 }); // the playroom's water bowl
    let s = ok(drawRoom({ ...newTycoon(0), xp: 100 }, 10, 16, 4, 3));
    const uid = fac(s).rooms[0]!.uid;
    s = ok(setRoomType(s, uid, "playroom", "small-gentle"));
    s = ok(placeThing(s, "dog_bed", 10, 16, 0));
    s = ok(placeThing(s, "toy_bin", 11, 16, 0));
    expect(funAppeal(fac(s)).fun).toBe(0); // not connected
    s = ok(addDoor(s, uid, { side: "S", i: 1 }));
    expect(funAppeal(fac(s)).fun).toBe(0); // still no path to the entrance
  });
  it("effects", () => {
    expect(decayMultiplier(60)).toBeCloseTo(0.7);
    expect(decayMultiplier(60, 0.6)).toBe(0.5);
    expect(decayMultiplier(0)).toBe(1);
    expect(playBonus(60)).toBe(10);
    expect(playBonus(11)).toBe(1);
    expect(arrivalMultiplier(50)).toBe(1.5);
    expect(tip(50)).toBe(12);
    expect(tip(40)).toBe(10);
  });
});
