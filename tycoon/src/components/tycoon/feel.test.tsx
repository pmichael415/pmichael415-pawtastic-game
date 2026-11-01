import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";

const toasts = vi.hoisted(() => ({ success: vi.fn(), plain: vi.fn() }));
vi.mock("sonner", () => ({
  toast: Object.assign((...a: unknown[]) => toasts.plain(...a), { success: (...a: unknown[]) => toasts.success(...a), error: () => {}, warning: () => {}, info: () => {} }),
}));

import { LevelUp } from "./LevelUp";
import { CoinCounter } from "./CoinCounter";
import { sound, _resetAudio } from "@/tycoon/sound";
import { setSettings } from "@/lib/settings";
import { KEY, tycoonStore, useTycoon } from "@/tycoon/store";
import { fac, newTycoon, withFac } from "@/tycoon/state";
import type { TycoonState } from "@/tycoon/types";

function Harness() {
  const { state, set } = useTycoon();
  return state ? <LevelUp state={state} set={set} /> : null;
}

describe("game feel", () => {
  beforeEach(() => {
    localStorage.clear();
    tycoonStore._reset(null);
    setSettings({ reducedMotion: false, sound: true, music: false });
    toasts.success.mockClear();
    toasts.plain.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    _resetAudio();
  });

  it("the level-up celebration lists what level 5 unlocks and the reward, then clears", () => {
    localStorage.setItem(KEY, JSON.stringify({ ...newTycoon(Date.now()), xp: 1000, pendingLevel: 5 } satisfies TycoonState));
    const { unmount } = render(<Harness />);
    expect(screen.getByRole("dialog", { name: "Level 5!" })).toBeTruthy();
    expect(screen.getByText("Agility Course")).toBeTruthy();
    expect(screen.getByText("Online ads")).toBeTruthy();
    expect(screen.getByText("+125 coins")).toBeTruthy();
    expect(screen.getByTestId("confetti")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(tycoonStore.getState()!.pendingLevel).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    unmount();
  });

  it("reduced motion: no confetti", () => {
    setSettings({ reducedMotion: true });
    localStorage.setItem(KEY, JSON.stringify({ ...newTycoon(Date.now()), xp: 1000, pendingLevel: 5 }));
    const { unmount } = render(<Harness />);
    expect(screen.getByRole("dialog", { name: "Level 5!" })).toBeTruthy();
    expect(screen.queryByTestId("confetti")).toBeNull();
    unmount();
  });

  it("sound off never creates an audio context; on, it makes one and reuses it", () => {
    const made = vi.fn();
    class FakeCtx {
      currentTime = 0;
      state = "running";
      destination = {};
      constructor() {
        made();
      }
      resume() {
        return Promise.resolve();
      }
      createOscillator() {
        return { type: "", frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} };
      }
      createGain() {
        return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
      }
    }
    vi.stubGlobal("AudioContext", FakeCtx);
    setSettings({ sound: false });
    sound.play("pop");
    sound.play("coins");
    expect(made).not.toHaveBeenCalled();
    setSettings({ sound: true });
    sound.play("pop");
    sound.play("fanfare");
    expect(made).toHaveBeenCalledTimes(1);
  });

  it("no AudioContext at all is fine", () => {
    vi.stubGlobal("AudioContext", undefined);
    expect(() => sound.play("thunk")).not.toThrow();
  });

  it("the coin counter shows the final value at once under reduced motion", () => {
    setSettings({ reducedMotion: true });
    const { rerender } = render(<CoinCounter value={100} />);
    rerender(<CoinCounter value={250} />);
    expect(screen.getByText("250")).toBeTruthy();
  });

  it("a trophy toast shows once", () => {
    localStorage.setItem(KEY, JSON.stringify(newTycoon(Date.now())));
    const { result, unmount } = renderHook(() => useTycoon());
    act(() => {
      result.current.set((s) => withFac(s, { ...fac(s), stats: { ...fac(s).stats, checkouts: 1 } }));
      result.current.act((s) => ({ ok: true, state: s }), { quiet: true });
      result.current.act((s) => ({ ok: true, state: s }), { quiet: true });
    });
    const trophyToasts = toasts.success.mock.calls.filter((c) => String(c[0]).startsWith("Trophy: "));
    expect(trophyToasts).toHaveLength(1);
    expect(trophyToasts[0]![0]).toBe("Trophy: First happy pup · +50 coins");
    unmount();
  });
});
