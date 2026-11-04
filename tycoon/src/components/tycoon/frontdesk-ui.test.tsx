// The old game's flow on the world screen (empire milestone §1, §3): families at the front desk with Check in / Check
// out at hand, rooms with their occupancy and a ✓ where a waiting pup can safely go, and one big next-action button.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { TPick } from "@/tycoon/render/world";

vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {}, warning: () => {}, info: () => {} }) }));
let emit: (p: TPick | null) => void = () => {};
const focused: { c: number; r: number }[] = [];
const effects: string[] = [];
vi.mock("@/components/tycoon/TycoonStage", async () => {
  const React = await import("react");
  return {
    TycoonStage: React.forwardRef(function Stub(props: { onPick: (p: TPick | null) => void }, ref) {
      React.useImperativeHandle(ref, () => ({ fx: (kind: string) => effects.push(kind), resetCamera: () => {}, focus: (c: number, r: number) => focused.push({ c, r }), debug: () => null }));
      emit = props.onPick;
      return React.createElement("div", { "data-testid": "stage" });
    }),
  };
});

import { TycoonPlay } from "./TycoonPlay";
import { setSettings } from "@/lib/settings";
import { KEY, tycoonStore } from "@/tycoon/store";
import { quickStart } from "@/tycoon/start";
import { fac, newTycoon, withFac } from "@/tycoon/state";
import { ok } from "@/tycoon/testkit";
import { checkout } from "@/tycoon/run";
import { defaultVisit } from "@/tycoon/visit";
import type { TDog, TycoonState, Visit } from "@/tycoon/types";

const now = () => tycoonStore.getState()!;
const SKIPPED = { mode: "quick", beat: "meet", startedAt: 0, upgrade: null, done: false, skipped: true } as const;
function withPups(...pups: { over?: Partial<TDog>; visit?: Partial<Visit> }[]): TycoonState {
  const s = ok(quickStart(newTycoon(0)));
  const f = fac(s);
  const dogs = pups.map(({ over = {}, visit = {} }, i) => {
    const d: TDog = { id: "d" + i, name: ["Hazel", "Biscuit", "Luna"][i] ?? "Pup" + i, breed: 1, size: "small", temper: "gentle", visits: 1, place: { kind: "lobby" }, checkedIn: false, happiness: 80, clean: 70, boarding: false, played: 0, bathed: false, ...over };
    return { ...d, visit: { ...defaultVisit(f, d), arrivedDay: f.day, arrived: 9 * 60 + 55, owner: ["Taylor", "Morgan", "Lee"][i]!, ...visit } };
  });
  return { ...withFac(s, { ...f, open: true, clockMin: 10 * 60, introDay: 0, dogs, stats: { ...f.stats, checkouts: 1 } }), coins: 3000, pendingLevel: null, tour: SKIPPED };
}
function open(s: TycoonState) {
  localStorage.setItem(KEY, JSON.stringify(s));
  return render(<TycoonPlay />);
}
const desk = () => within(screen.getByRole("region", { name: "Front desk" }));
const panel = () => within(screen.getByTestId("panel-sheet"));

beforeEach(() => {
  localStorage.clear();
  tycoonStore._reset(null);
  focused.length = 0;
});

describe("the front desk", () => {
  it("shows who just arrived and what they booked, with Check in at hand; checking in opens the pup with its next step", () => {
    open(withPups({ visit: { requests: ["daycare", "bath"] } }));
    expect(desk().getByText(/🐕 Hazel/)).toBeTruthy();
    expect(desk().getByText(/daycare \+ bath/)).toBeTruthy();
    fireEvent.click(desk().getByRole("button", { name: "Check in Hazel" }));
    expect(fac(now()).dogs[0]!.checkedIn).toBe(true);
    expect(panel().getByTestId("next-action").textContent).toMatch(/To Small & Gentle/);
  });
  it("a family back for pickup shows Check out, which pays exactly once", () => {
    const s = withPups({ over: { checkedIn: true, played: 2, happiness: 95, place: { kind: "room", room: "" } }, visit: { ownerHere: 9 * 60 + 58 } });
    const f = fac(s);
    const room = f.rooms.find((r) => r.type === "playroom")!.uid;
    const s2 = withFac(s, { ...f, dogs: f.dogs.map((d) => ({ ...d, place: { kind: "room" as const, room } })) });
    open(s2);
    const coins = now().coins;
    const bonusBefore = fac(now()).ledger.at(-1)?.income.bonus ?? 0;
    fireEvent.click(desk().getByRole("button", { name: "Check out Hazel" }));
    fireEvent.click(desk().queryByRole("button", { name: "Check out Hazel" }) ?? document.body);
    expect(fac(now()).dogs).toHaveLength(0);
    expect(fac(now()).outcomes.at(-1)!.dog).toBe("Hazel");
    // the bill once (plus any trophy or level reward the visit earned, which the ledger counts as a bonus)
    const bonus = (fac(now()).ledger.at(-1)?.income.bonus ?? 0) - bonusBefore;
    expect(now().coins - coins).toBe(fac(now()).outcomes.at(-1)!.total + bonus);
    expect(fac(now()).outcomes.filter((o) => o.dog === "Hazel")).toHaveLength(1);
  });
  it("says so when nobody's waiting", () => {
    open(withPups());
    act(() => tycoonStore.set((x) => withFac(x, { ...fac(x), dogs: [] })));
    expect(desk().getByText(/No one at the desk/)).toBeTruthy();
  });
});

