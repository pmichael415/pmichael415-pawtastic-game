// Reputation is earned by service, explained, and recoverable; reviews and loyalty follow how visits went
// (service design, "Reputation, reviews, loyalty").
import { describe, expect, it } from "vitest";
import { REP_MIN, mulberry } from "@/game/engine";
import { startCampaign } from "./marketing";
import { checkout, createArrival, setOpen, tick } from "./run";
import { REVIEW_FACTOR_MAX, REVIEW_FACTOR_MIN, repDeltaFor, reviewFactor, reviewFor } from "./reputation";
import { fac, withFac } from "./state";
import { ok, richState } from "./testkit";
import { defaultVisit } from "./visit";
import type { Facility, Review, TDog, TycoonState } from "./types";

const playroom = (f: Facility) => f.rooms.find((r) => r.type === "playroom")!.uid;
function withPup(s: TycoonState, over: Partial<TDog>): TycoonState {
  const f = fac(s);
  const d: TDog = { id: "a", name: "Biscuit", breed: 1, size: "small", temper: "gentle", visits: 1, place: { kind: "room", room: playroom(f) }, checkedIn: true, happiness: 85, clean: 80, boarding: false, played: 1, bathed: false, ...over };
  return withFac(s, { ...f, clockMin: 16 * 60, cleanliness: 95, dogs: [{ ...d, visit: { ...defaultVisit(f, d), ownerHere: 16 * 60 } }] });
}

describe("no reputation for nothing", () => {
  it("time passing doesn't raise reputation — not with happy pups, not with unhappy ones", () => {
    let s = withFac(ok(setOpen(richState(), true)), { ...fac(richState()), open: true, reputation: 70, clockMin: 8 * 60 });
    s = withPup(s, { happiness: 20 });
    s = withFac(s, { ...fac(s), clockMin: 8 * 60, dogs: fac(s).dogs.map((d) => ({ ...d, visit: { ...d.visit!, pickup: 17 * 60 + 30, ownerHere: null } })) });
    const t = tick(s, 200, () => 0.99);
    expect(fac(t).reputation).toBe(70);
  });
});

describe("visit outcomes move reputation, with a reason", () => {
  it("a delighted family: +2, logged with who and why", () => {
    const s = withFac(richState(), { ...fac(richState()), reputation: 70 });
    const c = ok(checkout(withPup(s, {}), "a", false));
    expect(fac(c).reputation).toBe(72);
    const e = fac(c).repLog.at(-1)!;
    expect(e.delta).toBe(2);
    expect(e.reason).toMatch(/delighted/);
    expect(fac(c).outcomes.at(-1)!.repDelta).toBe(2);
  });
  it("an upset family with nothing fixed: −4, and −1 more for the unresolved complaint", () => {
    const s = withFac(richState(), { ...fac(richState()), reputation: 70 });
    const c = ok(checkout(withPup(s, { happiness: 10, played: 0 }), "a", false));
    expect(fac(c).reputation).toBe(65);
    expect(fac(c).repLog.at(-1)!.reason).toMatch(/upset/);
  });
  it("never below the floor", () => {
    const s = withFac(richState(), { ...fac(richState()), reputation: REP_MIN + 1 });
    const c = ok(checkout(withPup(s, { happiness: 0, played: 0 }), "a", false));
    expect(fac(c).reputation).toBe(REP_MIN);
  });
  it("the bands: ≥85 +2, 70–84 +1, 50–69 0, 35–49 −2, under 35 −4", () => {
    expect([95, 85, 84, 70, 69, 50, 49, 35, 34, 0].map(repDeltaFor)).toEqual([2, 2, 1, 1, 0, 0, -2, -2, -4, -4]);
  });
  it("an open house adds +5, logged", () => {
    const s = withFac(richState(), { ...fac(richState()), reputation: 70 });
    const r = startCampaign({ ...s, xp: 50 * 9 * 8, coins: 5000 }, "openhouse");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(fac(r.state).reputation).toBe(75);
    expect(fac(r.state).repLog.at(-1)).toMatchObject({ delta: 5 });
  });
});

describe("scuffles", () => {
  it("cost −3 when one starts (logged), not a steady drain", () => {
    let s = withPup(withFac(richState(), { ...fac(richState()), reputation: 70, open: true }), {});
    const f = fac(s);
    s = withFac(s, { ...f, clockMin: 9 * 60, dogs: [...f.dogs, { ...f.dogs[0]!, id: "b", name: "Rex", size: "large" as const, temper: "active" as const, visit: { ...f.dogs[0]!.visit!, pickup: 17 * 60 + 30, ownerHere: null } }].map((d) => ({ ...d, visit: { ...d.visit!, pickup: 17 * 60 + 30, ownerHere: null } })) });
    s = tick(s, 1, () => 0); // a scuffle starts
    expect(fac(s).scuffles.length).toBe(1);
    expect(fac(s).reputation).toBe(67);
    expect(fac(s).repLog.at(-1)!.reason).toMatch(/scuffle/i);
    expect(fac(s).dogs.filter((d) => d.id === "a" || d.id === "b").every((d) => d.visit!.scuffle)).toBe(true);
    const later = tick(s, 20, () => 0.99);
    expect(fac(later).reputation).toBe(67); // no drain while it lasts
  });
});

describe("reviews", () => {
  const f = fac(richState());
  const d = { name: "Biscuit", owner: "Taylor" };
  it("delighted families sometimes post a 5★ review that brings referrals today", () => {
    const r = reviewFor(f, d, 95, false, () => 0.1);
    expect(r?.stars).toBe(5);
    expect(reviewFor(f, d, 95, false, () => 0.9)).toBeNull();
  });
  it("upset families sometimes post 1–2★; fixing the problem makes it less likely", () => {
    expect(reviewFor(f, d, 25, false, () => 0.4)?.stars).toBe(1);
    expect(reviewFor(f, d, 40, false, () => 0.4)?.stars).toBe(2);
    expect(reviewFor(f, d, 40, true, () => 0.4)).toBeNull();
    expect(reviewFor(f, d, 60, false, () => 0.01)).toBeNull(); // a middling day gets no review
  });
  it("recent reviews raise or lower drop-offs a little", () => {
    const many = (stars: Review["stars"]): Review[] => Array.from({ length: 10 }, (_, i) => ({ day: i + 1, stars, owner: "A", dog: "B", text: "" }));
    expect(reviewFactor({ ...f, reviews: [] })).toBe(1);
    expect(reviewFactor({ ...f, reviews: many(5) })).toBeCloseTo(REVIEW_FACTOR_MAX);
    expect(reviewFactor({ ...f, reviews: many(1) })).toBeCloseTo(REVIEW_FACTOR_MIN);
  });
});

describe("loyalty", () => {
  it("a family that left upset with nothing fixed doesn't come back for 3 days", () => {
    let s = withFac(ok(setOpen(richState(), true)), { ...fac(richState()), open: true, clockMin: 9 * 60 });
    const regular = { name: "Biscuit", breed: 1, size: "small" as const, temper: "gentle" as const, visits: 3, friendship: 20, lastDay: 1, sat: 20, lostUntil: fac(s).day + 3 };
    s = withFac(s, { ...fac(s), guestBook: [regular] });
    const rand = mulberry(5);
    for (let i = 0; i < 200; i++) {
      const r = createArrival(s, rand);
      if (!r.ok) break;
      const d = fac(r.state).dogs.at(-1)!;
      expect(d.name === "Biscuit" && d.breed === 1 && d.visits > 1).toBe(false); // a new pup may share the name; the regular never returns
    }
  });
});
