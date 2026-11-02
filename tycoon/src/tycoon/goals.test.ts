// A few clear next goals, always visible (Stage A, spec §3.6). Worked out from the save; nothing new is stored.
import { describe, expect, it } from "vitest";
import { nextGoals } from "./goals";
import { newTycoon } from "./state";
import { ok, richState } from "./testkit";
import { quickStart } from "./start";

describe("next goals", () => {
  it("a fresh quick start: a Bath Room, the West lot, and a profitable day", () => {
    const g = nextGoals(ok(quickStart(newTycoon(0))));
    expect(g.map((x) => x.id)).toEqual(["build-bath", "land-west", "profit"]);
    const land = g.find((x) => x.id === "land-west")!;
    expect(land.detail).toMatch(/1,500/);
    expect(land.progress?.[1]).toBe(1500);
  });
  it("a daycare with a bath and boarding asks for something else, never more than three", () => {
    const g = nextGoals(richState());
    expect(g.length).toBeLessThanOrEqual(3);
    expect(g.some((x) => x.id === "build-bath" || x.id === "build-boarding")).toBe(false);
    expect(g.some((x) => x.id === "build-play-area")).toBe(true);
  });
  it("an empty lot starts with building the daycare", () => {
    expect(nextGoals(newTycoon(0))[0]?.id).toBe("open");
  });
});
