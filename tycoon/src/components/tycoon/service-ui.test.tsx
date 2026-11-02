// The service loop on screen: the owner at pickup, a complaint with real choices, an itemized receipt, the
// reputation's reasons, and what's blocking income (service design; owner brief of 3 Nov).
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
import { fac, withFac } from "@/tycoon/state";
import { richState } from "@/tycoon/testkit";
import { defaultVisit } from "@/tycoon/visit";
import type { TDog, TycoonState, Visit } from "@/tycoon/types";

const now = () => tycoonStore.getState()!;
const SKIPPED = { mode: "scratch", beat: "meet", startedAt: 0, upgrade: null, done: false, skipped: true } as const;
function withPickup(over: Partial<TDog>, visit: Partial<Visit>): TycoonState {
  const s = richState();
  const f = fac(s);
  const room = f.rooms.find((r) => r.type === "playroom")!.uid;
  const d: TDog = { id: "a", name: "Biscuit", breed: 1, size: "small", temper: "gentle", visits: 1, place: { kind: "room", room }, checkedIn: true, happiness: 88, clean: 80, boarding: false, played: 1, bathed: false, ...over };
  return { ...withFac(s, { ...f, open: false, clockMin: 16 * 60 + 5, cleanliness: 95, dogs: [{ ...d, visit: { ...defaultVisit(f, d), owner: "Taylor", ownerHere: 16 * 60, pickup: 16 * 60, ...visit } }] }), tour: SKIPPED };
}
function open(s: TycoonState) {
  localStorage.setItem(KEY, JSON.stringify(s));
  return render(<TycoonPlay />);
}
const panel = () => within(screen.getByTestId("panel-sheet"));

describe("pickup on screen", () => {
  beforeEach(() => {
    localStorage.clear();
    tycoonStore._reset(null);
  });
  it("the pup's panel says who's here, what they booked and when", () => {
    open(withPickup({}, { requests: ["daycare", "bath"] }));
    act(() => emit({ kind: "dog", id: "a" }));
    expect(panel().getByText(/Taylor is here for pickup/)).toBeTruthy();
    expect(panel().getByText(/Booked daycare \+ bath/)).toBeTruthy();
  });
  it("a complaint opens the pickup sheet: the bill, the complaint, real choices — and one checkout", () => {
    open(withPickup({}, { requests: ["daycare", "bath"] }));
    act(() => emit({ kind: "dog", id: "a" }));
    fireEvent.click(panel().getByRole("button", { name: /^Check out/ }));
    const sheet = screen.getByRole("dialog", { name: /Pickup — Biscuit/ });
    expect(within(sheet).getByText(/wasn't done/)).toBeTruthy();
    expect(within(sheet).getByText(/Bath — not done \(not charged\)/)).toBeTruthy();
    expect(within(sheet).getByRole("button", { name: /Finish the bath/ })).toBeTruthy();
    expect(within(sheet).getByRole("button", { name: /Explain/ })).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: /Credit/ }));
    expect(within(sheet).getByText(/we'll use that next time/)).toBeTruthy();
    const before = now().coins;
    const bonusBefore = fac(now()).ledger.at(-1)?.income.bonus ?? 0;
    const pay = within(sheet).getByRole("button", { name: /say goodbye/ });
    fireEvent.click(pay);
    fireEvent.click(pay); // a second tap does nothing
    expect(fac(now()).dogs).toHaveLength(0);
    expect(fac(now()).outcomes).toHaveLength(1);
    // the bill, once (plus any friendship milestone bonus, which is paid separately)
    const bonus = (fac(now()).ledger.at(-1)?.income.bonus ?? 0) - bonusBefore;
    expect(now().coins - before).toBe(fac(now()).outcomes[0]!.total + bonus);
  });
  it("a visit that went well checks out at once and shows an itemized receipt", () => {
    open(withPickup({}, {}));
    act(() => emit({ kind: "dog", id: "a" }));
    fireEvent.click(panel().getByRole("button", { name: /^Check out/ }));
    expect(screen.queryByRole("dialog", { name: /Pickup/ })).toBeNull();
    const receipt = screen.getByRole("region", { name: "Receipt" });
    expect(within(receipt).getByText(/delighted/)).toBeTruthy();
    expect(within(receipt).getByText(/^Daycare/)).toBeTruthy();
    expect(within(receipt).getByText(/Total/)).toBeTruthy();
  });
  it("reputation shows why it moved", () => {
    open(withPickup({}, {}));
    act(() => emit({ kind: "dog", id: "a" }));
    fireEvent.click(panel().getByRole("button", { name: /^Check out/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Reputation/ }));
    const sheet = screen.getByRole("dialog", { name: /Reputation/ });
    expect(within(sheet).getByText(/Taylor was delighted with Biscuit's day/)).toBeTruthy();
  });
});

describe("when income stalls", () => {
  beforeEach(() => {
    localStorage.clear();
    tycoonStore._reset(null);
  });
  it("a card names what's blocking income and how to fix it", () => {
    const s = richState();
    const f = fac(s);
    const pup: TDog = { id: "b", name: "Bruno", breed: 0, size: "large", temper: "active", visits: 1, place: { kind: "lobby" }, checkedIn: true, happiness: 30, clean: 50, boarding: false, played: 0, bathed: false };
    // every playroom taken by Small & Gentle pups, a Large & Active one waiting
    const rooms = f.rooms.filter((r) => r.type === "playroom");
    const filled = withFac(s, { ...f, open: true, clockMin: 11 * 60, rooms: f.rooms.map((r) => (r.type === "playroom" ? { ...r, group: "small-gentle" as const } : r)), dogs: [{ ...pup, visit: defaultVisit(f, pup) }, ...rooms.map((r, i): TDog => ({ id: "k" + i, name: "Kit" + i, breed: 1, size: "small", temper: "gentle", visits: 1, place: { kind: "room", room: r.uid }, checkedIn: true, happiness: 80, clean: 80, boarding: false, played: 1, bathed: false }))] });
    open({ ...filled, tour: SKIPPED });
    const card = screen.getByRole("region", { name: "What's blocking income" });
    expect(within(card).getByText(/No playroom for Large & Active pups/)).toBeTruthy();
  });
});
