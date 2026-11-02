// Walking routes go through doors, never walls (staff design §8).
import { describe, expect, it } from "vitest";
import { drawRoom } from "./build";
import { findPath } from "./paths";
import { fac } from "./state";
import { deskTile } from "./team";
import { richState } from "./testkit";
import type { Facility } from "./types";

const roomAt = (f: Facility, t: { c: number; r: number }) => f.rooms.find((r) => t.c >= r.c && t.c < r.c + r.w && t.r >= r.r && t.r < r.r + r.d)?.uid ?? null;

describe("walking routes", () => {
  it("from the front desk to the bath tub, every step stays in a room or goes through a door", () => {
    const f = fac(richState());
    const tub = f.items.find((i) => i.kind === "deluxe_tub")!;
    const path = findPath(f, deskTile(f), { c: tub.c, r: tub.r })!;
    expect(path).not.toBeNull();
    expect(path[0]).toEqual(deskTile(f));
    expect(path.at(-1)).toEqual({ c: tub.c, r: tub.r });
    const doorSteps = path.slice(1).filter((t, i) => roomAt(f, t) !== roomAt(f, path[i]!)).length;
    const doors = f.rooms.flatMap((r) => r.doors).length;
    expect(doorSteps).toBeGreaterThan(0);
    expect(doorSteps).toBeLessThanOrEqual(doors * 2);
    for (let i = 1; i < path.length; i++) expect(Math.abs(path[i]!.c - path[i - 1]!.c) + Math.abs(path[i]!.r - path[i - 1]!.r)).toBe(1);
  });
  it("a room with no door can't be reached (the renderer walks straight there instead)", () => {
    const s0 = richState();
    let spot: { c: number; r: number } | null = null;
    let s = s0;
    for (let r = 10; r < 30 && !spot; r++)
      for (let c = 4; c < 32 && !spot; c++) {
        const t = drawRoom(s0, c, r, 2, 2);
        if (t.ok) (s = t.state), (spot = { c, r });
      }
    expect(spot).not.toBeNull();
    const f = fac(s);
    expect(findPath(f, deskTile(f), spot!)).toBeNull();
  });
  it("standing still is a one-tile route", () => {
    const f = fac(richState());
    expect(findPath(f, deskTile(f), deskTile(f))).toEqual([deskTile(f)]);
  });
});
