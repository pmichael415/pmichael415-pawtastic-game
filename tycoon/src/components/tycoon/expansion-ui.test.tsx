// Ways to grow on screen (combined-loop plan, task 4): the card groups five options and says why you'd want each; a
// new room is placed by choosing one of the offered spots, previewed in the 3D view before you pay.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { Ghost, TPick } from "@/tycoon/render/world";

vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {}, warning: () => {}, info: () => {} }) }));
let ghost: Ghost | null = null;
const focused: { c: number; r: number }[] = [];
vi.mock("@/components/tycoon/TycoonStage", async () => {
  const React = await import("react");
  return {
    TycoonStage: React.forwardRef(function Stub(props: { onPick: (p: TPick | null) => void; ghost: Ghost | null }, ref) {
      React.useImperativeHandle(ref, () => ({ fx: () => {}, resetCamera: () => {}, focus: (c: number, r: number) => focused.push({ c, r }), debug: () => null }));
      ghost = props.ghost;
      return React.createElement("div", { "data-testid": "stage" });
    }),
  };
});

import { TycoonPlay } from "./TycoonPlay";
import { KEY, tycoonStore } from "@/tycoon/store";
import { caps } from "@/tycoon/connect";
import { buyExpansion, expansionSpots } from "@/tycoon/expansion";
import { xpForLevel } from "@/tycoon/progress";
import { quickStart } from "@/tycoon/start";
import { fac, newTycoon, withFac } from "@/tycoon/state";
import { hire } from "@/tycoon/team";
import { ok } from "@/tycoon/testkit";
import type { TycoonState } from "@/tycoon/types";

const now = () => tycoonStore.getState()!;
const SKIPPED = { mode: "quick", beat: "meet", startedAt: 0, upgrade: null, done: false, skipped: true } as const;
function grown(lvl = 6): TycoonState {
  const s = ok(hire(ok(quickStart(newTycoon(0))), "reception"));
  const f = fac(s);
  return { ...withFac(s, { ...f, open: true, dogs: [], stats: { ...f.stats, checkouts: 1 } }), coins: 20000, xp: xpForLevel(lvl), tour: SKIPPED };
}
function open(s: TycoonState) {
  localStorage.setItem(KEY, JSON.stringify(s));
  return render(<TycoonPlay />);
}
const card = () => within(screen.getByRole("region", { name: "Expand your daycare" }));
/** Opens the card (it's already open when expanding is the next objective). */
const openCard = () => {
  if (!screen.queryByRole("region", { name: "Expand your daycare" })) fireEvent.click(screen.getByRole("button", { name: "Expansion options" }));
};

beforeEach(() => {
  localStorage.clear();
  tycoonStore._reset(null);
  ghost = null;
  focused.length = 0;
});

describe("the ways-to-grow card", () => {
  it("five options in four groups, each saying why you'd want it", () => {
    open(grown());
    openCard();
    expect(card().getAllByRole("article")).toHaveLength(5);
    for (const g of ["More families", "New services", "Comfort", "Your team"]) expect(card().getByRole("heading", { name: g })).toBeTruthy();
    for (const t of ["Bath station", "Boarding wing", "Play yard", "Staff room"]) expect(card().getByRole("article", { name: t })).toBeTruthy();
    expect(within(card().getByRole("article", { name: "Play yard" })).getByText(/Good if/)).toBeTruthy();
  });
});

