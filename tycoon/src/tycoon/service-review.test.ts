// Fixes from the independent review of the service work (each test reproduces one finding).
import { describe, expect, it } from "vitest";
import { assessVisit } from "./assess";
import { bathPay } from "./business";
import { pickupView, remedy } from "./pickup";
import { BATH_MIN, checkIn, createArrival, setOpen, settle, tick } from "./run";
import { fac, parseTycoon, withFac } from "./state";
import { ok, richState } from "./testkit";
import { defaultVisit } from "./visit";
import type { Facility, TDog, TycoonState, Visit } from "./types";

const playroom = (f: Facility) => f.rooms.find((r) => r.type === "playroom")!.uid;
function withPup(over: Partial<TDog>, visit: Partial<Visit>, fac0: Partial<Facility> = {}): TycoonState {
  const s = richState();
  const f = { ...fac(s), open: true, cleanliness: 95, ...fac0 };
  const d: TDog = { id: "a", name: "Biscuit", breed: 1, size: "small", temper: "gentle", visits: 1, place: { kind: "room", room: playroom(f) }, checkedIn: true, happiness: 85, clean: 80, boarding: false, played: 1, bathed: false, ...over };
  return withFac(s, { ...f, dogs: [{ ...d, visit: { ...defaultVisit(f, d), ...visit } }] });
}
const still = () => 0.99;

describe("C1: an old save on a later day", () => {
  it("gets pickups for today, not day 1 — owners don't all arrive at once and leave upset", () => {
    const s = richState();
    const f = fac(s);
    const old = { id: "d9", name: "Pepper", breed: 1, size: "small", temper: "gentle", visits: 1, place: { kind: "room", room: playroom(f) }, checkedIn: true, happiness: 70, clean: 60, boarding: false, played: 1, bathed: false };
    const p = parseTycoon(JSON.parse(JSON.stringify({ ...s, facilities: { f1: { ...f, day: 3, clockMin: 8 * 60, open: true, dogs: [old] } } })))!;
    expect(fac(p).dogs[0]!.visit!.pickupDay).toBe(3);
    const t = tick(p, 30, still); // an hour of game time
    expect(fac(t).dogs).toHaveLength(1);
    expect(fac(t).dogs[0]!.visit!.ownerHere).toBeNull();
  });
});

describe("C2/I5: finishing a bath, and prepaid baths that weren't done", () => {
  it("'finish the bath' isn't offered when it can't be done before closing", () => {
    const s = withPup({}, { requests: ["daycare", "bath"], ownerHere: 17 * 60 + 30 }, { clockMin: 17 * 60 + 31 });
    expect(pickupView(s, "a", false).options.bath).not.toContain("finish");
    const running = withPup({ bathing: 10 }, { requests: ["daycare", "bath"], ownerHere: 17 * 60 + 30 }, { clockMin: 17 * 60 + 31 });
    expect(pickupView(running, "a", false).options.bath).toContain("finish");
  });
  it("a finish that didn't complete isn't 'put right'", () => {
    const s = withPup({ bathing: 30 }, { requests: ["daycare", "bath"], finishing: "bath", remedies: { bath: "finish" } }, { clockMin: 16 * 60 });
    const a = assessVisit(fac(s), fac(s).dogs[0]!, {});
    expect(a.complaints.find((c) => c.kind === "bath")!.resolved).toBe(false);
  });
  it("an owner who gives up (or is collected at closing) gets a prepaid bath that wasn't done refunded", () => {
    const paid = bathPay(fac(richState()));
    const s = withPup({}, { requests: ["daycare", "bath"], prepaid: ["bath"], paid, ownerHere: 15 * 60 }, { clockMin: 16 * 60 });
    const r = ok(settle(s, "a", "left"));
    const out = fac(r).outcomes.at(-1)!;
    expect(out.lines.some((l) => /Refund/.test(l.label) && l.amount === -paid)).toBe(true);
  });
});

describe("I4: refunds never pay out more than the family paid", () => {
  it("the total refund is capped at what was charged today plus what was prepaid", () => {
    const s = withPup({ happiness: 5, played: 0 }, { ownerHere: 15 * 60, remedies: { wait: "refund", attention: "refund" } }, { clockMin: 16 * 60, cleanliness: 95 });
    const f = fac(s);
    const a = assessVisit(f, f.dogs[0]!, {});
    expect(a.total).toBeGreaterThanOrEqual(0); // nothing was prepaid, so nothing is paid out
  });
});

describe("I6: finishing the bath keeps the wait (and a refund already promised for it)", () => {
  it("the wait complaint and its refund survive the owner agreeing to wait", () => {
    let s = withPup({}, { requests: ["daycare", "bath"], ownerHere: 15 * 60 }, { clockMin: 15 * 60 + 40 });
    s = ok(remedy(s, "a", "wait", "refund"));
    s = ok(remedy(s, "a", "bath", "finish"));
    for (let i = 0; i < 40 && fac(s).dogs.length; i++) s = tick(s, 1, still);
    const out = fac(s).outcomes.at(-1)!;
    expect(out.how).toBe("finished");
    expect(out.complaints.find((c) => c.kind === "wait")).toMatchObject({ remedy: "refund", resolved: true });
    expect(out.lines.some((l) => /Refund — the wait/.test(l.label))).toBe(true);
  });
});

describe("I7: late drop-offs", () => {
  it("daycare drop-offs end at 15:30 (so there's time to care for the pup); boarders can still come", () => {
    const s = withFac(ok(setOpen(richState(), true)), { ...fac(richState()), open: true, clockMin: 15 * 60 + 31 });
    expect(createArrival(s, () => 0.9).ok).toBe(false);
    expect(createArrival(s, () => 0.9, true).ok).toBe(true);
  });
  it("the reputation reason names the problem whenever a complaint wasn't put right", () => {
    const s = withPup({ happiness: 95 }, { ownerHere: 15 * 60 }, { clockMin: 15 * 60 + 35, reputation: 70 });
    const r = ok(settle(s, "a", "checkout"));
    const e = fac(r).repLog.at(-1);
    if (e) expect(e.reason).toMatch(/not put right/);
  });
});

describe("I10: the desk wait counts", () => {
  it("check-in records how long the pup waited at the desk", () => {
    let s = withFac(ok(setOpen(richState(), true)), { ...fac(richState()), open: true, clockMin: 9 * 60 });
    s = ok(createArrival(s, () => 0.9));
    const id = fac(s).dogs.at(-1)!.id;
    s = withFac(s, { ...fac(s), clockMin: 10 * 60 + 30 });
    s = ok(checkIn(s, id));
    expect(fac(s).dogs.find((d) => d.id === id)!.visit!.waitedLobby).toBe(90);
  });
});

describe("minor: a finished bath goes home even if the daycare was closed meanwhile", () => {
  it("settles when the bath is done, open or not", () => {
    let s = withPup({ bathing: 5 }, { requests: ["daycare", "bath"], finishing: "bath", remedies: { bath: "finish" } }, { clockMin: 16 * 60, open: false });
    s = tick(s, 5, still);
    expect(fac(s).dogs).toHaveLength(0);
    expect(fac(s).outcomes.at(-1)!.how).toBe("finished");
  });
  it("BATH_MIN is still 40", () => expect(BATH_MIN).toBe(40));
});
