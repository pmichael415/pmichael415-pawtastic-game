import { beforeEach, describe, expect, it } from "vitest";
import { activePaidVisuals, PREFS_KEY, readPrefs } from "./paidVisuals";

const allOn = { "ribbon-collar": true, "navy-star-bandana": true, "sparkle-trail": true, "deluxe-decor": true } as const;
describe("paid visuals come only from server entitlements", () => {
  beforeEach(() => localStorage.clear());
  it("guest, loading or error states show nothing even with every preference on", () => {
    for (const st of ["guest", "loading", "error"] as const) {
      expect(Object.values(activePaidVisuals(allOn, st, new Set(["blue-ribbon-style", "deluxe-daycare-decor"]))).some(Boolean)).toBe(false);
    }
  });
  it("tampered localStorage preferences alone cannot equip anything", () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...allOn, owned: ["blue-ribbon-style"] }));
    expect(Object.values(activePaidVisuals(readPrefs(), "ready", new Set())).some(Boolean)).toBe(false);
  });
  it("owning one pack only enables that pack's items, and only when equipped", () => {
    const v = activePaidVisuals(allOn, "ready", new Set(["blue-ribbon-style"]));
    expect(v).toEqual({ "ribbon-collar": true, "navy-star-bandana": true, "sparkle-trail": true, "deluxe-decor": false });
    expect(activePaidVisuals({}, "ready", new Set(["blue-ribbon-style"]))["ribbon-collar"]).toBe(false);
  });
});
