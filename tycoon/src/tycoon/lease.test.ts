// One tab plays at a time (service design, "One tab plays"): the clock, costs and saves run in one tab only.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {} }) }));

import { LEASE_KEY, LEASE_STALE_MS, claimLease } from "./lease";
import { KEY, tycoonStore, useTycoon } from "./store";
import { fac, withFac } from "./state";
import { ok, richState } from "./testkit";
import { setOpen } from "./run";

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe("the lease", () => {
  it("the first tab claims it; a second can't while it's fresh; it can once it's stale; 'Play here' takes it", () => {
    const st = mem();
    expect(claimLease(st, "A", 1000)).toBe(true);
    expect(claimLease(st, "B", 2000)).toBe(false);
    expect(claimLease(st, "A", 3000)).toBe(true); // refreshing your own
    expect(claimLease(st, "B", 3000 + LEASE_STALE_MS + 1)).toBe(true);
    expect(claimLease(st, "A", 3000 + LEASE_STALE_MS + 2)).toBe(false);
    expect(claimLease(st, "A", 3000 + LEASE_STALE_MS + 3, true)).toBe(true);
  });
  it("a broken lease value counts as free", () => {
    const st = mem();
    st.setItem(LEASE_KEY, "not json");
    expect(claimLease(st, "A", 1)).toBe(true);
  });
});

describe("a second tab", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    tycoonStore._reset(null);
  });
  afterEach(() => vi.useRealTimers());
  it("watches without running the clock or saving, until the player chooses Play here", () => {
    const s = ok(setOpen(richState(), true));
    const saved = JSON.stringify(withFac(s, { ...fac(s), clockMin: 9 * 60 }));
    localStorage.setItem(KEY, saved);
    localStorage.setItem(LEASE_KEY, JSON.stringify({ tab: "other-tab", at: Date.now() }));
    const { result, unmount } = renderHook(() => useTycoon());
    expect(result.current.spectator).toBe(true);
    const clock = fac(result.current.state!).clockMin;
    act(() => vi.advanceTimersByTime(3000));
    expect(fac(tycoonStore.getState()!).clockMin).toBe(clock); // no time passes here
    expect(JSON.parse(localStorage.getItem(KEY)!).facilities.f1.clockMin).toBe(9 * 60); // and nothing is written
    act(() => result.current.playHere());
    expect(result.current.spectator).toBe(false);
    expect(JSON.parse(localStorage.getItem(LEASE_KEY)!).tab).not.toBe("other-tab");
    act(() => vi.advanceTimersByTime(3000));
    expect(fac(tycoonStore.getState()!).clockMin).toBeGreaterThan(clock);
    unmount();
  });
});
