// The guided tour lives in the save (one optional field). Older saves load without it.
import { describe, expect, it } from "vitest";
import { newTycoon, parseTycoon } from "./state";
import type { Tour } from "./types";

const tour: Tour = { mode: "quick", beat: "play", startedAt: 1_793_600_000_000, upgrade: null, done: false, skipped: false };

describe("the tour in the save", () => {
  it("a save from before the tour loads with no tour", () => {
    const old = JSON.parse(JSON.stringify(newTycoon(0))) as Record<string, unknown>;
    delete old["tour"];
    expect(parseTycoon(old)?.tour).toBeNull();
  });
  it("a new game starts with no tour (the start card decides)", () => {
    expect(newTycoon(0).tour).toBeNull();
  });
  it("a tour survives a reload", () => {
    const s = { ...newTycoon(0), tour: { ...tour, upgrade: "toy_bin" as const } };
    expect(parseTycoon(JSON.parse(JSON.stringify(s)))?.tour).toEqual({ ...tour, upgrade: "toy_bin" });
  });
  it("a broken tour is dropped rather than trusted", () => {
    for (const bad of [{ ...tour, beat: "dance" }, { ...tour, mode: "speedrun" }, { ...tour, upgrade: "rocket" }, "yes", 7]) {
      expect(parseTycoon({ ...JSON.parse(JSON.stringify(newTycoon(0))), tour: bad })?.tour).toBeNull();
    }
  });
});
