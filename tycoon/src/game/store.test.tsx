import { describe, expect, it, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {}, warning: () => {} }) }));
import { checkIn, createArrival, newGame, nyDateKey, type GameState } from "./engine";
import { useGame } from "./store";

const KEY = "pawtastic-tycoon-save-v1";
const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]!; };
function seeded(): GameState {
  let s: GameState = { ...newGame(Date.now(), nyDateKey()), coins: 1000, clockMin: 9 * 60 };
  for (let i = 0; i < 2; i++) {
    const r = createArrival(s, seq([0.2, 0, 0.1, 0.5, 0.5, 0.5, 0.5]));
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  return s;
}

describe("useGame store: rapid actions", () => {
  beforeEach(() => localStorage.clear());

  it("two check-ins in the same tick both persist (no lost update) and each fee is paid once", () => {
    localStorage.setItem(KEY, JSON.stringify(seeded()));
    const { result, unmount } = renderHook(() => useGame());
    const [a, b] = result.current.state!.dogs.map((d) => d.id);
    act(() => {
      result.current.act((s) => checkIn(s, a!));
      result.current.act((s) => checkIn(s, b!));
      result.current.act((s) => checkIn(s, a!)); // double tap on the same pup is refused
    });
    const s = result.current.state!;
    expect(s.dogs.filter((d) => d.checkedIn).map((d) => d.id).sort()).toEqual([a, b].sort());
    expect(s.coins).toBe(1040);
    expect(s.stats.admitted).toBe(2);
    unmount();
  });

  it("an action between clock ticks is not overwritten by the tick", () => {
    vi.useFakeTimers();
    localStorage.setItem(KEY, JSON.stringify(seeded()));
    const { result, unmount } = renderHook(() => useGame());
    const id = result.current.state!.dogs[0]!.id;
    act(() => {
      vi.advanceTimersByTime(1000);
      result.current.act((s) => checkIn(s, id));
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.state!.dogs.find((d) => d.id === id)!.checkedIn).toBe(true);
    expect(result.current.state!.clockMin).toBeGreaterThan(9 * 60);
    unmount();
    vi.useRealTimers();
  });

  it("an unreadable save is set aside, not destroyed", () => {
    localStorage.setItem(KEY, "{not json");
    const { result, unmount } = renderHook(() => useGame());
    expect(result.current.state!.coins).toBe(500);
    const kept = Object.keys(localStorage).filter((k) => k.startsWith(`${KEY}-unreadable-`));
    expect(kept.length).toBe(1);
    expect(localStorage.getItem(kept[0]!)).toBe("{not json");
    unmount();
  });
});
