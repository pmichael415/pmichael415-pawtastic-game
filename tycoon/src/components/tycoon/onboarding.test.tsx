// The first 15 minutes on screen (Stage A, spec §3.1–3.6): the start card, the coach on the map, purchase prompts
// held back during the tour, the decision, the goals afterwards, and the map + explanation when 3D can't load.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { TPick } from "@/tycoon/render/world";

vi.mock("sonner", () => ({
  toast: Object.assign(() => {}, { success: () => {}, error: () => {}, warning: () => {}, info: () => {} }),
}));
let emit: (p: TPick | null) => void = () => {};
let unavailable: ((reason: "no-webgl" | "renderer-error") => void) | undefined;
vi.mock("@/components/tycoon/TycoonStage", async () => {
  const React = await import("react");
  return {
    TycoonStage: React.forwardRef(function Stub(props: { onPick: (p: TPick | null) => void; onUnavailable?: (r: "no-webgl" | "renderer-error") => void }, ref) {
      React.useImperativeHandle(ref, () => ({ fx: () => {}, resetCamera: () => {}, debug: () => null }));
      emit = props.onPick;
      unavailable = props.onUnavailable;
      return React.createElement("div", { "data-testid": "stage" });
    }),
  };
});

import { TycoonPlay } from "./TycoonPlay";
import { KEY, tycoonStore } from "@/tycoon/store";
import { fac, newTycoon } from "@/tycoon/state";
import { guidedBuild } from "@/tycoon/testkit";
import type { TycoonState } from "@/tycoon/types";

const now = () => tycoonStore.getState()!;
const coach = () => screen.getByRole("region", { name: "Guide" });
function open(s: TycoonState) {
  localStorage.setItem(KEY, JSON.stringify(s));
  return render(<TycoonPlay />);
}
const dogId = (name: string) => fac(now()).dogs.find((d) => d.name === name)!.id;
/** A button in the dog/room panel that opens over the map. */
const inSheet = (name: string | RegExp) => within(screen.getByTestId("panel-sheet")).getByRole("button", { name });

