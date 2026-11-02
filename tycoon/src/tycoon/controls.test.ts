// Instructions match the controls the player actually has (Stage A, spec §3.3): a browser without 3D never hears
// "drag out a room".
import { describe, expect, it } from "vitest";
import { beatText, guideText, type Controls } from "./controls";
import { TOUR_ORDER } from "./tour";

const ctx = { first: "Biscuit", second: "Daisy", third: "Rocket", group: "Small & Gentle", upgrade: "Toy Bin" };
const MODES: Controls[] = ["3d", "map", "list"];

describe("instructions for each kind of control", () => {
  it("every tour beat has a title and an action for 3D, the map and the list", () => {
    for (const beat of TOUR_ORDER)
      for (const c of MODES) {
        const t = beatText(beat, c, ctx);
        expect(t.title.length, `${beat}/${c}`).toBeGreaterThan(3);
        expect(t.action.length, `${beat}/${c}`).toBeGreaterThan(10);
      }
  });
  it("the map and list never say drag or draw", () => {
    for (const c of ["map", "list"] as const) {
      for (const beat of TOUR_ORDER) expect(Object.values(beatText(beat, c, ctx)).join(" ")).not.toMatch(/drag|draw/i);
      for (let step = 1; step <= 5; step++) expect(guideText(step, c)).not.toMatch(/drag|draw/i);
    }
  });
  it("3D keeps the drag-out wording for rooms, and the map says where to tap", () => {
    expect(guideText(1, "3d")).toMatch(/Drag out/);
    expect(guideText(1, "map")).toMatch(/Tap Build/);
    expect(beatText("checkin", "map", ctx).action).toMatch(/on the map/);
    expect(beatText("checkin", "list", ctx).action).toMatch(/Front desk/);
  });
  it("names the pups, the playroom and the chosen upgrade", () => {
    expect(beatText("place", "3d", ctx).action).toContain("Small & Gentle");
    expect(beatText("benefit", "3d", ctx).action).toContain("Daisy");
    expect(beatText("benefit", "3d", ctx).action).toContain("Toy Bin");
    expect(beatText("decision", "3d", ctx).action).toContain("Rocket");
  });
});
