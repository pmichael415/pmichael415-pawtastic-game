import { describe, expect, it } from "vitest";
import { drawRoom, sellRoom } from "./build";
import { XP, buildXp, gainXp, level, levelOf, unlocksAt, xpForLevel } from "./progress";
import { fac, newTycoon } from "./state";
import { ok } from "./testkit";

describe("levels", () => {
  it("level N starts at 50 × N × (N − 1)", () => {
    expect([0, 99, 100, 1000, 4500, 10500].map(levelOf)).toEqual([1, 1, 2, 5, 10, 15]);
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(10)).toBe(4500);
    expect(levelOf(10499)).toBe(14);
    expect(level({ ...newTycoon(0), xp: 300 })).toBe(3);
  });
  it("gaining XP pays 25 × N for every level crossed and remembers the highest", () => {
    const seen: number[] = [];
    const s = { ...newTycoon(0), xp: 90 };
    const t = gainXp(s, 920, (n) => seen.push(n));
    expect(t.xp).toBe(1010);
    expect(t.coins).toBe(s.coins + 50 + 75 + 100 + 125);
    expect(t.pendingLevel).toBe(5);
    expect(seen).toEqual([2, 3, 4, 5]);
    const u = gainXp(t, 5, () => seen.push(99));
    expect(u.coins).toBe(t.coins);
    expect(u.pendingLevel).toBe(5);
    expect(seen).not.toContain(99);
  });
  it("XP amounts", () => {
    expect(XP).toEqual({ checkIn: 5, playtime: 2, bath: 3, clean: 1, checkout: 10, happyCheckout: 5 });
    expect(buildXp(400)).toBe(40);
    expect(buildXp(15)).toBe(1);
  });
  it("building earns XP; selling never removes it", () => {
    const s = ok(drawRoom(newTycoon(0), 10, 16, 4, 3));
    expect(s.xp).toBe(40);
    const t = ok(sellRoom(s, fac(s).rooms[0]!.uid));
    expect(t.xp).toBe(40);
  });
  it("lists what each level unlocks", () => {
    expect(unlocksAt(5)).toEqual(expect.arrayContaining(["Agility Course", "Deluxe Dog Bed", "Staff Couch", "Online ads"]));
    expect(unlocksAt(4)).toEqual(expect.arrayContaining(["Mini Hurdles", "Nap Cabana"])); // spec §4.2: hurdles unlock at 4
    expect(unlocksAt(3)).toEqual(expect.arrayContaining(["West lot", "East lot", "Splash Pool", "Boarding Bed"]));
    expect(unlocksAt(1)).toEqual([]);
  });
});
