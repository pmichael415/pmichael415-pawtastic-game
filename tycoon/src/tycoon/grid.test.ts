import { describe, expect, it } from "vitest";
import type { Room } from "./types";
import { upgradePrice } from "./catalog";
import { doorOutside, isCornerDoor, isOwned, parcelAt, roomOutline, roomPrice, rotatedSize, thingTiles, tileAtWorld, tileCenter } from "./grid";

const room = { c: 10, r: 16, w: 4, d: 3 } as Room;

describe("the lot grid", () => {
  it("maps tiles to world positions and back", () => {
    expect(tileCenter(0, 0)).toEqual({ x: -35, z: -35 });
    expect(tileCenter(18, 27)).toEqual({ x: 1, z: 19 });
    expect(tileAtWorld(1.2, 19.9)).toEqual({ c: 18, r: 27 });
    expect(tileAtWorld(100, 0)).toBeNull();
    expect(tileAtWorld(-36.5, 0)).toBeNull();
  });
  it("knows which parcel a tile is in and whether it's owned", () => {
    expect(parcelAt(18, 27)).toBe("starter");
    expect(parcelAt(5, 20)).toBe("west");
    expect(parcelAt(30, 3)).toBe("northeast");
    expect(isOwned(["starter"], 5, 20)).toBe(false);
    expect(isOwned(["starter", "west"], 5, 20)).toBe(true);
  });
});

describe("footprints and rotation", () => {
  it("rotating a quarter turn swaps width and depth", () => {
    expect(rotatedSize(2, 1, 1)).toEqual({ w: 1, d: 2 });
    expect(rotatedSize(2, 1, 2)).toEqual({ w: 2, d: 1 });
  });
  it("covers every tile of the rotated footprint from its top-left tile", () => {
    expect(thingTiles({ kind: "agility", c: 12, r: 18, rot: 0 })).toHaveLength(6);
    const turned = thingTiles({ kind: "agility", c: 12, r: 18, rot: 1 });
    expect(new Set(turned.map((t) => t.c))).toEqual(new Set([12, 13]));
    expect(new Set(turned.map((t) => t.r))).toEqual(new Set([18, 19, 20]));
  });
});

describe("rooms", () => {
  it("costs 20 per wall segment and 10 per floor tile", () => {
    expect(roomPrice(4, 3)).toBe(400);
    expect(roomPrice(2, 2)).toBe(200);
  });
  it("has one wall segment per outline edge", () => {
    expect(roomOutline(room)).toHaveLength(14);
  });
  it("doors can't sit on corners and open onto the tile outside", () => {
    expect(isCornerDoor(room, { side: "S", i: 0 })).toBe(true);
    expect(isCornerDoor(room, { side: "S", i: 3 })).toBe(true);
    expect(isCornerDoor(room, { side: "S", i: 1 })).toBe(false);
    expect(isCornerDoor(room, { side: "E", i: 1 })).toBe(false);
    expect(doorOutside(room, { side: "S", i: 1 })).toEqual({ c: 11, r: 19 });
    expect(doorOutside(room, { side: "N", i: 2 })).toEqual({ c: 12, r: 15 });
    expect(doorOutside(room, { side: "W", i: 1 })).toEqual({ c: 9, r: 17 });
    expect(doorOutside(room, { side: "E", i: 1 })).toEqual({ c: 14, r: 17 });
  });
});

describe("upgrade prices", () => {
  it("are per step and rounded to 10", () => {
    expect(upgradePrice(200, 2)).toBe(360);
    expect(upgradePrice(200, 3)).toBe(640);
    expect(upgradePrice(450, 2)).toBe(810);
    expect(upgradePrice(80, 3)).toBe(260);
  });
});
