// Pickup: owners come back at their pickup time, see an itemized bill, raise real complaints, and react to the
// remedy the player chooses (service design, "Pickup" and "Complaints"). The owner brief's scenario is the first test.
import { describe, expect, it } from "vitest";
import { bathPay } from "./business";
import { assignRoom, bath, checkIn, checkout, createArrival, playtime, setOpen, tick } from "./run";
import { pickupView, remedy } from "./pickup";
import { fac, withFac } from "./state";
import { ok, richState } from "./testkit";
import type { TycoonState } from "./types";

const still = () => 0.99; // no new drop-offs or scuffles while time passes
const dog = (s: TycoonState, id: string) => fac(s).dogs.find((d) => d.id === id);
const at = (s: TycoonState, min: number) => withFac(s, { ...fac(s), clockMin: min });

/** A pup booked for daycare + bath (not prepaid), checked in at 09:00, in a matching playroom, with playtime. */
function bookedWithBath(prepaid = false): { s: TycoonState; id: string } {
  let s = at(ok(setOpen(richState(), true)), 9 * 60);
  s = withFac(s, { ...fac(s), cleanliness: 95 });
  s = ok(createArrival(s, prepaid ? () => 0.1 : seq([0.9, 0.5, 0.5, 0.1, 0.9, 0.5])));
  const id = fac(s).dogs.at(-1)!.id;
  s = withFac(s, { ...fac(s), dogs: fac(s).dogs.map((d) => (d.id === id ? { ...d, size: "small", temper: "gentle", happiness: 80, visit: { ...d.visit!, requests: ["daycare", "bath"], prepaid: prepaid ? ["bath"] : [], pickup: 16 * 60 } } : d)) });
  s = ok(checkIn(s, id));
  const room = fac(s).rooms.find((r) => r.type === "playroom" && r.group === "small-gentle")!.uid;
  s = ok(assignRoom(s, id, room));
  s = ok(playtime(s, id));
  return { s, id };
}
function seq(xs: number[]) {
  let i = 0;
  return () => xs[i++ % xs.length]!;
}
/** Runs the clock until `min` the same day (open, so the clock moves), with nothing random happening. */
function until(s: TycoonState, min: number) {
  const day = fac(s).day;
  for (let i = 0; i < 2000 && fac(s).day === day && fac(s).clockMin < min; i++) s = tick(s, 1, still);
  return s;
}
/** Pups cared for through the afternoon (these tests are about pickup, not about happiness wearing off). */
const cared = (s: TycoonState) => withFac(s, { ...fac(s), dogs: fac(s).dogs.map((d) => ({ ...d, happiness: 88 })) });
/** Runs the clock into the next day. */
function nextDay(s: TycoonState) {
  const day = fac(s).day;
  for (let i = 0; i < 2000 && fac(s).day === day; i++) s = tick(s, 1, still);
  return s;
}