describe("starting a new daycare", () => {
  beforeEach(() => {
    localStorage.clear();
    tycoonStore._reset(null);
  });
  it("a brand-new save offers Quick start or Build from scratch", () => {
    open(newTycoon(Date.now()));
    const card = screen.getByRole("region", { name: "Start your daycare" });
    expect(within(card).getByRole("button", { name: /Quick start/ })).toBeTruthy();
    expect(within(card).getByRole("button", { name: /Build from scratch/ })).toBeTruthy();
  });
  it("Quick start builds the daycare, Biscuit arrives, and the coach says what to do — no shop prompts yet", () => {
    open(newTycoon(Date.now()));
    fireEvent.click(screen.getByRole("button", { name: /Quick start/ }));
    expect(screen.queryByRole("region", { name: "Start your daycare" })).toBeNull();
    expect(within(coach()).getByText("Meet Biscuit!")).toBeTruthy();
    expect(within(coach()).getByText(/Tap Biscuit in the daycare, then Check in/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Daycare Shop" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Get coins" })).toBeNull();
    expect(fac(now()).dogs.map((d) => d.name)).toEqual(["Biscuit"]);
  });
  it("the coach sits above the daycare view (never over it) and is scrolled into view; Build waits for the tour", () => {
    const scrolled: Element[] = [];
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    try {
      open(newTycoon(Date.now()));
      fireEvent.click(screen.getByRole("button", { name: /Quick start/ }));
      const stage = screen.getByTestId("stage");
      expect(coach().compareDocumentPosition(stage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(stage.parentElement?.contains(coach())).toBe(false);
      expect(scrolled).toContain(coach());
      expect(coach().style.scrollMarginTop).toMatch(/px$/); // lands just below the sticky status bar
      expect(screen.queryByRole("button", { name: "Build" })).toBeNull();
    } finally {
      Element.prototype.scrollIntoView = orig;
    }
  });
  it("building from scratch keeps the Build button for the building steps", () => {
    open(newTycoon(Date.now()));
    fireEvent.click(screen.getByRole("button", { name: /Build from scratch/ }));
    expect(screen.getByRole("button", { name: "Build" })).toBeTruthy();
  });
  it("Quick start's level-up waits: nothing covers Biscuit in the first minute", () => {
    open(newTycoon(Date.now()));
    fireEvent.click(screen.getByRole("button", { name: /Quick start/ }));
    expect(now().pendingLevel).toBeTruthy(); // the level and its coins are already earned…
    expect(screen.queryByRole("dialog", { name: /Level \d+!/ })).toBeNull(); // …the celebration waits for the tour
  });
  it("a save from before the tour (rooms built) gets no start card and keeps its shop", () => {
    open(guidedBuild(newTycoon(Date.now())));
    expect(screen.queryByRole("region", { name: "Start your daycare" })).toBeNull();
    expect(screen.getByRole("button", { name: "Daycare Shop" })).toBeTruthy();
    expect(screen.getByRole("dialog", { name: /Level \d+!/ })).toBeTruthy(); // the held level-up shows now
  });
});

describe("the tour's choices", () => {
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
  it("the upgrade shows both choices with price and exact benefit, and places the one picked", () => {
    toUpgrade();
    expect(now().tour?.beat).toBe("upgrade");
    const bin = within(coach()).getByRole("button", { name: /Toy Bin · 80 coins/ });
    expect(bin.textContent).toMatch(/\+6 happiness at every playtime/);
    expect(within(coach()).getByRole("button", { name: /Play Yard · 200 coins/ }).textContent).toMatch(/\+4 happiness at every playtime/);
    fireEvent.click(bin);
    expect(fac(now()).items.some((i) => i.kind === "toy_bin")).toBe(true);
    expect(now().tour?.beat).toBe("benefit");
  });
  it("the decision: after building Rocket's room, the coach says to take him there", () => {
    toUpgrade();
    fireEvent.click(within(coach()).getByRole("button", { name: /Toy Bin · 80 coins/ }));
    act(() => emit({ kind: "dog", id: dogId("Daisy") }));
    fireEvent.click(inSheet(/Check in/));
    fireEvent.click(inSheet(/^To Small & Gentle/));
    fireEvent.click(inSheet(/^Playtime/));
    fireEvent.click(inSheet(/^Check out/));
    fireEvent.click(within(coach()).getByRole("button", { name: /Build a Large & Active playroom/ }));
    expect(within(coach()).getByText("Rocket's room is ready")).toBeTruthy();
    expect(within(coach()).queryByRole("button", { name: /Build a Large & Active playroom/ })).toBeNull();
    act(() => emit({ kind: "dog", id: dogId("Rocket") }));
    fireEvent.click(inSheet(/Check in/));
    fireEvent.click(inSheet(/^To Large & Active/));
    expect(now().tour?.done).toBe(true);
  });
  it("the decision: letting Rocket rest sends him home free, then the goals show", () => {
    toUpgrade();
    fireEvent.click(within(coach()).getByRole("button", { name: /Toy Bin · 80 coins/ }));
    act(() => emit({ kind: "dog", id: dogId("Daisy") }));
    fireEvent.click(inSheet(/Check in/));
    fireEvent.click(inSheet(/^To Small & Gentle/));
    fireEvent.click(inSheet(/^Playtime/));
    fireEvent.click(inSheet(/^Check out/));
    expect(now().tour?.beat).toBe("decision");
    expect(within(coach()).getByRole("button", { name: /Build a Large & Active playroom · \d+ coins/ })).toBeTruthy();
    const coins = now().coins;
    fireEvent.click(within(coach()).getByRole("button", { name: /Let Rocket rest/ }));
    expect(fac(now()).dogs.some((d) => d.name === "Rocket")).toBe(false);
    expect(now().tour?.done).toBe(true);
    expect(now().coins).toBeGreaterThanOrEqual(coins); // nothing charged; the guide reward is paid
    expect(screen.getByRole("region", { name: "Next goals" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Daycare Shop" })).toBeTruthy();
    expect(screen.getByRole("dialog", { name: /Level \d+!/ })).toBeTruthy(); // the held level-up shows now
  });
});

describe("when 3D can't load", () => {
  beforeEach(() => {
    localStorage.clear();
    tycoonStore._reset(null);
  });
  it("explains why, shows the 2D map, and the coach talks about the map", () => {
    open(newTycoon(Date.now()));
    act(() => unavailable?.("no-webgl"));
    expect(screen.getByText(/3D isn't available in this browser/)).toBeTruthy();
    expect(screen.getByRole("region", { name: "Daycare map" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Quick start/ }));
    expect(within(coach()).getByText(/Tap Biscuit on the map/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Biscuit, waiting to check in" }));
    expect(inSheet(/Check in/)).toBeTruthy();
  });
});
