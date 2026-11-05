// The old game's clear service flow on the new world screen (milestone §2). The legacy-vs-new comparison
// (qa/flow-compare.cjs) found the new pup panel covering ~45% of a phone screen for a whole visit and never closing
// once the pup needed nothing. Now: a compact panel — who, where, what they need, and the one next step — with the
// details a tap away; when the pup is all set it closes by itself and says when the family comes back.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { TPick } from "@/tycoon/render/world";

const toasts: string[] = [];
vi.mock("sonner", () => ({ toast: Object.assign((m: string) => void toasts.push(m), { success: (m: string) => void toasts.push(m), error: () => {}, warning: () => {}, info: (m: string) => void toasts.push(m) }) }));
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
import { KEY, tycoonStore } from "@/tycoon/store";
import { quickStart } from "@/tycoon/start";
import { fac, newTycoon, withFac } from "@/tycoon/state";
import { ok } from "@/tycoon/testkit";
import { defaultVisit } from "@/tycoon/visit";
import type { TDog, TycoonState } from "@/tycoon/types";

const SKIPPED = { mode: "quick", beat: "meet", startedAt: 0, upgrade: null, done: false, skipped: true } as const;
/** A Quick start daycare, open, with one family at the desk (a small, gentle pup booked for daycare). */
function oneFamily(): TycoonState {
  const s = ok(quickStart(newTycoon(0)));
  const f = fac(s);
  const d: TDog = { id: "d0", name: "Hazel", breed: 1, size: "small", temper: "gentle", visits: 1, place: { kind: "lobby" }, checkedIn: false, happiness: 72, clean: 80, boarding: false, played: 0, bathed: false };
  return { ...withFac(s, { ...f, open: true, clockMin: 10 * 60, introDay: 0, dogs: [{ ...d, visit: { ...defaultVisit(f, d), arrivedDay: f.day, arrived: 9 * 60 + 58, owner: "Taylor", pickup: 16 * 60 } }], stats: { ...f.stats, checkouts: 1 } }), coins: 3000, pendingLevel: null, tour: SKIPPED };
}
const now = () => tycoonStore.getState()!;

beforeEach(() => {
  localStorage.clear();
  tycoonStore._reset(null);
  toasts.length = 0;
});

describe("serving a family, the old game's way", () => {
  it("check in → the compact panel shows the one next step; the details are a tap away, not in the way", () => {
    localStorage.setItem(KEY, JSON.stringify(oneFamily()));
    render(<TycoonPlay />);
    fireEvent.click(within(screen.getByRole("region", { name: "Front desk" })).getByRole("button", { name: "Check in Hazel" }));
    const sheet = within(screen.getByTestId("panel-sheet"));
    expect(sheet.getByTestId("next-action").textContent).toMatch(/To Small & Gentle/);
    // compact: who, where, what they need — the long details wait behind a toggle
    expect(sheet.getByText(/Needs: a playroom/)).toBeTruthy();
    expect(sheet.queryByText(/Looked after by/)).toBeNull();
    expect(sheet.queryByRole("meter", { name: "Clean" })).toBeNull();
    fireEvent.click(sheet.getByRole("button", { name: /^More about Hazel/ }));
    expect(sheet.getByText(/Looked after by/)).toBeTruthy();
    expect(sheet.getByRole("meter", { name: "Clean" })).toBeTruthy();
  });

  it("move → play → all set: the panel closes by itself and says when the family is back; the world is clear", () => {
    localStorage.setItem(KEY, JSON.stringify(oneFamily()));
    render(<TycoonPlay />);
    fireEvent.click(within(screen.getByRole("region", { name: "Front desk" })).getByRole("button", { name: "Check in Hazel" }));
    fireEvent.click(within(screen.getByTestId("next-action")).getByRole("button"));
    expect(fac(now()).dogs[0]!.place.kind).toBe("room");
    expect(within(screen.getByTestId("next-action")).getByRole("button").textContent).toMatch(/Playtime/);
    fireEvent.click(within(screen.getByTestId("next-action")).getByRole("button"));
    expect(fac(now()).dogs[0]!.played).toBe(1);
    expect(screen.queryByTestId("panel-sheet")).toBeNull();
    expect(toasts.some((t) => /Hazel is all set — Taylor picks up at 16:00/.test(t))).toBe(true);
  });
  it("while it waits, a pup that wants to play again says so on its room — one tap opens it with Playtime ready", () => {
    localStorage.setItem(KEY, JSON.stringify(oneFamily()));
    render(<TycoonPlay />);
    fireEvent.click(within(screen.getByRole("region", { name: "Front desk" })).getByRole("button", { name: "Check in Hazel" }));
    fireEvent.click(within(screen.getByTestId("next-action")).getByRole("button"));
    fireEvent.click(within(screen.getByTestId("next-action")).getByRole("button"));
    expect(screen.queryByTestId("panel-sheet")).toBeNull();
    // hours later, Hazel's happiness has drifted down (she'd like to play again, long before anyone complains)
    act(() => tycoonStore.set((x) => withFac(x, { ...fac(x), dogs: fac(x).dogs.map((d) => ({ ...d, happiness: 60 })) })));
    const cue = within(screen.getByRole("region", { name: "Rooms" })).getByRole("button", { name: /Hazel wants to play/ });
    fireEvent.click(cue);
    expect(within(screen.getByTestId("next-action")).getByRole("button").textContent).toMatch(/Playtime/);
  });
});

