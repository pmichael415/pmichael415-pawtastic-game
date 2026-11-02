// Stage A final review fixes (screen): nothing paid or distracting before or during the tour, the building steps stay
// visible while building, no dead end at the upgrade, no empty panel after a pup leaves, map markers easy to tap.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { TPick } from "@/tycoon/render/world";

vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { success: () => {}, error: () => {}, warning: () => {}, info: () => {} }),
}));
let emit: (p: TPick | null) => void = () => {};
vi.mock("@/components/tycoon/TycoonStage", async () => {
  const React = await import("react");
  return {
    TycoonStage: React.forwardRef(function Stub(props: { onPick: (p: TPick | null) => void }, ref) {
      React.useImperativeHandle(ref, () => ({ fx: () => {}, resetCamera: () => {}, debug: () => null }));
      emit = props.onPick;
      return React.createElement("div", { "data-testid": "stage" });
    }),
  };
});

import { TycoonPlay } from "./TycoonPlay";
import { TycoonMap } from "./TycoonMap";
import { KEY, tycoonStore } from "@/tycoon/store";
import { fac, newTycoon } from "@/tycoon/state";
import { startTour } from "@/tycoon/tour";
import type { TycoonState } from "@/tycoon/types";

const now = () => tycoonStore.getState()!;
const coach = () => screen.getByRole("region", { name: "Guide" });
const inSheet = (name: string | RegExp) => within(screen.getByTestId("panel-sheet")).getByRole("button", { name });
const dogId = (name: string) => fac(now()).dogs.find((d) => d.name === name)!.id;
function open(s: TycoonState) {
  localStorage.setItem(KEY, JSON.stringify(s));
  return render(<TycoonPlay />);
}

describe("before a start is picked", () => {
  beforeEach(() => {
    localStorage.clear();
    tycoonStore._reset(null);
  });
  it("only the start card: no old checklist, no shop or coin buttons, no Build", () => {
    open(newTycoon(Date.now()));
    expect(screen.getByRole("region", { name: "Start your daycare" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Getting started" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Daycare Shop" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Get coins" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Build" })).toBeNull();
  });
});

describe("building from scratch in 3D", () => {
  beforeEach(() => {
    localStorage.clear();
    tycoonStore._reset(null);
  });
  it("the building step stays on screen in build mode, and the catalog offers nothing paid", () => {
    open(newTycoon(Date.now()));
    fireEvent.click(screen.getByRole("button", { name: /Build from scratch/ }));
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    expect(screen.getByText(/Step 1 of 3/)).toBeTruthy();
    fireEvent.click(within(screen.getByRole("toolbar", { name: "Build tools" })).getByRole("button", { name: "Furniture" }));
    expect(screen.queryByRole("button", { name: /^Get it/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Get it in the Shop/ })).toBeNull();
  });
});

describe("the tour never dead-ends or leaves clutter", () => {
  beforeEach(() => {
    localStorage.clear();
    tycoonStore._reset(null);
  });
  function toUpgrade() {
    open(newTycoon(Date.now()));
    fireEvent.click(screen.getByRole("button", { name: /Quick start/ }));
    act(() => emit({ kind: "dog", id: dogId("Biscuit") }));
    fireEvent.click(inSheet(/Check in/));
    fireEvent.click(inSheet(/^To Small & Gentle/));
    fireEvent.click(inSheet(/^Playtime/));
    fireEvent.click(inSheet(/^Check out/));
  }
  it("the panel closes when its pup goes home", () => {
    toUpgrade();
    expect(screen.queryByTestId("panel-sheet")).toBeNull();
  });
  it("short of coins at the upgrade, 'Not now' carries on to the next beat, free", () => {
    toUpgrade();
    act(() => tycoonStore.set((s) => ({ ...s, coins: 50 })));
    const notNow = within(coach()).getByRole("button", { name: /Not now/ });
    fireEvent.click(notNow);
    expect(now().tour?.beat).toBe("decision");
    expect(now().coins).toBe(50);
  });
  it("with enough coins there's no 'Not now' (one clear choice)", () => {
    toUpgrade();
    expect(within(coach()).queryByRole("button", { name: /Not now/ })).toBeNull();
  });
});

describe("the map's pup markers", () => {
  it("each has an invisible hit area at least 0.9 squares around it", () => {
    const s = startTour(newTycoon(0), "quick", 0);
    render(<TycoonMap state={s} selected={null} onPick={() => {}} />);
    const marker = screen.getByRole("button", { name: "Biscuit, waiting to check in" });
    const hit = marker.querySelector('circle[data-hit="1"]');
    expect(Number(hit?.getAttribute("r"))).toBeGreaterThanOrEqual(0.9);
    expect(hit?.getAttribute("fill")).toBe("transparent");
  });
});
