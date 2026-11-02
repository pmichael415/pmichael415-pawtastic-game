// Measuring the first 15 minutes (Stage A, spec §3.8): the tour sends tycoon_guide events for its start, each beat
// reached (once, with seconds since the start), a skip (with the beat it was skipped at) and a return on a later day.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {} }) }));

import { KEY, setTourControls, tycoonStore, useTycoon } from "./store";
import { fac, newTycoon } from "./state";
import { passUpgrade, skipTour, startTour } from "./tour";
import { checkIn } from "./run";
import type { TycoonState } from "./types";

type Ev = { name: string; props: Record<string, unknown> };
const guide = () => ((window as unknown as { __pawtasticEvents?: Ev[] }).__pawtasticEvents ?? []).filter((e) => e.name === "tycoon_guide");
const mark = () => guide().length;
const since = (n: number) => guide().slice(n).map((e) => e.props);

describe("tour measurement", () => {
  beforeEach(() => {
    localStorage.clear();
    tycoonStore._reset(newTycoon(Date.now()));
    setTourControls("3d");
  });

  it("a quick start sends start with the mode and the controls", () => {
    setTourControls("map");
    const n = mark();
    tycoonStore.set((s) => startTour(s, "quick", Date.now()));
    const evs = since(n);
    expect(evs[0]).toMatchObject({ beat: "start", mode: "quick", controls: "map" });
  });

  it("each beat reached is sent once, with seconds since the start", () => {
    const n = mark();
    tycoonStore.set((s) => startTour(s, "quick", Date.now() - 42_000));
    const biscuit = fac(tycoonStore.getState()!).dogs.find((d) => d.name === "Biscuit")!;
    tycoonStore.dispatch((s) => checkIn(s, biscuit.id));
    tycoonStore.set((s) => s); // a later change with nothing new reached
    const beats = since(n).filter((p) => p["beat"] !== "start");
    // the old building checklist isn't shown during the tour, so its step events aren't sent either
    expect(since(n).filter((p) => "step" in p)).toEqual([]);
    expect(beats.map((p) => p["beat"])).toEqual(["checkin", "place"]);
    for (const p of beats) {
      expect(p["sec"]).toBeGreaterThanOrEqual(42);
      expect(p["mode"]).toBe("quick");
      expect(p["controls"]).toBe("3d");
    }
  });

  it("'Not now' at the upgrade reports upgrade_passed, never a benefit that didn't happen", () => {
    tycoonStore.set((s) => ({ ...startTour(s, "quick", Date.now()), tour: { ...startTour(s, "quick", Date.now()).tour!, beat: "upgrade" } }));
    const n = mark();
    tycoonStore.set((s) => passUpgrade({ ...s, coins: 10 }));
    const beats = since(n).map((p) => p["beat"]);
    expect(beats).toContain("upgrade_passed");
    expect(beats).not.toContain("benefit");
    expect(beats).toContain("decision");
  });
  it("skipping sends skipped with the beat it was skipped at", () => {
    tycoonStore.set((s) => startTour(s, "scratch", Date.now()));
    const n = mark();
    tycoonStore.set((s) => skipTour(s));
    expect(since(n)).toEqual([expect.objectContaining({ beat: "skipped", at: "meet", mode: "scratch" })]);
  });

  it("opening the game on a later day sends return with the days away", () => {
    setTourControls(null);
    const saved: TycoonState = { ...newTycoon(Date.now()), lastSeen: Date.now() - 3 * 86_400_000 };
    localStorage.setItem(KEY, JSON.stringify(saved));
    tycoonStore._reset(null);
    const n = mark();
    const { unmount } = renderHook(() => useTycoon());
    const ret = since(n).filter((p) => p["beat"] === "return");
    expect(ret).toHaveLength(1);
    // the screen hasn't said which controls it has yet, so the event doesn't guess
    expect("controls" in ret[0]!).toBe(false);
    expect(ret[0]!["days"]).toBeGreaterThanOrEqual(2);
    unmount();
  });

  it("opening the game again the same day sends no return", () => {
    localStorage.setItem(KEY, JSON.stringify({ ...newTycoon(Date.now()), lastSeen: Date.now() - 60_000 }));
    tycoonStore._reset(null);
    const n = mark();
    const { unmount } = renderHook(() => useTycoon());
    expect(since(n).filter((p) => p["beat"] === "return")).toHaveLength(0);
    unmount();
  });
});
