// Audit finding 1 (building's pause): the player's pause preference is separate from mandatory holds. A hold (building,
// choosing a spot, a level-up, the day's report) stops the simulation even if the player taps Resume; leaving it
// restores the preference; a reload while held comes back paused, with no catch-up.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {}, warning: () => {}, info: () => {} }) }));
import { KEY, tycoonStore, useTycoon } from "./store";
import { setOpen } from "./run";
import { quickStart } from "./start";
import { fac, newTycoon, withFac } from "./state";
import { ok } from "./testkit";

const SKIPPED = { mode: "quick", beat: "meet", startedAt: 0, upgrade: null, done: false, skipped: true } as const;
function openDay() {
  const s = ok(setOpen({ ...ok(quickStart(newTycoon(Date.now()))), tour: SKIPPED, pendingLevel: null }, true));
  localStorage.setItem(KEY, JSON.stringify(withFac(s, { ...fac(s), clockMin: 9 * 60 })));
  return renderHook(() => useTycoon());
}
const clock = () => fac(tycoonStore.getState()!).clockMin;
const run = (ms: number) => act(() => vi.advanceTimersByTime(ms));

describe("holds vs the pause preference", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    tycoonStore._reset(null);
  });
  afterEach(() => vi.useRealTimers());

  it("while held, Resume can't restart time; releasing the hold restores the earlier preference (running)", () => {
    const h = openDay();
    run(2000);
    const t0 = clock();
    expect(t0).toBeGreaterThan(9 * 60);
    act(() => tycoonStore.hold("build", true));
    run(2000);
    expect(clock()).toBe(t0 + 0); // held
    act(() => h.result.current.setPaused(false)); // the player taps Resume while building
    run(3000);
    expect(clock()).toBe(t0); // still held
    act(() => tycoonStore.hold("build", false));
    run(2000);
    expect(clock()).toBeGreaterThan(t0); // running again, as before Build
    h.unmount();
  });

  it("already paused → hold → release: still paused", () => {
    const h = openDay();
    act(() => h.result.current.setPaused(true));
    act(() => tycoonStore.hold("build", true));
    act(() => tycoonStore.hold("build", false));
    const t0 = clock();
    run(3000);
    expect(clock()).toBe(t0);
    expect(h.result.current.paused).toBe(true);
    h.unmount();
  });

  it("overlapping holds: time waits until the last one ends", () => {
    const h = openDay();
    act(() => tycoonStore.hold("build", true));
    act(() => tycoonStore.hold("level", true));
    act(() => tycoonStore.hold("build", false));
    const t0 = clock();
    run(3000);
    expect(clock()).toBe(t0);
    act(() => tycoonStore.hold("level", false));
    run(2000);
    expect(clock()).toBeGreaterThan(t0);
    h.unmount();
  });

  it("a reload while held comes back paused (time doesn't restart on its own), and nothing is caught up", () => {
    const h = openDay();
    act(() => tycoonStore.hold("build", true));
    const t0 = clock();
    h.unmount(); // the page goes away mid-build (reload, or the phone locks and the tab is discarded)
    tycoonStore._reset(null);
    vi.advanceTimersByTime(60_000); // a minute away
    const again = renderHook(() => useTycoon());
    expect(again.result.current.paused).toBe(true);
    expect(clock()).toBe(t0);
    run(3000);
    expect(clock()).toBe(t0);
    again.unmount();
  });
  it("full or blocked storage: a hold still stops time, and nothing throws (review finding)", () => {
    openDay();
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    try {
      expect(() => act(() => tycoonStore.hold("screen", true))).not.toThrow();
      expect(tycoonStore.getSnapshot().held).toBe(true);
      const c = clock();
      run(5000);
      expect(clock()).toBe(c);
      expect(() => act(() => tycoonStore.hold("screen", false))).not.toThrow();
      expect(tycoonStore.getSnapshot().held).toBe(false);
    } finally {
      set.mockRestore();
    }
  });
});


describe("several tabs (audit gap A): a watching tab never takes another tab's recovery state", () => {
  const HELD = `${KEY}-held`;
  const LEASE = "pawtastic-daycare-next-lease";
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    tycoonStore._reset(null);
  });
  afterEach(() => vi.useRealTimers());
  const save = () => {
    const s = ok(setOpen({ ...ok(quickStart(newTycoon(Date.now()))), tour: SKIPPED, pendingLevel: null }, true));
    localStorage.setItem(KEY, JSON.stringify(withFac(s, { ...fac(s), clockMin: 9 * 60 })));
  };

  it("tab A builds; tab B opens to watch and closes; A closes mid-build; reopening later stays paused", () => {
    save();
    // tab A is playing and is in Build: it holds the lease and the "came back held" marker is set
    localStorage.setItem(LEASE, JSON.stringify({ tab: "tab-A", at: Date.now() }));
    localStorage.setItem(HELD, "1");
    const b = renderHook(() => useTycoon());
    expect(b.result.current.spectator).toBe(true);
    b.unmount();
    expect(localStorage.getItem(HELD)).toBe("1"); // the watcher left A's recovery state alone
    // tab A goes away mid-build (its lease is released); a new page opens later
    localStorage.setItem(LEASE, JSON.stringify({ tab: "", at: 0 }));
    tycoonStore._reset(null);
    const c = renderHook(() => useTycoon());
    expect(c.result.current.spectator).toBe(false);
    expect(c.result.current.paused).toBe(true);
    const clock = fac(tycoonStore.getState()!).clockMin;
    act(() => vi.advanceTimersByTime(5000));
    expect(fac(tycoonStore.getState()!).clockMin).toBe(clock); // no time ran, none was caught up
    c.unmount();
  });

  it("a watching tab that takes over from a tab mid-build comes in paused", () => {
    save();
    localStorage.setItem(LEASE, JSON.stringify({ tab: "tab-A", at: Date.now() }));
    localStorage.setItem(HELD, "1");
    const b = renderHook(() => useTycoon());
    act(() => b.result.current.playHere());
    expect(b.result.current.spectator).toBe(false);
    expect(b.result.current.paused).toBe(true);
    const clock = fac(tycoonStore.getState()!).clockMin;
    act(() => vi.advanceTimersByTime(5000));
    expect(fac(tycoonStore.getState()!).clockMin).toBe(clock);
    b.unmount();
  });

  it("a watching tab's own screens never write or clear the marker", () => {
    save();
    localStorage.setItem(LEASE, JSON.stringify({ tab: "tab-A", at: Date.now() }));
    const b = renderHook(() => useTycoon());
    expect(b.result.current.spectator).toBe(true);
    act(() => tycoonStore.hold("screen", true));
    expect(localStorage.getItem(HELD)).toBeNull();
    localStorage.setItem(HELD, "1"); // tab A starts building meanwhile
    act(() => tycoonStore.hold("screen", false));
    expect(localStorage.getItem(HELD)).toBe("1");
    b.unmount();
  });
});
