// How a visit went, judged only from what happened: the receipt, complaints, satisfaction and mood
// (service design, "Satisfaction, receipt, complaints").
import { describe, expect, it } from "vitest";
import { bathPay } from "./business";
import { checkIn, createArrival, setOpen, toCalm, turnAway } from "./run";
import { fac, withFac } from "./state";
import { ok, richState } from "./testkit";
import { assessVisit } from "./assess";
import { defaultVisit } from "./visit";
import type { Facility, TDog, TycoonState, Visit } from "./types";

const base = (): Facility => ({ ...fac(richState()), clockMin: 16 * 60, cleanliness: 90 });
const playroom = (f: Facility) => f.rooms.find((r) => r.type === "playroom")!.uid;
function pup(f: Facility, over: Partial<TDog> = {}, visit: Partial<Visit> = {}): TDog {
  const d: TDog = { id: "a", name: "Biscuit", breed: 1, size: "small", temper: "gentle", visits: 1, place: { kind: "room", room: playroom(f) }, checkedIn: true, happiness: 85, clean: 80, boarding: false, played: 1, bathed: false, ...over };
  return { ...d, visit: { ...defaultVisit(f, d), ownerHere: 16 * 60, ...visit } };
}
const line = (a: ReturnType<typeof assessVisit>, re: RegExp) => a.lines.find((l) => re.test(l.label));

describe("a visit that went well", () => {
  it("daycare plus a finished bath: delighted, no complaints, an itemized bill with a tip", () => {
    const f = base();
    const d = pup(f, { bathed: true }, { requests: ["daycare", "bath"] });
    const a = assessVisit(f, d, {});
    expect(a.mood).toBe("delighted");
    expect(a.satisfaction).toBeGreaterThanOrEqual(80);
    expect(a.complaints).toEqual([]);
    expect(line(a, /^Daycare/)!.amount).toBe(Math.round(f.prices.daycare * (0.6 + 0.4 * 0.85)));
    expect(line(a, /^Bath$/)!.amount).toBe(bathPay(f));
    expect(a.total).toBe(a.lines.reduce((n, l) => n + l.amount, 0));
  });
});

describe("what goes wrong, and only when it did", () => {
  it("a booked bath not done: not charged, a bath complaint, satisfaction drops 25", () => {
    const f = base();
    const ok_ = assessVisit(f, pup(f, { bathed: true }, { requests: ["daycare", "bath"] }), {});
    const a = assessVisit(f, pup(f, {}, { requests: ["daycare", "bath"] }), {});
    expect(a.complaints.map((c) => c.kind)).toEqual(["bath"]);
    expect(line(a, /^Bath/)!.amount).toBe(0);
    expect(line(a, /^Bath/)!.label).toMatch(/not done/);
    expect(ok_.satisfaction - a.satisfaction).toBe(25);
  });
  it("still in the bath when the owner comes: the complaint says so", () => {
    const f = base();
    const a = assessVisit(f, pup(f, { bathing: 20 }, { requests: ["daycare", "bath"] }), {});
    expect(a.complaints[0]!.text).toMatch(/still in the bath/);
  });
  it("a prepaid bath not done is a billing complaint (they paid for it); never charged again", () => {
    const f = base();
    const a = assessVisit(f, pup(f, {}, { requests: ["daycare", "bath"], prepaid: ["bath"] }), {});
    expect(a.complaints.map((c) => c.kind)).toEqual(["billing"]);
    expect(line(a, /^Bath/)!.amount).toBe(0);
    const done = assessVisit(f, pup(f, { bathed: true }, { requests: ["daycare", "bath"], prepaid: ["bath"] }), {});
    expect(line(done, /^Bath/)!.label).toMatch(/prepaid/);
    expect(line(done, /^Bath/)!.amount).toBe(0);
  });
  it("an owner kept waiting 45 minutes complains about the wait", () => {
    const f = base();
    const a = assessVisit({ ...f, clockMin: 16 * 60 + 45 }, pup(f), {});
    expect(a.complaints.map((c) => c.kind)).toEqual(["wait"]);
    expect(a.complaints[0]!.text).toMatch(/45 minutes/);
  });
  it("checked in but never given a playroom: daycare not charged, an attention complaint", () => {
    const f = base();
    const a = assessVisit(f, pup(f, { place: { kind: "lobby" }, played: 0, happiness: 50 }), {});
    expect(line(a, /^Daycare/)!.amount).toBe(0);
    expect(line(a, /^Daycare/)!.label).toMatch(/not provided/);
    expect(a.complaints.map((c) => c.kind)).toContain("attention");
  });
  it("dirty rooms are noticed", () => {
    const f = { ...base(), cleanliness: 30 };
    expect(assessVisit(f, pup(f), {}).complaints.map((c) => c.kind)).toEqual(["dirty"]);
  });
});

describe("fair, not blanket", () => {
  it("kept safe in the calm room: no charge, no attention complaint, no penalty for missing playtime", () => {
    const f = base();
    const calm = f.rooms.find((r) => r.type === "calm")!.uid;
    const a = assessVisit(f, pup(f, { place: { kind: "calm", room: calm }, played: 0, happiness: 70 }, { safeMove: true }), {});
    expect(line(a, /^Daycare/)!.amount).toBe(0);
    expect(line(a, /^Daycare/)!.label).toMatch(/safe/);
    expect(a.complaints).toEqual([]);
    expect(a.mood).not.toBe("upset");
  });
  it("moving a pup to calm down marks the visit as a safety move", () => {
    let s: TycoonState = withFac(ok(setOpen(richState(), true)), { ...fac(richState()), open: true, clockMin: 9 * 60 });
    s = ok(createArrival(s, () => 0.9));
    const id = fac(s).dogs.at(-1)!.id;
    s = ok(checkIn(s, id));
    s = ok(toCalm(s, id));
    expect(fac(s).dogs.find((d) => d.id === id)!.visit!.safeMove).toBe(true);
  });
  it("turning a pup away before check-in: they go home, no charge, nothing held against you", () => {
    let s: TycoonState = withFac(ok(setOpen(richState(), true)), { ...fac(richState()), open: true, clockMin: 9 * 60 });
    s = ok(createArrival(s, () => 0.9));
    const id = fac(s).dogs.at(-1)!.id;
    const t = ok(turnAway(s, id));
    expect(fac(t).dogs.some((d) => d.id === id)).toBe(false);
    expect(t.coins).toBe(s.coins);
    expect(fac(t).reputation).toBe(fac(s).reputation);
    const checked = ok(checkIn(s, id));
    expect(turnAway(checked, id).ok).toBe(false);
  });
});
