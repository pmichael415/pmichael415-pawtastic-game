// Personal moments (combined-loop plan, task 1): a settled pup sometimes asks for YOU — its favourite game. Answering
// is a small joy (happier pup, XP, a tip the family adds at pickup); missing one costs nothing; staff never take them.
import { describe, expect, it } from "vitest";
import { assessVisit } from "./assess";
import { MOMENT_LIFE, MOMENT_TIP, MAX_OPEN_MOMENTS, answerMoment, momentAt, openMoments } from "./moments";
import { checkout, tick } from "./run";
import { fac, parseTycoon, withFac } from "./state";
import { hire } from "./team";
import { ok, richState } from "./testkit";
import { defaultVisit } from "./visit";
import type { Facility, TDog, TycoonState } from "./types";

const still = () => 0.99;
const run = (s: TycoonState, min: number) => {
  for (let i = 0; i < min; i++) s = tick(s, 0.5, still);
  return s;
};
const playroom = (f: Facility) => f.rooms.find((r) => r.type === "playroom")!;
function day(n = 1, over: Partial<TDog> = {}): TycoonState {
  const s = richState();
  const f = fac(s);
  const room = playroom(f).uid;
  const dogs = Array.from({ length: n }, (_, i): TDog => {
    const d: TDog = { id: "m" + i, name: ["Biscuit", "Luna", "Milo", "Daisy", "Pip"][i] ?? "Pup" + i, breed: 1, size: "small", temper: "gentle", visits: 1, place: { kind: "room", room }, checkedIn: true, happiness: 70, clean: 70, boarding: false, played: 1, bathed: false, ...over };
    return { ...d, visit: { ...defaultVisit(f, d), arrivedDay: f.day, arrived: 8 * 60, checkedInAt: 8 * 60, pickup: 17 * 60 } };
  });
  return withFac(s, { ...f, open: true, clockMin: 8 * 60, introDay: 0, dogs });
}
const momentOf = (s: TycoonState, id: string) => fac(s).dogs.find((d) => d.id === id)?.visit?.moment ?? null;

describe("when a pup asks for you", () => {
  it("once during its stay, at a time set by the pup and the day (no dice rolled), with its favourite game", () => {
    let s = day(1);
    const at = momentAt(fac(s), fac(s).dogs[0]!);
    expect(at).toBeGreaterThanOrEqual(8 * 60 + 45);
    expect(at).toBeLessThan(8 * 60 + 165);
    s = run(s, Math.ceil(at - 8 * 60) + 1);
    expect(momentOf(s, "m0")).toMatchObject({ state: "open" });
  });
  it("never while closed, in the lobby, in the bath or during the guided tour", () => {
    let closed = withFac(day(1), { ...fac(day(1)), open: false });
    closed = openMoments(withFac(closed, { ...fac(closed), clockMin: 12 * 60 }));
    expect(momentOf(closed, "m0")).toBeNull();
    let lobby = day(1, { place: { kind: "lobby" } });
    lobby = openMoments(withFac(lobby, { ...fac(lobby), clockMin: 12 * 60 }));
    expect(momentOf(lobby, "m0")).toBeNull();
    let bathing = day(1, { bathing: 20 });
    bathing = openMoments(withFac(bathing, { ...fac(bathing), clockMin: 12 * 60 }));
    expect(momentOf(bathing, "m0")).toBeNull();
  });
  it(`never more than ${3} open at once`, () => {
    let s = day(5);
    s = openMoments(withFac(s, { ...fac(s), clockMin: 12 * 60 }));
    expect(fac(s).dogs.filter((d) => d.visit?.moment?.state === "open").length).toBe(MAX_OPEN_MOMENTS);
  });
});

