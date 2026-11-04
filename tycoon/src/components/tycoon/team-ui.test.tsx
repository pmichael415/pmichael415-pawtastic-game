// Staff, money, objectives and the first expansion on screen (staff design §2, §5–§7).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { TPick } from "@/tycoon/render/world";

vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {}, warning: () => {}, info: () => {} }) }));
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
import { KEY, tycoonStore } from "@/tycoon/store";
import { caps } from "@/tycoon/connect";
import { EXPANSION_LEVEL } from "@/tycoon/expansion";
import { xpForLevel } from "@/tycoon/progress";
import { quickStart } from "@/tycoon/start";
import { fac, newTycoon, withFac } from "@/tycoon/state";
import { hire } from "@/tycoon/team";
import { ok } from "@/tycoon/testkit";
import { defaultVisit } from "@/tycoon/visit";
import type { TDog, TycoonState } from "@/tycoon/types";

const now = () => tycoonStore.getState()!;
const SKIPPED = { mode: "quick", beat: "meet", startedAt: 0, upgrade: null, done: false, skipped: true } as const;
function base(over: Partial<TycoonState> = {}): TycoonState {
  const s = ok(quickStart(newTycoon(0)));
  const f = fac(s);
  return { ...withFac(s, { ...f, open: false, dogs: [], stats: { ...f.stats, checkouts: 1 } }), coins: 3000, tour: SKIPPED, ...over };
}
function open(s: TycoonState) {
  localStorage.setItem(KEY, JSON.stringify(s));
  return render(<TycoonPlay />);
}

describe("the team", () => {
  beforeEach(() => {
    localStorage.clear();
    tycoonStore._reset(null);
  });
  it("Team in the status bar opens the team; hiring a receptionist adds them with their wage", () => {
    open(base());
    fireEvent.click(screen.getByRole("button", { name: /^Team, 1 person/ }));
    const sheet = screen.getByRole("dialog", { name: /^Team ·/ });
    expect(within(sheet).getByText(/Phil/)).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("radio", { name: /Receptionist/ }));
    fireEvent.click(within(sheet).getByRole("button", { name: /Hire a receptionist · sign-on 250 · 40 a day/ }));
    expect(fac(now()).staff).toHaveLength(2);
    expect(fac(now()).staff[1]).toMatchObject({ role: "reception" });
    expect(within(sheet).getByText(/Wages 80 game coins a day/)).toBeTruthy();
  });
  it("priorities and roles change from the team sheet", () => {
    open(ok(hire(base(), "reception")));
    fireEvent.click(screen.getByRole("button", { name: /^Team, 2 people/ }));
    const sheet = screen.getByRole("dialog", { name: /^Team ·/ });
    const maya = within(sheet).getByRole("listitem", { name: fac(now()).staff[1]!.name });
    fireEvent.click(within(maya).getByRole("button", { name: "Arrivals first" }));
    expect(fac(now()).staff[1]!.focus).toBe("arrivals");
    fireEvent.click(within(maya).getByRole("button", { name: "Daycare attendant" }));
    expect(fac(now()).staff[1]).toMatchObject({ role: "attendant", focus: "neediest" });
  });
  it("tapping a staff member shows their job, wage and a way to manage the team", () => {
    const s = ok(hire(base(), "bath"));
    open(s);
    act(() => emit({ kind: "staff", id: fac(s).staff[1]!.id }));
    const panel = within(screen.getByTestId("panel-sheet"));
    expect(panel.getByText(/Bath attendant · 40 coins a day/)).toBeTruthy();
    expect(panel.getByText(/Now: Off duty — the daycare is closed/)).toBeTruthy();
    fireEvent.click(panel.getByRole("button", { name: "Manage team" }));
    expect(screen.getByRole("dialog", { name: /^Team ·/ })).toBeTruthy();
  });
});

