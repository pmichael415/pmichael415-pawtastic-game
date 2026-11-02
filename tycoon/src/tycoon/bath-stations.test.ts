// Bath stations (staff design §3): a bath needs a free tub, holds it for the whole 40 minutes, and the booked
// baths not yet started form the queue.
import { describe, expect, it } from "vitest";
import { placeThing } from "./build";
import { caps } from "./connect";
import { pickupView } from "./pickup";
import { BATH_MIN, bath, tick } from "./run";
import { bathQueue, freeTub } from "./rooms";
import { fac, withFac } from "./state";
import { ok, richState } from "./testkit";
import { defaultVisit } from "./visit";
import type { Facility, TDog, TycoonState, Visit } from "./types";

const still = () => 0.99;
function withPups(n: number, visit: Partial<Visit> = {}, s0: TycoonState = richState()): TycoonState {
  const f = fac(s0);
  const room = f.rooms.find((r) => r.type === "playroom")!.uid;
  const dogs = Array.from({ length: n }, (_, i): TDog => {
    const d: TDog = { id: "p" + i, name: ["Luna", "Milo", "Pip"][i] ?? "Pup", breed: 1, size: "small", temper: "gentle", visits: 1, place: { kind: "room", room }, checkedIn: true, happiness: 80, clean: 40, boarding: false, played: 1, bathed: false };
    return { ...d, visit: { ...defaultVisit(f, d), checkedInAt: 9 * 60 + i, ...visit } };
  });
  return withFac(s0, { ...f, open: false, dogs });
}
/** richState plus a second tub in the bath room. */
function twoTubs(): TycoonState {
  const s = richState();
  const bathRoom = fac(s).rooms.find((r) => r.type === "bath")!;
  for (let c = bathRoom.c; c < bathRoom.c + bathRoom.w; c++)
    for (let r = bathRoom.r; r < bathRoom.r + bathRoom.d; r++) {
      const t = placeThing(s, "bath_tub", c, r, 0);
      if (t.ok) return t.state;
    }
  throw new Error("no room for a second tub");
}

describe("bath stations", () => {
  it("with one tub, a second bath waits until the first is done", () => {
    let s = withPups(2);
    s = ok(bath(s, "p0"));
    const tub = caps(fac(s)).tubs[0]!.uid;
    expect(fac(s).dogs[0]!.bathTub).toBe(tub);
    const second = bath(s, "p1");
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toMatch(/busy/i);
    s = tick(s, (BATH_MIN - 1) / 2, still); // 39 game minutes
    expect(fac(s).dogs[0]!.bathing).toBeGreaterThan(0);
    expect(freeTub(fac(s))).toBeNull();
    s = tick(s, 0.5, still); // the 40th minute
    expect(fac(s).dogs[0]).toMatchObject({ bathed: true, bathing: null, bathTub: null });
    expect(freeTub(fac(s))).toBe(tub);
    expect(bath(s, "p1").ok).toBe(true);
  });
  it("two tubs run two baths at once, each in its own tub", () => {
    let s = withPups(2, {}, twoTubs());
    s = ok(bath(s, "p0"));
    s = ok(bath(s, "p1"));
    const [a, b] = fac(s).dogs;
    expect(a!.bathTub).toBeTruthy();
    expect(b!.bathTub).toBeTruthy();
    expect(a!.bathTub).not.toBe(b!.bathTub);
  });
  it("the queue is the booked baths not started yet, in booking order", () => {
    let s = withPups(3, { requests: ["daycare", "bath"] });
    const f = fac(s);
    s = withFac(s, { ...f, dogs: f.dogs.map((d, i) => (i === 2 ? { ...d, visit: { ...d.visit!, requests: ["daycare"] } } : d)) });
    expect(bathQueue(fac(s)).map((d) => d.id)).toEqual(["p0", "p1"]);
    s = ok(bath(s, "p0"));
    expect(bathQueue(fac(s)).map((d) => d.id)).toEqual(["p1"]);
  });
  it("'finish the bath' isn't offered while every tub is busy with someone else", () => {
    let s = withPups(2, { requests: ["daycare", "bath"], ownerHere: 15 * 60 });
    s = withFac(s, { ...fac(s), clockMin: 15 * 60 + 5 });
    s = ok(bath(s, "p0"));
    expect(pickupView(s, "p1", false).options.bath ?? []).not.toContain("finish");
  });
});

export type _F = Facility;
