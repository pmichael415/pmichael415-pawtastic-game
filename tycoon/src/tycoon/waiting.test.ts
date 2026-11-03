// Families who are kept waiting (staff design §4): waiting → impatient → upset, with warnings, and a family ignored
// at the desk leaves after an hour. Turning a family away stays free; a closed daycare's clock doesn't move.
import { describe, expect, it } from "vitest";
import { tick, turnAway } from "./run";
import { fac, parseTycoon, withFac } from "./state";
import { hire } from "./team";
import { ok, richState } from "./testkit";
import { defaultVisit } from "./visit";
import { DESK_GIVES_UP, waitStage } from "./waiting";
import type { Facility, TDog, TycoonState, Visit } from "./types";

const still = () => 0.99;
function withPup(over: Partial<TDog>, visit: Partial<Visit>, clock: number, open = true): TycoonState {
  const s = richState();
  const f = fac(s);
  const d: TDog = { id: "a", name: "Biscuit", breed: 1, size: "small", temper: "gentle", visits: 1, place: { kind: "lobby" }, checkedIn: false, happiness: 85, clean: 80, boarding: false, played: 0, bathed: false, ...over };
  return withFac(s, { ...f, open, clockMin: clock, introDay: 0 /* past the introductory day: the normal rules */, dogs: [{ ...d, visit: { ...defaultVisit(f, d), owner: "Taylor", arrivedDay: f.day, arrived: 9 * 60, ...visit } }] });
}
const stageAt = (clock: number, visit: Partial<Visit> = {}, over: Partial<TDog> = {}) => {
  const s = withPup(over, visit, clock);
  return waitStage(fac(s), fac(s).dogs[0]!);
};
const run = (s: TycoonState, min: number) => {
  for (let i = 0; i < min; i++) s = tick(s, 0.5, still);
  return s;
};

describe("waiting at drop-off", () => {
  it("waiting, then impatient at 20 minutes, then upset at 40 — with the time before they leave", () => {
    expect(stageAt(9 * 60 + 10)).toMatchObject({ kind: "dropoff", stage: "waiting", minutes: 10 });
    expect(stageAt(9 * 60 + 25)).toMatchObject({ stage: "impatient" });
    expect(stageAt(9 * 60 + 45)).toMatchObject({ stage: "upset", leavesIn: 15 });
  });
  it("a family ignored for an hour takes their pup home upset, with no charge and a reputation cost", () => {
    let s = withPup({}, {}, 9 * 60 + 55);
    const rep = fac(s).reputation;
    s = run(s, 6);
    expect(fac(s).dogs).toHaveLength(0);
    const o = fac(s).outcomes.at(-1)!;
    expect(o).toMatchObject({ how: "left", mood: "upset", total: 0 });
    expect(o.complaints.some((c) => c.kind === "wait")).toBe(true);
    expect(fac(s).reputation).toBeLessThan(rep);
    expect(DESK_GIVES_UP).toBe(60);
  });
  it("turning a family away is still free, however long they waited", () => {
    const s = withPup({}, {}, 9 * 60 + 50);
    const r = ok(turnAway(s, "a"));
    expect(fac(r).outcomes).toHaveLength(fac(s).outcomes.length);
    expect(fac(r).reputation).toBe(fac(s).reputation);
  });
  it("while the daycare is closed the clock doesn't move, so nobody gives up", () => {
    let s = withPup({}, {}, 9 * 60 + 55, false);
    s = run(s, 30);
    expect(fac(s).dogs).toHaveLength(1);
  });
  it("a receptionist checks them in long before that", () => {
    let s = ok(hire(withPup({}, {}, 9 * 60), "reception"));
    s = run(s, 30);
    expect(fac(s).dogs[0]!.checkedIn).toBe(true);
    expect(fac(s).outcomes).toHaveLength(0);
  });
});

describe("old saves", () => {
  it("a pup saved at the desk before visits existed hasn't been 'waiting since opening' — no one leaves on load", () => {
    const s = richState();
    const f = fac(s);
    const old = { id: "d9", name: "Pepper", breed: 1, size: "small", temper: "gentle", visits: 1, place: { kind: "lobby" }, checkedIn: false, happiness: 70, clean: 60, boarding: false, played: 0, bathed: false };
    let p = parseTycoon(JSON.parse(JSON.stringify({ ...s, facilities: { f1: { ...f, open: true, clockMin: 15 * 60, dogs: [old] } } })))!;
    expect(waitStage(fac(p), fac(p).dogs[0]!)).toMatchObject({ stage: "waiting", minutes: 0 });
    p = run(p, 5);
    expect(fac(p).dogs).toHaveLength(1);
    expect(fac(p).outcomes).toHaveLength(0);
  });
});

describe("waiting at pickup", () => {
  it("waiting, impatient from 30 (a complaint), upset from 45 with the time before they leave", () => {
    const placed = { checkedIn: true, place: { kind: "room" as const, room: fac(richState()).rooms.find((r) => r.type === "playroom")!.uid } };
    expect(stageAt(15 * 60 + 10, { ownerHere: 15 * 60 }, placed)).toMatchObject({ kind: "pickup", stage: "waiting" });
    expect(stageAt(15 * 60 + 35, { ownerHere: 15 * 60 }, placed)).toMatchObject({ stage: "impatient" });
    expect(stageAt(15 * 60 + 50, { ownerHere: 15 * 60 }, placed)).toMatchObject({ stage: "upset", leavesIn: 10 });
  });
  it("nobody waiting: no stage", () => {
    const placed = { checkedIn: true, place: { kind: "room" as const, room: fac(richState()).rooms.find((r) => r.type === "playroom")!.uid } };
    expect(stageAt(12 * 60, {}, placed)).toBeNull();
  });
});

export type _F = Facility;
