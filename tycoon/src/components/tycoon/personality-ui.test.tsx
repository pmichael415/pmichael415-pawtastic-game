// Personality and anticipation on screen (milestone §5): the desk and the pup's panel remember a returning family's
// last visit, and the panel gives the pup's care tip (the savings line's "why" is in stages-ui.test.tsx).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
import { NAMES, personalityOf } from "@/game/engine";
import { EXPANSION_LEVEL } from "@/tycoon/expansion";
import { xpForLevel } from "@/tycoon/progress";
import { KEY, tycoonStore } from "@/tycoon/store";
import { quickStart } from "@/tycoon/start";
import { fac, newTycoon, withFac } from "@/tycoon/state";
import { ok } from "@/tycoon/testkit";
import { defaultVisit, ownerFor } from "@/tycoon/visit";
import type { TDog, TycoonState } from "@/tycoon/types";

const SKIPPED = { mode: "quick", beat: "meet", startedAt: 0, upgrade: null, done: false, skipped: true } as const;
const fan = NAMES.map((name) => ({ name, breed: 1 })).find((d) => personalityOf(d).favorite === "splash")!;

/** A Quick start daycare on day 3, open, with a bath-time fan back for a second visit at the desk. */
function regularAtDesk(): TycoonState {
  const s = ok(quickStart(newTycoon(0)));
  const f = { ...fac(s), day: 3 };
  const d: TDog = { id: "d0", ...fan, size: "small", temper: "gentle", visits: 2, place: { kind: "lobby" }, checkedIn: false, happiness: 72, clean: 80, boarding: false, played: 0, bathed: false };
  const guestBook = [{ name: d.name, breed: d.breed, size: d.size, temper: d.temper, visits: 1, friendship: 12, lastDay: 2, sat: 85 }];
  return { ...withFac(s, { ...f, open: true, clockMin: 10 * 60, introDay: 0, guestBook, dogs: [{ ...d, visit: { ...defaultVisit(f, d), arrivedDay: f.day, arrived: 9 * 60 + 58, pickup: 16 * 60 } }], stats: { ...f.stats, checkouts: 3 } }), coins: 300, xp: xpForLevel(EXPANSION_LEVEL), pendingLevel: null, tour: SKIPPED };
}

beforeEach(() => {
  localStorage.clear();
  tycoonStore._reset(null);
});

describe("personality and anticipation on screen", () => {
  it("the desk remembers a returning family; the pup's panel says how the last visit went and gives the care tip", () => {
    localStorage.setItem(KEY, JSON.stringify(regularAtDesk()));
    render(<TycoonPlay />);
    const desk = within(screen.getByRole("region", { name: "Front desk" }));
    expect(desk.getByText(/visit #2 · went home delighted yesterday/)).toBeTruthy();
    fireEvent.click(desk.getByRole("button", { name: `Check in ${fan.name}` }));
    const sheet = within(screen.getByTestId("panel-sheet"));
    expect(sheet.getByText(`${ownerFor(fan)} is back with ${fan.name} for visit #2 (New friend) — last time ${fan.name} went home delighted, yesterday.`)).toBeTruthy();
    expect(sheet.getByText(/Loves bath time 🫧 — their family asked for a bath, but you have no bath room yet/)).toBeTruthy();
  });
});
