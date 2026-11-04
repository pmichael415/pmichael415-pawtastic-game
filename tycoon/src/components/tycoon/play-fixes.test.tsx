// Fixes from Claude's play session (combined-loop plan, task 6): what playing on a phone-sized screen showed.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { TPick } from "@/tycoon/render/world";

const toasts: { msg: string; opts?: { action?: { label: string; onClick: () => void } } | undefined }[] = [];
vi.mock("sonner", () => {
  const rec = (msg: string, opts?: never) => void toasts.push({ msg, opts });
  return { toast: Object.assign(rec, { success: rec, error: rec, warning: rec, info: rec }) };
});
let emit: (p: TPick | null) => void = () => {};
vi.mock("@/components/tycoon/TycoonStage", async () => {
  const React = await import("react");
  return {
    TycoonStage: React.forwardRef(function Stub(props: { onPick: (p: TPick | null) => void }, ref) {
      React.useImperativeHandle(ref, () => ({ fx: () => {}, resetCamera: () => {}, focus: () => {}, debug: () => null }));
      emit = props.onPick;
      return React.createElement("div", { "data-testid": "stage" });
    }),
  };
});

import { TycoonPlay } from "./TycoonPlay";
import { KEY, tycoonStore } from "@/tycoon/store";
import { MOMENT_ACTION } from "@/tycoon/moments";
import { checkout } from "@/tycoon/run";
import { xpForLevel } from "@/tycoon/progress";
import { quickStart } from "@/tycoon/start";
import { fac, newTycoon, withFac } from "@/tycoon/state";
import { hire } from "@/tycoon/team";
import { ok } from "@/tycoon/testkit";
import { defaultVisit } from "@/tycoon/visit";
import type { TDog, TycoonState } from "@/tycoon/types";

const now = () => tycoonStore.getState()!;
const SKIPPED = { mode: "quick", beat: "meet", startedAt: 0, upgrade: null, done: false, skipped: true } as const;
function day(): TycoonState {
  const s = ok(hire(ok(quickStart(newTycoon(0))), "reception"));
  const f = fac(s);
  const room = f.rooms.find((r) => r.type === "playroom")!.uid;
  const mk = (id: string, name: string): TDog => {
    const d: TDog = { id, name, breed: 1, size: "small", temper: "gentle", visits: 1, place: { kind: "room", room }, checkedIn: true, happiness: 80, clean: 70, boarding: false, played: 1, bathed: false };
    return { ...d, visit: { ...defaultVisit(f, d), arrivedDay: f.day, arrived: 8 * 60, checkedInAt: 8 * 60, pickup: 17 * 60 } };
  };
  return { ...withFac(s, { ...f, open: true, clockMin: 12 * 60, introDay: 0, dogs: [mk("a", "Biscuit"), mk("b", "Luna")], stats: { ...f.stats, checkouts: 1 } }), coins: 20000, xp: xpForLevel(6), pendingLevel: null, tour: SKIPPED, bestProfit: 50 };
}
function open(s: TycoonState) {
  localStorage.setItem(KEY, JSON.stringify(s));
  return render(<TycoonPlay />);
}
const sheet = () => screen.getByTestId("panel-sheet");

beforeEach(() => {
  localStorage.clear();
  tycoonStore._reset(null);
  toasts.length = 0;
});

describe("a pup's panel on a phone", () => {
  it("has a Close button (it covers half the daycare; tapping empty ground isn't obvious)", () => {
    open(day());
    act(() => emit({ kind: "dog", id: "a" }));
    fireEvent.click(within(sheet()).getByRole("button", { name: "Close panel" }));
    expect(screen.queryByTestId("panel-sheet")).toBeNull();
  });
  it("a receipt waits until the panel is closed, so it never covers the buttons you're using", () => {
    open(day());
    act(() => emit({ kind: "dog", id: "a" }));
    act(() => tycoonStore.set((s) => ok(checkout(s, "b", false))));
    expect(screen.queryByRole("region", { name: "Receipt" })).toBeNull();
    fireEvent.click(within(sheet()).getByRole("button", { name: "Close panel" }));
    expect(screen.getByRole("region", { name: "Receipt" })).toBeTruthy();
  });
});

describe("mopping from the daycare view", () => {
  it("a pup in a room that's getting dirty offers Mop floors right in its panel (not only in the list view)", () => {
    const s = day();
    const room = fac(s).rooms.find((r) => r.type === "playroom")!.uid;
    open(withFac(s, { ...fac(s), roomClean: { ...fac(s).roomClean, [room]: 45 } }));
    act(() => emit({ kind: "dog", id: "a" }));
    fireEvent.click(within(sheet()).getByRole("button", { name: "Mop floors" }));
    expect(fac(now()).roomClean?.[room] ?? 0).toBeGreaterThan(45);
  });
  it("tapping a room shows Mop floors when it isn't spotless", () => {
    const s = day();
    const room = fac(s).rooms.find((r) => r.type === "playroom")!.uid;
    open(withFac(s, { ...fac(s), roomClean: { ...fac(s).roomClean, [room]: 70 } }));
    act(() => emit({ kind: "room", uid: room }));
    expect(within(sheet()).getByRole("button", { name: "Mop floors" })).toBeTruthy();
  });
});

describe("moments read naturally", () => {
  it("each answer button is a plain sentence with the pup's name", () => {
    expect(MOMENT_ACTION.cuddles("Rocket")).toBe("Give Rocket a cuddle");
    expect(MOMENT_ACTION.fetch("Rocket")).toBe("Throw the ball for Rocket");
    expect(MOMENT_ACTION.tug("Rocket")).toBe("Play tug with Rocket");
    expect(MOMENT_ACTION.zoomies("Rocket")).toBe("Do zoomies with Rocket");
    expect(MOMENT_ACTION.splash("Rocket")).toBe("Splash with Rocket");
  });
});

describe("choosing a spot", () => {
  it("time waits while you choose (no family gives up while you decide), and starts again after", () => {
    open(day());
    if (!screen.queryByRole("region", { name: "Expand your daycare" })) fireEvent.click(screen.getByRole("button", { name: /^(Expansion options|See options)$/ }));
    const card = within(screen.getByRole("region", { name: "Expand your daycare" }));
    fireEvent.click(within(card.getByRole("article", { name: "Play yard" })).getByRole("button", { name: /^Choose a spot/ }));
    expect(screen.getByRole("button", { name: "Resume" })).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Choose a spot" })).getByText(/Time waits while you choose/)).toBeTruthy();
    fireEvent.click(within(screen.getByRole("region", { name: "Choose a spot" })).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
  });
});

describe("families who asked for a room you don't have", () => {
  it("are mentioned once per kind of pup per day, with a way to the options", () => {
    open(day());
    act(() => tycoonStore.set((s) => withFac(s, { ...fac(s), asked: { day: fac(s).day, groups: { "small-active": 1 } } })));
    act(() => tycoonStore.set((s) => withFac(s, { ...fac(s), asked: { day: fac(s).day, groups: { "small-active": 2 } } })));
    const notes = toasts.filter((t) => /Small & Active/.test(t.msg));
    expect(notes).toHaveLength(1);
    expect(notes[0]!.msg).toMatch(/no Small & Active playroom/);
    expect(notes[0]!.opts?.action?.label).toBe("See options");
    act(() => notes[0]!.opts!.action!.onClick());
    expect(screen.getByRole("region", { name: "Expand your daycare" })).toBeTruthy();
  });
});