describe("choosing where a new room goes", () => {
  it("Choose a spot shows the first spot in the 3D view; Next moves to another; Build here builds there for the price shown", () => {
    open(grown());
    openCard();
    const spots = expansionSpots(now(), "boarding");
    fireEvent.click(within(card().getByRole("article", { name: "Boarding wing" })).getByRole("button", { name: /^Choose a spot · / }));
    const bar = within(screen.getByRole("region", { name: "Choose a spot" }));
    expect(bar.getByText(new RegExp(`Spot 1 of ${spots.length}`))).toBeTruthy();
    expect(ghost).toMatchObject({ kind: "room", c: spots[0]!.c, r: spots[0]!.r, w: spots[0]!.w, d: spots[0]!.d, ok: true });
    expect(focused.at(-1)).toEqual({ c: spots[0]!.c + Math.floor(spots[0]!.w / 2), r: spots[0]!.r + Math.floor(spots[0]!.d / 2) });
    fireEvent.click(bar.getByRole("button", { name: "Next spot" }));
    expect(bar.getByText(new RegExp(`Spot 2 of ${spots.length}`))).toBeTruthy();
    expect(bar.getByText(new RegExp(spots[1]!.near))).toBeTruthy();
    expect(ghost).toMatchObject({ c: spots[1]!.c, r: spots[1]!.r });
    // the price is read off the button the player taps, and that is exactly what building costs
    const build = bar.getByRole("button", { name: /^Build here · [\d,]+/ });
    const shown = Number(/Build here · ([\d,]+)/.exec(build.textContent ?? "")![1]!.replace(/,/g, ""));
    const building = () => fac(now()).ledger.find((l) => l.day === fac(now()).day)?.expenses.building ?? 0;
    const spentBefore = building();
    fireEvent.click(build);
    const room = fac(now()).rooms.find((r) => r.type === "boarding")!;
    expect({ c: room.c, r: room.r }).toEqual({ c: spots[1]!.c, r: spots[1]!.r });
    expect(caps(fac(now())).beds.length).toBe(3);
    expect(building() - spentBefore).toBe(shown); // (coins alone could include a level-up reward, so the books are read)
    expect(screen.queryByRole("region", { name: "Choose a spot" })).toBeNull();
    expect(within(screen.getByTestId("panel-sheet")).getByText(/Boarding Room/)).toBeTruthy();
  });
  it("Cancel leaves everything as it was and clears the preview", () => {
    open(grown());
    openCard();
    const rooms = fac(now()).rooms.length;
    fireEvent.click(within(card().getByRole("article", { name: "Play yard" })).getByRole("button", { name: /^Choose a spot · / }));
    expect(ghost).not.toBeNull();
    fireEvent.click(within(screen.getByRole("region", { name: "Choose a spot" })).getByRole("button", { name: "Cancel" }));
    expect(ghost).toBeNull();
    expect(fac(now()).rooms.length).toBe(rooms);
    expect(fac(now()).items.some((i) => i.kind === "play_yard")).toBe(false);
  });
  it("an improvement needs no spot: Improve buys it at once", () => {
    let s = grown();
    s = ok(buyExpansion(s, "bath"));
    open(s);
    openCard();
    const tubs = caps(fac(now())).tubs.length;
    act(() => fireEvent.click(within(card().getByRole("article", { name: "Second bath station" })).getByRole("button", { name: /^Improve · / })));
    expect(caps(fac(now())).tubs.length).toBe(tubs + 1);
  });
});

describe("the spot bar confirms the purchase it shows (audit gaps E and G)", () => {
  /** A family with a pup of this kind waiting at the desk (a real arrival, then its size and temper set). */
  const waitingNow = (size: "small" | "large", temper: "gentle" | "active") =>
    act(() => {
      tycoonStore.set((t) => {
        const f = fac(t);
        const d = { id: "w" + size + temper, name: "Waiting", breed: 1, size, temper, visits: 1, place: { kind: "lobby" as const }, checkedIn: false, happiness: 70, clean: 70, boarding: false, played: 0, bathed: false };
        return withFac(t, { ...f, clockMin: 9 * 60, dogs: [d] });
      });
    });
  it("the bar says exactly what it builds; a stale confirmation (the waiting family changed) builds nothing; queued taps build once", () => {
    open(grown());
    waitingNow("large", "gentle");
    openCard();
    fireEvent.click(within(card().getByRole("article", { name: /^Playroom wing/ })).getByRole("button", { name: /^Choose a spot · / }));
    const bar = within(screen.getByRole("region", { name: "Choose a spot" }));
    expect(bar.getByText(/^Builds a 3 × 3 playroom for Large & Gentle pups with its door and 3 Dog Beds — [\d,]+ game coins in all\.$/)).toBeTruthy();
    const build = bar.getByRole("button", { name: /^Build here · / });
    const rooms = fac(now()).rooms.length;
    // stale: in one batch the waiting family changes, then the old button's tap arrives
    act(() => {
      tycoonStore.set((t) => withFac(t, { ...fac(t), dogs: fac(t).dogs.map((d) => ({ ...d, size: "small" as const, temper: "active" as const })) }));
      build.click();
    });
    expect(fac(now()).rooms).toHaveLength(rooms);
    // the bar now shows the playroom it would build for the family waiting now, and its button confirms that — once
    const bar2 = within(screen.getByRole("region", { name: "Choose a spot" }));
    expect(bar2.getAllByText(/for Small & Active pups/).length).toBeGreaterThan(0);
    const fresh = bar2.getByRole("button", { name: /^Build here · / });
    act(() => {
      fresh.click();
      fresh.click();
    });
    expect(fac(now()).rooms).toHaveLength(rooms + 1);
    expect(fac(now()).rooms.at(-1)).toMatchObject({ type: "playroom", group: "small-active" });
  });
});