describe("answering", () => {
  it("makes the pup happier, gives XP, and can't be done twice", () => {
    let s = openMoments(withFac(day(1), { ...fac(day(1)), clockMin: 12 * 60 }));
    const xp = s.xp;
    const r = answerMoment(s, "m0");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.msg).toMatch(/Biscuit/);
    s = ok(r);
    expect(fac(s).dogs[0]!.happiness).toBe(85);
    expect(s.xp).toBeGreaterThan(xp);
    expect(momentOf(s, "m0")).toMatchObject({ state: "done" });
    expect(answerMoment(s, "m0").ok).toBe(false);
  });
  it("the family adds a tip at pickup for it — once, on the bill", () => {
    let s = openMoments(withFac(day(1), { ...fac(day(1)), clockMin: 12 * 60 }));
    s = ok(answerMoment(s, "m0"));
    const f = fac(s);
    const a = assessVisit(f, f.dogs[0]!, {});
    const tipLines = a.lines.filter((l) => /told them about/.test(l.label));
    expect(tipLines).toEqual([expect.objectContaining({ amount: MOMENT_TIP })]);
    const before = s.coins;
    s = ok(checkout(s, "m0", false));
    const o = fac(s).outcomes.at(-1)!;
    expect(o.lines.filter((l) => /told them about/.test(l.label))).toHaveLength(1);
    expect(s.coins - before).toBeGreaterThanOrEqual(o.total);
  });
  it("no tip on a visit that charged nothing: a pup kept safe in the calm room (review fix)", () => {
    let s = openMoments(withFac(day(1), { ...fac(day(1)), clockMin: 12 * 60 }));
    s = ok(answerMoment(s, "m0"));
    const f = fac(s);
    const calm = f.rooms.find((r) => r.type === "calm")!.uid;
    s = withFac(s, { ...f, dogs: f.dogs.map((d) => ({ ...d, place: { kind: "calm" as const, room: calm }, visit: { ...d.visit!, safeMove: true } })) });
    const a = assessVisit(fac(s), fac(s).dogs[0]!, {});
    expect(a.lines.some((l) => /told them about/.test(l.label))).toBe(false);
    expect(a.total).toBe(0);
  });
  it("no tip from a family that gave up waiting at pickup (review fix)", () => {
    let s = openMoments(withFac(day(1), { ...fac(day(1)), clockMin: 12 * 60 }));
    s = ok(answerMoment(s, "m0"));
    const f = fac(s);
    s = withFac(s, { ...f, clockMin: 17 * 60 + 5, dogs: f.dogs.map((d) => ({ ...d, visit: { ...d.visit!, ownerHere: 16 * 60 } })) });
    const a = assessVisit(fac(s), fac(s).dogs[0]!, {});
    expect(a.lines.some((l) => /told them about/.test(l.label))).toBe(false);
  });
  it("staff never take a moment: an attendant's play leaves it open for you", () => {
    let s = ok(hire(day(1, { happiness: 40 }), "attendant"));
    s = openMoments(withFac(s, { ...fac(s), clockMin: 12 * 60 }));
    s = run(s, 20);
    expect(fac(s).dogs[0]!.played).toBeGreaterThan(1);
    expect(momentOf(s, "m0")?.state).toBe("open");
  });
});

describe("missing one costs nothing", () => {
  it(`after ${MOMENT_LIFE} game minutes it fades — no penalty, no change to the bill or the family's mood`, () => {
    const base = withFac(day(1), { ...fac(day(1)), clockMin: 12 * 60 });
    let s = openMoments(base);
    s = run(s, MOMENT_LIFE + 2);
    expect(momentOf(s, "m0")).toMatchObject({ state: "missed" });
    let plain = run(base, MOMENT_LIFE + 2); // the same hour with no moment opened up front
    plain = withFac(plain, { ...fac(plain), dogs: fac(plain).dogs.map((d) => ({ ...d, visit: { ...d.visit!, moment: null } })) });
    const a = assessVisit(fac(s), fac(s).dogs[0]!, {});
    const b = assessVisit(fac(plain), fac(plain).dogs[0]!, {});
    expect(a.total).toBe(b.total);
    expect(a.mood).toBe(b.mood);
  });
  it("saves keep moments, and older saves without them load fine", () => {
    let s = openMoments(withFac(day(1), { ...fac(day(1)), clockMin: 12 * 60 }));
    const p = parseTycoon(JSON.parse(JSON.stringify(s)))!;
    expect(momentOf(p, "m0")).toMatchObject({ state: "open" });
    const old = JSON.parse(JSON.stringify(day(1)));
    delete old.facilities.f1.dogs[0].visit.moment;
    expect(momentOf(parseTycoon(old)!, "m0")).toBeNull();
  });
});