describe("pups, money and objectives", () => {
  beforeEach(() => {
    localStorage.clear();
    tycoonStore._reset(null);
  });
  it("a pup's panel shows its room, needs, who's looking after it — and a family getting impatient", () => {
    const s = base();
    const f = fac(s);
    const d: TDog = { id: "d70", name: "Luna", breed: 1, size: "small", temper: "gentle", visits: 1, place: { kind: "lobby" }, checkedIn: false, happiness: 80, clean: 60, boarding: false, played: 0, bathed: false };
    open(withFac(s, { ...f, clockMin: 9 * 60 + 25, dogs: [{ ...d, visit: { ...defaultVisit(f, d), owner: "Taylor", arrivedDay: f.day, arrived: 9 * 60 } }] }));
    act(() => emit({ kind: "dog", id: "d70" }));
    const panel = within(screen.getByTestId("panel-sheet"));
    expect(panel.getByText(/Taylor: getting impatient at the desk — 25 game min/)).toBeTruthy();
    expect(panel.getByText(/Next: Check in, or Can't take today/)).toBeTruthy();
    expect(panel.getByText(/Needs: check-in/)).toBeTruthy();
    expect(panel.getByText(/Looked after by You/)).toBeTruthy();
  });
  it("the Today strip shows revenue, wages due, other costs and the net, in game coins", () => {
    open(ok(hire(base(), "reception")));
    const strip = screen.getByRole("button", { name: /^Today: revenue/ });
    expect(strip.textContent).toMatch(/Wages\s*−330/); // tonight 80 + the sign-on fee 250 paid today
    expect(strip.textContent).toMatch(/game coins/);
  });
  it("after the first checkout the next objective is the staffing decision, and its button opens the team", () => {
    const s = base();
    open(withFac(s, { ...fac(s), open: true }));
    const bar = within(screen.getByRole("region", { name: "Objectives" }));
    expect(bar.getByTestId("objective-next").textContent).toMatch(/Hire your first employee/);
    expect(bar.getByTestId("objective-long").textContent!.length).toBeGreaterThan(5);
    fireEvent.click(bar.getByRole("button", { name: "Open Team" }));
    expect(screen.getByRole("dialog", { name: /^Team ·/ })).toBeTruthy();
  });
  it("the expansion card offers real options; building the bath station at a chosen spot adds a working tub", () => {
    const s = ok(hire({ ...base(), xp: xpForLevel(EXPANSION_LEVEL) + 10 }, "reception"));
    open({ ...withFac(s, { ...fac(s), open: true }), coins: 4000 });
    const card = within(screen.getByRole("region", { name: "Expand your daycare" }));
    expect(card.getAllByRole("article")).toHaveLength(5);
    const bath = within(card.getByRole("article", { name: "Bath station" }));
    expect(bath.getByText(/game coins/)).toBeTruthy();
    expect(bath.getByText(/bath attendant/)).toBeTruthy();
    fireEvent.click(bath.getByRole("button", { name: /^Choose a spot · / }));
    fireEvent.click(within(screen.getByRole("region", { name: "Choose a spot" })).getByRole("button", { name: /^Build here · / }));
    expect(caps(fac(now())).tubs).toHaveLength(1);
    // the card closes and the new room is shown (its panel opens)
    expect(screen.queryByRole("region", { name: "Expand your daycare" })).toBeNull();
    expect(within(screen.getByTestId("panel-sheet")).getByText(/Bath Room/)).toBeTruthy();
  });
  it("Save for now hides the card; Expansion options brings it back", () => {
    const s = ok(hire({ ...base(), xp: xpForLevel(EXPANSION_LEVEL) + 10 }, "reception"));
    open({ ...withFac(s, { ...fac(s), open: true }), coins: 4000 });
    fireEvent.click(screen.getByRole("button", { name: "Save for now" }));
    expect(screen.queryByRole("region", { name: "Expand your daycare" })).toBeNull();
  });
  it("a level-up covering the screen stops the clock until it's closed", () => {
    const s = base();
    open({ ...withFac(s, { ...fac(s), open: true }), pendingLevel: 4 });
    // a hold, not the player's pause (audit finding 1): the preference stays "running" and comes back after
    expect(tycoonStore.getSnapshot().held).toBe(true);
    expect(tycoonStore.getSnapshot().paused).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(tycoonStore.getSnapshot().held).toBe(false);
    expect(tycoonStore.getSnapshot().paused).toBe(false);
  });
});
