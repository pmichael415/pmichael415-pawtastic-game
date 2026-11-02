// A bath takes time (40 game minutes) and is charged at pickup, not when it starts (service design, "Bath").
import { describe, expect, it } from "vitest";
import { assignRoom, bath, checkIn, createArrival, playtime, setOpen, tick } from "./run";
import { fac, withFac } from "./state";
import { ok, richState } from "./testkit";
import { BATH_MIN } from "./run";
import type { TycoonState } from "./types";

function placedPup(): { s: TycoonState; id: string } {
  let s = ok(setOpen(richState(), true));
  s = withFac(s, { ...fac(s), clockMin: 9 * 60 });
  s = ok(createArrival(s, () => 0.9)); // 0.9: no bath booked (the player can still offer one)
  const id = fac(s).dogs.at(-1)!.id;
  s = ok(checkIn(s, id));
  const room = fac(s).rooms.find((r) => r.type === "playroom")!;
  const d = fac(s).dogs.find((x) => x.id === id)!;
  s = ok(assignRoom(s, id, room.uid, d.size + "-" + d.temper !== room.group));
  return { s, id };
}
const dog = (s: TycoonState, id: string) => fac(s).dogs.find((d) => d.id === id)!;
const still = () => 0.99; // no arrivals or scuffles while time passes

describe("a timed bath", () => {
  it("starting it takes staff energy and coins nothing; the pup isn't bathed yet", () => {
    const { s, id } = placedPup();
    const energy = fac(s).staff.reduce((a, x) => a + x.energy, 0);
    const r = ok(bath(s, id));
    expect(r.coins).toBe(s.coins);
    expect(dog(r, id).bathing).toBe(BATH_MIN);
    expect(dog(r, id).bathed).toBe(false);
    expect(fac(r).staff.reduce((a, x) => a + x.energy, 0)).toBe(energy - 15);
    expect(dog(r, id).visit!.history.some((h) => /Bath started/.test(h))).toBe(true);
  });
  it("finishes after 40 game minutes: clean, bathed, counted — still not charged", () => {
    const { s, id } = placedPup();
    let r = ok(bath(s, id));
    const coins = r.coins;
    r = tick(r, 10, still); // 20 game minutes
    expect(dog(r, id).bathed).toBe(false);
    expect(dog(r, id).bathing).toBeCloseTo(BATH_MIN - 20);
    r = tick(r, 10, still);
    expect(dog(r, id).bathed).toBe(true);
    expect(dog(r, id).bathing ?? null).toBeNull();
    expect(dog(r, id).clean).toBe(100);
    expect(fac(r).stats.baths).toBe(fac(s).stats.baths + 1);
    expect(r.coins).toBeGreaterThanOrEqual(coins - 1); // nothing paid for the bath here (tips/upkeep aside)
    expect(fac(r).ledger.at(-1)!.income.baths).toBe(fac(s).ledger.at(-1)?.income.baths ?? 0);
  });
  it("can't start twice, and the pup can't have playtime while in the bath", () => {
    const { s, id } = placedPup();
    const r = ok(bath(s, id));
    expect(bath(r, id).ok).toBe(false);
    const p = playtime(r, id);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.error).toMatch(/bath/);
  });
});
