// One tab plays at a time (service design, "One tab plays"): the clock, costs and saves run in one tab only.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {} }) }));

import { LEASE_KEY, LEASE_STALE_MS, claimLease, releaseLease, tabId } from "./lease";
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
  it("a closing page releases its lease, so a reload (a new page) can play at once", () => {
    const st = mem();
    expect(claimLease(st, "old-page", 1000)).toBe(true);
    releaseLease(st, "old-page");
    expect(claimLease(st, "new-page", 1001)).toBe(true);
  });
  it("every page load gets its own id (a duplicated tab never shares one)", () => {
    expect(tabId()).not.toBe(tabId());
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
  it("takes over by itself when the other tab goes away (its lease goes stale)", () => {
    const s = ok(setOpen(richState(), true));
    localStorage.setItem(KEY, JSON.stringify(withFac(s, { ...fac(s), clockMin: 9 * 60 })));
    localStorage.setItem(LEASE_KEY, JSON.stringify({ tab: "closed-tab", at: Date.now() }));
    const { result, unmount } = renderHook(() => useTycoon());
    expect(result.current.spectator).toBe(true);
    act(() => vi.advanceTimersByTime(LEASE_STALE_MS + 3000));
    expect(result.current.spectator).toBe(false);
    unmount();
  });
  it("a hidden watching tab that takes over stays paused (time away never costs anything)", () => {
    const s = ok(setOpen(richState(), true));
    localStorage.setItem(KEY, JSON.stringify(withFac(s, { ...fac(s), clockMin: 9 * 60 })));
    localStorage.setItem(LEASE_KEY, JSON.stringify({ tab: "closed-tab", at: Date.now() }));
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    const { result, unmount } = renderHook(() => useTycoon());
    act(() => vi.advanceTimersByTime(LEASE_STALE_MS + 3000));
    expect(result.current.spectator).toBe(false);
    expect(result.current.paused).toBe(true);
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    unmount();
  });
  it("a leading tab that finds another tab has taken over stops writing at once", () => {
    const s = ok(setOpen(richState(), true));
    localStorage.setItem(KEY, JSON.stringify(withFac(s, { ...fac(s), clockMin: 9 * 60 })));
    const { result, unmount } = renderHook(() => useTycoon());
    expect(result.current.spectator).toBe(false);
    localStorage.setItem(LEASE_KEY, JSON.stringify({ tab: "new-leader", at: Date.now() }));
    const before = localStorage.getItem(KEY);
    act(() => tycoonStore.set((x) => ({ ...x, coins: x.coins + 999 })));
    expect(localStorage.getItem(KEY)).toBe(before);
    expect(result.current.spectator).toBe(true);
    unmount();
  });
  it("actions in a watching tab are refused (never silently lost)", () => {
    const s = ok(setOpen(richState(), true));
    localStorage.setItem(KEY, JSON.stringify(s));
    localStorage.setItem(LEASE_KEY, JSON.stringify({ tab: "other-tab", at: Date.now() }));
    const { result, unmount } = renderHook(() => useTycoon());
    const r = tycoonStore.dispatch((x) => ({ ok: true, state: { ...x, coins: x.coins + 5 } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/another tab/);
    unmount();
  });
});
