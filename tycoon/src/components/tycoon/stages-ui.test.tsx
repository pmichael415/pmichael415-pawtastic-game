// Facility stages on screen (combined-loop plan, task 5): reaching a new stage is celebrated once, and the objectives
// always show where you are and what the next stage needs.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { TPick } from "@/tycoon/render/world";

vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {}, warning: () => {}, info: () => {} }) }));
let pick: (p: TPick | null) => void = () => {};
vi.mock("@/components/tycoon/TycoonStage", async () => {
  const React = await import("react");
  return {
    TycoonStage: React.forwardRef(function Stub(props: { onPick: (p: TPick | null) => void }, ref) {
      React.useImperativeHandle(ref, () => ({ fx: () => {}, resetCamera: () => {}, focus: () => {}, debug: () => null }));
      pick = props.onPick;
      return React.createElement("div", { "data-testid": "stage" });
    }),
  };
});

import { TycoonPlay } from "./TycoonPlay";
import { KEY, tycoonStore } from "@/tycoon/store";
import { buyExpansion } from "@/tycoon/expansion";
import { xpForLevel } from "@/tycoon/progress";
import { quickStart } from "@/tycoon/start";
import { fac, newTycoon, withFac } from "@/tycoon/state";
import { hire } from "@/tycoon/team";
import { createArrival } from "@/tycoon/run";
import { ok } from "@/tycoon/testkit";
import type { TycoonState } from "@/tycoon/types";

const SKIPPED = { mode: "quick", beat: "meet", startedAt: 0, upgrade: null, done: false, skipped: true } as const;
function grown(): TycoonState {
  const s = ok(hire(ok(quickStart(newTycoon(0))), "reception"));
  const f = fac(s);
  return { ...withFac(s, { ...f, open: true, dogs: [], stats: { ...f.stats, checkouts: 1 } }), coins: 30000, xp: xpForLevel(9) + 10, tour: SKIPPED, bestProfit: 100 };
}
function open(s: TycoonState) {
  localStorage.setItem(KEY, JSON.stringify(s));
  return render(<TycoonPlay />);
}
const card = () => {
  if (!screen.queryByRole("region", { name: "Expand your daycare" })) fireEvent.click(screen.getByRole("button", { name: /^(Expansion options|See options)$/ }));
  return within(screen.getByRole("region", { name: "Expand your daycare" }));
};
const closeLevelUp = () => {
  const lv = screen.queryByRole("dialog", { name: /^Level / });
  if (lv) fireEvent.click(within(lv).getByRole("button", { name: /Continue/ }));
};

beforeEach(() => {
  localStorage.clear();
  tycoonStore._reset(null);
});

describe("reaching a new stage", () => {
  it("is celebrated: a dialog names the stage, what it means and what the next one needs; the clock waits; Continue closes it", () => {
    open(grown());
    fireEvent.click(within(card().getByRole("article", { name: "Play yard" })).getByRole("button", { name: /^Choose a spot · / }));
    fireEvent.click(within(screen.getByRole("region", { name: "Choose a spot" })).getByRole("button", { name: /^Build here · / }));
    closeLevelUp();
    const d = screen.getByRole("dialog", { name: /Growing daycare/ });
    expect(within(d).getByText(/grown past the starter layout/)).toBeTruthy();
    expect(within(d).getByText(/Full-service daycare/)).toBeTruthy();
    expect(within(d).getByText(/a bath station/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resume" })).toBeTruthy(); // the clock waits while it's open
    fireEvent.click(within(d).getByRole("button", { name: "Continue" }));
    expect(screen.queryByRole("dialog", { name: /Growing daycare/ })).toBeNull();
  });
  it("a daycare that already reached a stage isn't celebrated again when you come back", () => {
    open(ok(buyExpansion(ok(buyExpansion(grown(), "bath")), "boarding")));
    closeLevelUp();
    expect(screen.queryByRole("dialog", { name: /Full-service daycare/ })).toBeNull();
  });
});

describe("the objectives show the stage", () => {
  it("where you are, and the next stage with what it still needs", () => {
    open(ok(buyExpansion(grown(), "bath")));
    closeLevelUp();
    const bar = within(screen.getByRole("region", { name: "Objectives" }));
    expect(bar.getByTestId("facility-stage").textContent).toMatch(/Growing daycare · stage 2 of 4/);
    expect(bar.getByTestId("objective-long").textContent).toMatch(/Full-service/);
  });
});

describe("after the new room opens (empire milestone §6: place → furnish → staff → serve)", () => {
  it("its panel says what it does and who runs it; one tap hires for it, and Furnish leads into furnishing that room", () => {
    open(grown());
    fireEvent.click(within(card().getByRole("article", { name: "Bath station" })).getByRole("button", { name: /^Choose a spot · / }));
    fireEvent.click(within(screen.getByRole("region", { name: "Choose a spot" })).getByRole("button", { name: /^Build here · / }));
    closeLevelUp();
    const stage = screen.queryByRole("dialog", { name: /daycare/ });
    if (stage) fireEvent.click(within(stage).getByRole("button", { name: "Continue" }));
    const panel = () => within(screen.getByRole("region", { name: /^Edit Bath Room/ }));
    expect(panel().getByText(/families who book a bath or an exit bath get one here/)).toBeTruthy();
    expect(panel().getByText(/No one runs baths yet/)).toBeTruthy();
    const team = fac(tycoonStore.getState()!).staff.length;
    fireEvent.click(panel().getByRole("button", { name: /^Hire a bath attendant · / }));
    expect(fac(tycoonStore.getState()!).staff).toHaveLength(team + 1);
    expect(fac(tycoonStore.getState()!).staff.at(-1)!.role).toBe("bath");
    expect(panel().getByText(/runs the baths/)).toBeTruthy();
    fireEvent.click(panel().getByRole("button", { name: "Furnish it" }));
    expect(screen.getByText("Furnishing: Bath Room")).toBeTruthy();
  });
});

describe("opening the options with a pup's panel open (found in the play session)", () => {
  it("the pup's panel closes, so it can't cover the options", () => {
    const s = grown();
    const withPup = ok(createArrival(withFac(s, { ...fac(s), clockMin: 9 * 60 }), () => 0.1));
    const pup = fac(withPup).dogs.at(-1)!;
    open(withPup);
    closeLevelUp();
    act(() => pick({ kind: "dog", id: pup.id }));
    expect(screen.queryByTestId("panel-sheet")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("region", { name: "Objectives" })).getByRole("button", { name: /^(Expansion options|See options)$/ }));
    expect(screen.queryByTestId("panel-sheet")).toBeNull();
    expect(screen.getByRole("region", { name: "Expand your daycare" })).toBeTruthy();
  });
});

describe("saving toward the next expansion", () => {
  it("the objectives always show what you're saving for, its price and how close you are", () => {
    open({ ...grown(), coins: 200 });
    closeLevelUp();
    const bar = within(screen.getByRole("region", { name: "Objectives" }));
    const coins = tycoonStore.getState()!.coins.toLocaleString("en-US");
    expect(bar.getByTestId("saving-for").textContent).toMatch(new RegExp(`Saving for .+ · ${coins} of [\\d,]+ coins`));
    expect(bar.getByRole("progressbar", { name: /^Saving for/ })).toBeTruthy();
  });
});
