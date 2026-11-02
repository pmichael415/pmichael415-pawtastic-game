import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { success: () => {}, error: () => {}, warning: () => {}, info: () => {} }),
}));
import { drawRoom } from "./build";
import { KEY, useTycoon, tycoonStore } from "./store";
import { fac, newTycoon, parseTycoon, withFac } from "./state";
import { setOpen } from "./run";
import { guidedBuild } from "./testkit";
import { weekKey } from "@/game/engine";
import type { TycoonState } from "./types";

type Ev = { name: string; props: Record<string, unknown> };
const events = () => ((window as unknown as { __pawtasticEvents?: Ev[] }).__pawtasticEvents ?? []);
const named = (n: string) => events().filter((e) => e.name === n);

describe("the tycoon store", () => {
  beforeEach(() => {
    localStorage.clear();
    tycoonStore._reset(null);
    const w = window as unknown as { __pawtasticEvents?: Ev[] };
    if (w.__pawtasticEvents) w.__pawtasticEvents.length = 0;
  });

  it("starts a fresh game and round-trips it through localStorage", () => {
    const { result, unmount } = renderHook(() => useTycoon());
    expect(result.current.state!.coins).toBe(3000);
    act(() => {
      result.current.act((s) => drawRoom(s, 10, 16, 4, 3), { event: { name: "tycoon_build", props: { kind: "room", action: "place" } } });
    });
    unmount();
    const saved = parseTycoon(JSON.parse(localStorage.getItem(KEY)!))!;
    expect(fac(saved).rooms).toHaveLength(1);
    expect(saved.coins).toBe(2600);
    expect(named("tycoon_build").at(-1)?.props).toEqual({ kind: "room", action: "place" });
    const again = renderHook(() => useTycoon());
    expect(fac(again.result.current.state!).rooms).toHaveLength(1);
    again.unmount();
  });

  it("starts this week's challenge on load, and pays last week's finished one", () => {
    const { result, unmount } = renderHook(() => useTycoon());
    expect(result.current.state!.weekly?.week).toBe(weekKey());
    unmount();
    tycoonStore._reset(null);
    const s = newTycoon(Date.now());
    const lastWeek = { ...s, weekly: { week: "2020-W01", goal: "serve", base: { checkouts: 0, plays: 0, admitted: 0, baths: 0, boarders: 0 }, baseDay: 1, claimed: false } };
    localStorage.setItem(KEY, JSON.stringify(withFac(lastWeek, { ...fac(lastWeek), stats: { ...fac(lastWeek).stats, checkouts: 30 } })));
    const again = renderHook(() => useTycoon());
    expect(again.result.current.state!.weekly?.week).toBe(weekKey());
    expect(again.result.current.state!.coins).toBe(3000 + 300);
    again.unmount();
  });

  it("sets an unreadable save aside and starts fresh", () => {
    localStorage.setItem(KEY, "{not json");
    const { result, unmount } = renderHook(() => useTycoon());
    expect(result.current.state!.coins).toBe(3000);
    const aside = Object.keys(localStorage).filter((k) => k.startsWith(`${KEY}-unreadable-`));
    expect(aside).toHaveLength(1);
    expect(localStorage.getItem(aside[0]!)).toBe("{not json");
    unmount();
  });

  it("failed actions change nothing and send no event", () => {
    const { result, unmount } = renderHook(() => useTycoon());
    let r;
    act(() => {
      r = result.current.act((s) => drawRoom(s, 0, 0, 4, 3), { quiet: true, event: { name: "tycoon_build", props: { kind: "room", action: "place" } } });
    });
    expect(r).toEqual({ ok: false, error: "Buy this land first." });
    expect(named("tycoon_build")).toHaveLength(0);
    unmount();
  });

  it("pays trophies, reports levels, guide steps and new days", () => {
    vi.useFakeTimers();
    const s: TycoonState = withFac(guidedBuild(newTycoon(Date.now())), { ...fac(guidedBuild(newTycoon(Date.now()))), clockMin: 17 * 60 + 59 });
    localStorage.setItem(KEY, JSON.stringify({ ...s, xp: 90 }));
    const { result, unmount } = renderHook(() => useTycoon());
    act(() => {
      result.current.act((t) => setOpen(t, true), { event: { name: "tycoon_open", props: { day: 1 } } });
    });
    expect(named("tycoon_open")).toHaveLength(1);
    act(() => {
      result.current.act((t) => drawRoom(t, 10, 16, 2, 2)); // +16 XP crosses level 2
    });
    expect(named("tycoon_level").map((e) => e.props["level"])).toEqual([2]);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(fac(result.current.state!).day).toBe(2);
    expect(named("tycoon_day")).toHaveLength(1);
    expect(named("tycoon_day")[0]!.props).toMatchObject({ day: 1 });
    act(() => {
      result.current.set((t) => ({ ...t, guide: { ...t.guide, painted: true } }));
    });
    expect(named("tycoon_guide").map((e) => e.props["step"])).toContain(4);
    act(() => {
      result.current.set((t) => withFac(t, { ...fac(t), stats: { ...fac(t).stats, checkouts: 1 } }));
      result.current.act((t) => ({ ok: true, state: t }));
    });
    expect(result.current.state!.trophies).toContain("first_dog");
    expect(named("tycoon_trophy").map((e) => e.props["id"])).toContain("first_dog");
    unmount();
    vi.useRealTimers();
  });

  it("coming back to a tab never overwrites a newer save from another tab", () => {
    const { result, unmount } = renderHook(() => useTycoon());
    expect(result.current.state).toBeTruthy();
    const other = { ...newTycoon(Date.now()), coins: 4242 };
    localStorage.setItem(KEY, JSON.stringify(other)); // another tab saved
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(JSON.parse(localStorage.getItem(KEY)!).coins).toBe(4242);
    unmount();
  });

  it("pauses when hidden", () => {
    const { result, unmount } = renderHook(() => useTycoon());
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current.paused).toBe(true);
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    unmount();
  });
});
