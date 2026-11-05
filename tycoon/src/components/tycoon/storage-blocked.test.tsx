// Audit gap B: a browser can block storage so that even reading `window.localStorage` throws (blocked cookies, some
// private modes, sandboxed frames). The game must still start, be fully playable from memory, and say plainly that
// progress can't be saved — never claim it saved.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { TPick } from "@/tycoon/render/world";

vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {}, warning: () => {}, info: () => {} }) }));
vi.mock("@/components/tycoon/TycoonStage", async () => {
  const React = await import("react");
  return {
    TycoonStage: React.forwardRef(function Stub(_props: { onPick: (p: TPick | null) => void }, ref) {
      React.useImperativeHandle(ref, () => ({ fx: () => {}, resetCamera: () => {}, focus: () => {}, debug: () => null }));
      return React.createElement("div", { "data-testid": "stage" });
    }),
  };
});

import { TycoonPlay } from "./TycoonPlay";
import { tycoonStore } from "@/tycoon/store";
import { fac } from "@/tycoon/state";

const real = Object.getOwnPropertyDescriptor(window, "localStorage") ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), "localStorage");
const realSession = Object.getOwnPropertyDescriptor(window, "sessionStorage") ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), "sessionStorage");
const deny = () => {
  throw new DOMException("The operation is insecure.", "SecurityError");
};

describe("blocked browser storage (audit gap B)", () => {
  beforeEach(() => {
    localStorage.clear();
    tycoonStore._reset(null);
  });
  afterEach(() => {
    if (real) Object.defineProperty(window, "localStorage", real);
    if (realSession) Object.defineProperty(window, "sessionStorage", realSession);
  });

  it("even getting localStorage throws: the game starts, plays from memory, and says progress can't be saved", () => {
    Object.defineProperty(window, "localStorage", { configurable: true, get: deny });
    Object.defineProperty(window, "sessionStorage", { configurable: true, get: deny });
    expect(() => render(<TycoonPlay />)).not.toThrow();
    expect(tycoonStore.getState()).not.toBeNull();
    expect(screen.getByRole("status", { name: /can't be saved/i })).toBeTruthy();
    // playable: the start card's Quick start builds a daycare in memory
    fireEvent.click(screen.getAllByRole("button", { name: /Quick start/i })[0]!);
    expect(fac(tycoonStore.getState()!).rooms.length).toBeGreaterThan(0);
  });

  it("storage you can read but can't write (full, or a private mode): the same notice, and nothing claims it saved", () => {
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    try {
      render(<TycoonPlay />);
      act(() => {
        fireEvent.click(screen.getAllByRole("button", { name: /Quick start/i })[0]!);
      });
      expect(screen.getByRole("status", { name: /can't be saved/i })).toBeTruthy();
    } finally {
      set.mockRestore();
    }
  });

  it("normal storage: no such notice", () => {
    render(<TycoonPlay />);
    expect(screen.queryByRole("status", { name: /can't be saved/i })).toBeNull();
  });
});
