// Audit gaps E and G for the guide: its "Build a playroom" button confirms the playroom it shows, once — two taps
// queued before the screen updates build one playroom, charged the price on the button.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
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
import { KEY, tycoonStore } from "@/tycoon/store";
import { placeFirstFree } from "@/tycoon/build";
import { assignRoom, checkIn, checkout, playtime } from "@/tycoon/run";
import { fac, newTycoon } from "@/tycoon/state";
import { ok } from "@/tycoon/testkit";
import { chooseUpgrade, startTour, syncTour } from "@/tycoon/tour";
import type { TResult, TycoonState } from "@/tycoon/types";

const step = (s: TycoonState, fn: (s: TycoonState) => TResult) => syncTour(ok(fn(s)), 0).state;
/** A real new game brought to the guide's decision: Biscuit and Daisy cared for, the toy bin bought, Rocket waiting. */
function atDecision(): TycoonState {
  let s = startTour({ ...newTycoon(0), coins: 5000 }, "quick", 0);
  for (const name of ["Biscuit", "Daisy"]) {
    const id = () => fac(s).dogs.find((d) => d.name === name)!.id;
    const room = () => fac(s).rooms.find((r) => r.type === "playroom")!.uid;
    s = step(s, (x) => checkIn(x, id()));
    s = step(s, (x) => assignRoom(x, id(), room()));
    s = step(s, (x) => playtime(x, id()));
    s = step(s, (x) => checkout(x, id(), false));
    if (name === "Biscuit") s = step(chooseUpgrade(s, "toy_bin"), (x) => placeFirstFree(x, "toy_bin"));
  }
  expect(s.tour?.beat).toBe("decision");
  return { ...s, pendingLevel: null };
}

beforeEach(() => {
  localStorage.clear();
  tycoonStore._reset(null);
});

describe("the guide's Build a playroom (audit gaps E and G)", () => {
  it("two taps queued before the screen updates build one playroom, charged the price on the button", () => {
    localStorage.setItem(KEY, JSON.stringify(atDecision()));
    render(<TycoonPlay />);
    const btn = screen.getByRole("button", { name: /^Build a Large & Active playroom · \d+ coins$/ });
    const price = Number(/· (\d+) coins/.exec(btn.textContent ?? "")![1]);
    const s0 = tycoonStore.getState()!;
    const rooms = fac(s0).rooms.length;
    const spent0 = fac(s0).ledger.at(-1)!.expenses.building;
    act(() => {
      btn.click();
      btn.click();
    });
    const s1 = tycoonStore.getState()!;
    expect(fac(s1).rooms).toHaveLength(rooms + 1);
    expect(fac(s1).ledger.at(-1)!.expenses.building - spent0).toBe(price);
  });
});