describe("the owner brief's scenario: daycare + bath, owner arrives before the bath is done", () => {
  it("complaint → finish the bath → billed once, satisfaction and loyalty update", () => {
    let { s, id } = bookedWithBath();
    s = at(s, 15 * 60 + 40);
    s = ok(bath(s, id)); // done at 16:20
    s = until(s, 16 * 60 + 1);
    expect(dog(s, id)!.visit!.ownerHere).not.toBeNull(); // the owner came at 16:00
    const view = pickupView(s, id, false);
    expect(view.assessment.complaints.map((c) => c.kind)).toEqual(["bath"]);
    expect(view.assessment.complaints[0]!.text).toMatch(/still in the bath/);
    expect(view.options.bath).toEqual(expect.arrayContaining(["finish", "credit", "explain"]));
    const coins = s.coins;
    s = ok(remedy(s, id, "bath", "finish"));
    expect(dog(s, id)!.visit!.finishing).toBe("bath");
    expect(checkout(s, id, false).ok).toBe(false); // the owner is waiting for the bath to finish
    s = until(s, 16 * 60 + 25);
    expect(dog(s, id)).toBeUndefined(); // handed over when the bath finished
    const out = fac(s).outcomes.at(-1)!;
    expect(out.how).toBe("finished");
    expect(out.lines.find((l) => /^Bath( — deluxe tub \(\+\d+\))?$/.test(l.label))!.amount).toBe(bathPay(fac(s)));
    expect(s.coins - coins).toBe(out.total); // paid once, exactly the bill
    expect(out.complaints).toEqual([expect.objectContaining({ kind: "bath", remedy: "finish", resolved: true })]);
    expect(out.satisfaction).toBeGreaterThanOrEqual(70);
    expect(fac(s).guestBook[0]!.sat).toBe(out.satisfaction);
    expect(checkout(s, id, false).ok).toBe(false); // never twice
  });
  it("or a credit: the bath isn't charged, they're less unhappy, and the credit comes off their next visit", () => {
    let { s, id } = bookedWithBath();
    s = until(s, 16 * 60 + 1);
    const none = pickupView(s, id, false).assessment.satisfaction;
    s = ok(remedy(s, id, "bath", "credit"));
    s = ok(checkout(s, id, false));
    const out = fac(s).outcomes.at(-1)!;
    expect(out.satisfaction).toBe(Math.min(100, none + 12));
    expect(out.lines.find((l) => /^Bath/.test(l.label))!.amount).toBe(0);
    const reg = fac(s).guestBook[0]!;
    expect(reg.credit).toBe(Math.round(fac(s).prices.daycare / 2));
  });
  it("a generic apology doesn't erase a bath that wasn't done", () => {
    let { s, id } = bookedWithBath();
    s = until(s, 16 * 60 + 1);
    const none = pickupView(s, id, false).assessment.satisfaction;
    const r = remedy(s, id, "bath", "explain");
    expect(r.ok && r.msg).toMatch(/isn't enough|not enough/);
    s = ok(checkout(ok(r), id, false));
    const out = fac(s).outcomes.at(-1)!;
    expect(out.satisfaction).toBe(none);
    expect(out.complaints[0]).toMatchObject({ kind: "bath", remedy: "explain", resolved: false });
  });
  it("a prepaid bath not done: a refund pays the prepaid amount back, once", () => {
    let { s, id } = bookedWithBath(true);
    const paid = dog(s, id)!.visit!.paid;
    expect(paid).toBe(bathPay(fac(s)));
    s = until(cared(until(s, 15 * 60 + 55)), 16 * 60 + 1);
    expect(pickupView(s, id, false).assessment.complaints.map((c) => c.kind)).toEqual(["billing"]);
    s = ok(remedy(s, id, "billing", "refund"));
    expect(remedy(s, id, "billing", "refund").ok).toBe(false); // one remedy per complaint
    const coins = s.coins;
    s = ok(checkout(s, id, false));
    const out = fac(s).outcomes.at(-1)!;
    expect(out.lines.some((l) => /Refund/.test(l.label) && l.amount === -paid)).toBe(true);
    expect(s.coins - coins).toBe(out.total);
  });
});

describe("a visit that goes well", () => {
  it("picked up on time after playtime: delighted, a tip, no complaints", () => {
    let { s, id } = bookedWithBath();
    s = withFac(s, { ...fac(s), dogs: fac(s).dogs.map((d) => (d.id === id ? { ...d, visit: { ...d.visit!, requests: ["daycare"] } } : d)) });
    s = until(cared(until(s, 15 * 60 + 55)), 16 * 60 + 1);
    const coins = s.coins;
    const r = checkout(s, id, false);
    expect(r.ok && r.msg).toMatch(/delighted/);
    s = ok(r);
    const out = fac(s).outcomes.at(-1)!;
    expect(out.mood).toBe("delighted");
    expect(out.complaints).toEqual([]);
    expect(s.coins - coins).toBe(out.total);
  });
});

describe("owners don't wait forever, and nobody stays overnight by accident", () => {
  it("an owner left waiting an hour takes the pup and pays for what was done — the wait is held against you", () => {
    let { s, id } = bookedWithBath();
    s = withFac(s, { ...fac(s), dogs: fac(s).dogs.map((d) => (d.id === id ? { ...d, visit: { ...d.visit!, requests: ["daycare"] } } : d)) });
    s = until(cared(until(s, 16 * 60 + 50)), 17 * 60 + 5);
    expect(dog(s, id)).toBeUndefined();
    const out = fac(s).outcomes.at(-1)!;
    expect(out.how).toBe("left");
    expect(out.complaints).toEqual([expect.objectContaining({ kind: "wait", resolved: false })]);
  });
  it("at 18:00 every daycare pup goes home; boarders stay for their morning pickup", () => {
    let { s, id } = bookedWithBath();
    s = withFac(s, { ...fac(s), dogs: fac(s).dogs.map((d) => (d.id === id ? { ...d, visit: { ...d.visit!, pickup: 17 * 60 + 30 } } : d)) });
    s = ok(createArrival(at(s, 9 * 60), () => 0.95, true)); // a boarder
    const boarder = fac(s).dogs.at(-1)!.id;
    s = ok(checkIn(s, boarder)); // a checked-in boarder (a family ignored at the desk for hours would leave)
    s = nextDay(at(s, 17 * 60 + 50));
    expect(fac(s).day).toBe(2);
    expect(dog(s, id)).toBeUndefined();
    expect(dog(s, boarder)).toBeDefined();
    expect(fac(s).outcomes.some((o) => o.how === "dayend" || o.how === "left")).toBe(true);
  });
});
