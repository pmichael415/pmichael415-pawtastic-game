// The full cost of a room before it's built (Stage A, spec §3.5): walls and floor, one door, and the path squares
// needed to reach the entrance.
import { describe, expect, it } from "vitest";
import { DOOR_PRICE } from "./catalog";
import { connectionEstimate, costLine } from "./build";
import { roomPrice } from "./grid";
import { fac, newTycoon } from "./state";
import { guidedBuild } from "./testkit";

const f = fac(guidedBuild({ ...newTycoon(0), coins: 20000 }));

describe("the full cost of a new room", () => {
  it("next to the Lobby: a door into it, no path", () => {
    expect(connectionEstimate(f, { c: 16, r: 19, w: 4, d: 3 })).toEqual({ room: roomPrice(4, 3), door: DOOR_PRICE, paths: 0, total: roomPrice(4, 3) + DOOR_PRICE });
  });
  it("three squares from the path: three path squares are added", () => {
    const e = connectionEstimate(f, { c: 12, r: 25, w: 3, d: 3 })!;
    expect(e.paths).toBe(3 * 10);
    expect(e.total).toBe(roomPrice(3, 3) + DOOR_PRICE + 30);
  });
  it("on land not owned yet: no route", () => {
    expect(connectionEstimate(f, { c: 0, r: 0, w: 3, d: 3 })).toBeNull();
  });
  it("reads as one line in the build preview", () => {
    expect(costLine({ room: 270, door: 30, paths: 30, total: 330 })).toBe("Room 270 + door 30 + path 3 × 10 = 330");
    expect(costLine({ room: 400, door: 30, paths: 0, total: 430 })).toBe("Room 400 + door 30 = 430");
    expect(costLine(null, 400)).toBe("Room 400 · add paths to reach the entrance");
  });
});
