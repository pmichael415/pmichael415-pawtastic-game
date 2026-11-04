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
  it("3D names the tools the player actually has (Rooms → Lobby, then furnish it), and the map says where to tap", () => {
    // the hub build said "drag out a room" while its buttons placed rooms in the first free spot (empire milestone §2)
    expect(guideText(1, "3d")).toMatch(/Rooms → Lobby/);
    expect(guideText(1, "3d")).not.toMatch(/drag|draw/i);
    expect(guideText(2, "3d")).toMatch(/Rooms → Playroom/);
    expect(guideText(2, "3d")).toMatch(/Furniture/);
    expect(guideText(1, "map")).toMatch(/In Build below, tap Place next to Lobby/);
    expect(beatText("checkin", "map", ctx).action).toMatch(/on the map/);
    expect(beatText("checkin", "list", ctx).action).toMatch(/Front desk/);
  });
  it("names the pups, the playroom and the chosen upgrade", () => {
    expect(beatText("place", "3d", ctx).action).toContain("Small & Gentle");
    expect(beatText("benefit", "3d", ctx).action).toContain("Daisy");
    expect(beatText("benefit", "3d", ctx).action).toContain("Toy Bin");
    expect(beatText("decision", "3d", ctx).action).toContain("Rocket");
    const ready = beatText("decision", "map", { ...ctx, roomReady: true });
    expect(ready.title).toBe("Rocket's room is ready");
    expect(ready.action).toMatch(/Tap Rocket on the map, check him in, then “To Large & Active”/);
  });
  it("the last step says what ticks it: once you're open, it says so and what's left", () => {
    expect(guideText(5, "3d", false)).toMatch(/^Switch Open on/);
    expect(guideText(5, "3d", true)).toMatch(/^✓ You're open\. Now check the first pup in/);
  });
  it("map and list building steps point at the Build list's Place buttons, and never promise moving things", () => {
    for (const c of ["map", "list"] as const) {
      expect(guideText(1, c)).not.toMatch(/Tap Build/);
      expect(guideText(1, c)).toMatch(/Place/);
      expect(beatText("upgrade", c, ctx).action).not.toMatch(/move it/);
    }
  });
});