describe("payment feedback when staff check a family out", () => {
  it("coins fly and the receipt shows, as when you do it yourself", () => {
    const s = withPups({ over: { checkedIn: true }, visit: { ownerHere: 10 * 60 } });
    const f = fac(s);
    const play = f.rooms.find((r) => r.type === "playroom")!;
    const pup = f.dogs[0]!;
    open(withFac(s, { ...f, dogs: [{ ...pup, place: { kind: "room", room: play.uid }, played: 1, happiness: 90 }] }));
    effects.length = 0;
    // a staff checkout happens in the engine (a tick), not through a tap
    act(() => {
      tycoonStore.dispatch((t) => ({ ok: true, state: ok(checkout(t, pup.id, false)) }));
    });
    expect(effects).toContain("coins");
    expect(screen.getByRole("region", { name: "Receipt" })).toBeTruthy();
  });
});

describe("pups waiting inside for a spot", () => {
  it("are listed at the desk too, so they're never lost behind a closed panel", () => {
    const s = withPups({ over: { checkedIn: true, size: "large", temper: "active" } });
    open(s);
    const pup = fac(s).dogs[0]!;
    expect(desk().getByRole("button", { name: new RegExp(`${pup.name}.*waiting for a spot`) })).toBeTruthy();
  });
});

describe("in the list view", () => {
  it("there's one front desk (the list's own), not a second one on top", () => {
    setSettings({ view: "list" });
    try {
      open(withPups({}));
      expect(screen.queryByTestId("stage")).toBeNull();
      expect(screen.getAllByRole("region", { name: "Front desk" })).toHaveLength(1);
    } finally {
      setSettings({ view: "overhead" });
    }
  });
});

describe("rooms at a glance", () => {
  it("each room shows how full it is; with a checked-in pup selected, its safe room shows ✓ and one tap moves the pup there", () => {
    open(withPups({ over: { checkedIn: true } }));
    const strip = within(screen.getByRole("region", { name: "Rooms" }));
    const play = strip.getByRole("button", { name: /Playroom.*Small & Gentle.*0\/3/ });
    expect(play).toBeTruthy();
    act(() => emit({ kind: "dog", id: "d0" }));
    const target = within(screen.getByRole("region", { name: "Rooms" })).getByRole("button", { name: /✓ Move Hazel to Playroom.*Small & Gentle/ });
    fireEvent.click(target);
    expect(fac(now()).dogs[0]!.place.kind).toBe("room");
  });
});

describe("a pup's panel", () => {
  it("leads with one big next-action button, not repeated below", () => {
    open(withPups({ over: { checkedIn: true } }));
    act(() => emit({ kind: "dog", id: "d0" }));
    const primary = panel().getByTestId("next-action");
    expect(primary.textContent).toMatch(/To Small & Gentle/);
    expect(panel().getAllByRole("button", { name: /^To Small & Gentle/ })).toHaveLength(1);
  });
  it("selecting a pup shows where it is: the camera moves to it", () => {
    open(withPups({ over: { checkedIn: true } }));
    act(() => emit({ kind: "dog", id: "d0" }));
    expect(focused.length).toBeGreaterThan(0);
  });
});

describe("building pauses the day (§3)", () => {
  it("entering Build pauses; leaving restores what it was — running stays running, paused stays paused", () => {
    open(withPups());
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    expect(screen.getByRole("button", { name: "Resume" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Done building" }));
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
    // paused before building: still paused after
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    fireEvent.click(screen.getByRole("button", { name: "Done building" }));
    expect(screen.getAllByRole("button", { name: "Resume" }).length).toBeGreaterThan(0); // (the paused notice has one too)
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
  });
});

