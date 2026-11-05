// Every pup's visit has a customer, booked services, an arrival and a pickup time (service design, "The visit").
import { describe, expect, it } from "vitest";
import { mulberry, personalityOf } from "@/game/engine";
import { checkIn, createArrival, setOpen } from "./run";
import { fac, newTycoon, parseTycoon, withFac } from "./state";
import { guidedBuild, ok, richState } from "./testkit";
import { visitOf } from "./visit";
import { bathPay } from "./business";
import type { TycoonState } from "./types";

const open = (s: TycoonState, clock = 480) => {
  const o = ok(setOpen(s, true));
  return withFac(o, { ...fac(o), clockMin: clock });
};
/** n arrivals, each into an emptied lobby (so the lobby never fills). */
function arrivals(s0: TycoonState, n: number, seed = 7, boarding = false) {
  const rand = mulberry(seed);
  const out = [];
  let s = s0;
  for (let i = 0; i < n; i++) {
    s = ok(createArrival(s, rand, boarding));
    const d = fac(s).dogs.at(-1)!;
    out.push(d);
    s = withFac(s, { ...fac(s), dogs: [] });
  }
  return out;
}

describe("a visit", () => {
  it("has an owner, books daycare, and is picked up 2–7 hours later but by 17:30", () => {
    const s = open(guidedBuild({ ...newTycoon(0), coins: 5000 }), 9 * 60);
    for (const d of arrivals(s, 60)) {
      const v = d.visit!;
      expect(v.owner.length).toBeGreaterThan(1);
      expect(v.requests).toContain("daycare");
      expect(v.requests).not.toContain("bath"); // no bath room yet: nobody books one
      expect(v.arrived).toBe(9 * 60);
      expect(v.pickupDay).toBe(fac(s).day);
      expect(v.pickup).toBeGreaterThanOrEqual(9 * 60 + 120);
      expect(v.pickup).toBeLessThanOrEqual(17 * 60 + 30);
      expect(v.ownerHere).toBeNull();
    }
  });
  it("with a working bath room, every pup who loves bath time books one, about 3 in 10 others do, and some prepay", () => {
    const s = open(richState(), 8 * 60);
    const ds = arrivals(s, 300, 11);
    const bath = ds.filter((d) => d.visit!.requests.includes("bath")).length;
    const fans = ds.filter((d) => personalityOf(d).favorite === "splash");
    const others = ds.filter((d) => personalityOf(d).favorite !== "splash");
    expect(fans.length).toBeGreaterThan(0);
    expect(fans.every((d) => d.visit!.requests.includes("bath"))).toBe(true);
    const otherRate = others.filter((d) => d.visit!.requests.includes("bath")).length / others.length;
    expect(otherRate).toBeGreaterThan(0.2);
    expect(otherRate).toBeLessThan(0.4);
    const prepaid = ds.filter((d) => d.visit!.prepaid.includes("bath")).length;
    expect(prepaid).toBeGreaterThan(0);
    expect(prepaid).toBeLessThan(bath);
    for (const d of ds) for (const p of d.visit!.prepaid) expect(d.visit!.requests).toContain(p);
  });
  it("boarders book boarding and are picked up the next morning at 10:00", () => {
    const s = open(richState(), 8 * 60);
    const [d] = arrivals(s, 1, 3, true);
    expect(d!.visit!.requests).toEqual(expect.arrayContaining(["daycare", "boarding"]));
    expect(d!.visit!.pickupDay).toBe(fac(s).day + 1);
    expect(d!.visit!.pickup).toBe(10 * 60);
  });
  it("check-in charges prepaid services once, records the time, and can't happen twice", () => {
    let s = open(richState(), 8 * 60);
    s = ok(createArrival(s, () => 0.1)); // rand 0.1: books and prepays a bath
    const d = fac(s).dogs.at(-1)!;
    expect(d.visit!.prepaid).toContain("bath");
    const coins = s.coins;
    s = ok(checkIn(s, d.id));
    const after = fac(s).dogs.find((x) => x.id === d.id)!;
    expect(s.coins).toBe(coins + bathPay(fac(s)));
    expect(after.visit!.checkedInAt).toBe(8 * 60);
    expect(after.visit!.history.some((h) => /Checked in/.test(h))).toBe(true);
    expect(checkIn(s, d.id).ok).toBe(false);
  });
});

describe("older saves", () => {
  it("a pup saved before visits gets a plain daycare visit picked up at 17:30 that day", () => {
    const s = guidedBuild(newTycoon(0));
    const f = fac(s);
    const raw = JSON.parse(JSON.stringify({ ...s, facilities: { f1: { ...f, dogs: [{ id: "d9", name: "Pepper", breed: 1, size: "small", temper: "gentle", visits: 1, place: { kind: "lobby" }, checkedIn: false, happiness: 50, clean: 50, boarding: false, played: 0, bathed: false }] } } }));
    const p = parseTycoon(raw)!;
    const d = fac(p).dogs[0]!;
    const v = visitOf(fac(p), d);
    expect(v.requests).toEqual(["daycare"]);
    expect(v.pickupDay).toBe(fac(p).day);
    expect(v.pickup).toBe(17 * 60 + 30);
    expect(fac(p).repLog).toEqual([]);
    expect(fac(p).reviews).toEqual([]);
  });
  it("a visit survives a save and load unchanged", () => {
    let s = open(richState(), 8 * 60);
    s = ok(createArrival(s, () => 0.1));
    const before = fac(s).dogs.at(-1)!.visit;
    const p = parseTycoon(JSON.parse(JSON.stringify(s)))!;
    expect(fac(p).dogs.at(-1)!.visit).toEqual(before);
  });
  it("a corrupt visit is replaced by a default one, never dropping the pup", () => {
    const s = guidedBuild(newTycoon(0));
    const f = fac(s);
    const raw = JSON.parse(JSON.stringify({ ...s, facilities: { f1: { ...f, dogs: [{ id: "d9", name: "Pepper", breed: 1, size: "small", temper: "gentle", visits: 1, place: { kind: "lobby" }, checkedIn: false, happiness: 50, clean: 50, boarding: false, played: 0, bathed: false, visit: { owner: 5, requests: "bath" } }] } } }));
    const d = fac(parseTycoon(raw)!).dogs[0]!;
    expect(d.visit!.requests).toEqual(["daycare"]);
  });
});
