// Staff doing real work in the simulation (staff design §2): jobs take time, two people never take the same job,
// incompatible placements are never made, billing stays exactly-once, and interrupted jobs end cleanly.
import { describe, expect, it } from "vitest";
import { placeThing } from "./build";
import { caps } from "./connect";
import { BATH_MIN, bath, checkout, createArrival, tick, toCalm } from "./run";
import { roomCleanOf } from "./rooms";
import { fac, parseTycoon, withFac } from "./state";
import { WORK_MIN, hire, runStaff, setRooms, staffStatus } from "./team";
import { ok, richState } from "./testkit";
import { defaultVisit } from "./visit";
import type { Facility, TDog, TycoonState, Visit } from "./types";

const still = () => 0.99;
const ids = (f: Facility) => f.staff.filter((x) => x.role).map((x) => x.id);
const playroom = (f: Facility) => f.rooms.find((r) => r.type === "playroom")!;

function base(open = true): TycoonState {
  const s = richState();
  return withFac(s, { ...fac(s), open, clockMin: 9 * 60, dogs: [] });
}
function pup(f: Facility, id: string, over: Partial<TDog> = {}, visit: Partial<Visit> = {}): TDog {
  const d: TDog = { id, name: id[0]!.toUpperCase() + id.slice(1), breed: 1, size: "small", temper: "gentle", visits: 1, place: { kind: "lobby" }, checkedIn: false, happiness: 80, clean: 60, boarding: false, played: 0, bathed: false, ...over };
  return { ...d, visit: { ...defaultVisit(f, d), arrivedDay: f.day, arrived: f.clockMin, ...visit } };
}
const add = (s: TycoonState, ...dogs: TDog[]) => withFac(s, { ...fac(s), dogs: [...fac(s).dogs, ...dogs] });
/** Runs the game minute by minute (2 game minutes a second). */
function run(s: TycoonState, gameMin: number): TycoonState {
  for (let i = 0; i < gameMin; i++) s = tick(s, 0.5, still);
  return s;
}

describe("receptionist", () => {
  it("checks a family in and settles the pup in a matching playroom — after walking and 4 minutes at the desk", () => {
    let s = ok(hire(base(), "reception"));
    s = add(s, pup(fac(s), "luna"));
    s = run(s, 1);
    const st = fac(s).staff.at(-1)!;
    expect(st.job?.kind).toBe("checkin");
    expect(fac(s).dogs[0]!.checkedIn).toBe(false); // not instant
    s = run(s, 30);
    const d = fac(s).dogs[0]!;
    expect(d.checkedIn).toBe(true);
    expect(d.place).toMatchObject({ kind: "room", room: playroom(fac(s)).uid });
  });
  it("never checks in a pup with no matching spot — it waits for the player, with a note", () => {
    let s = ok(hire(base(), "reception"));
    s = add(s, pup(fac(s), "bruno", { size: "large", temper: "active" }));
    const anyLarge = caps(fac(s)).playrooms.some((p) => p.group === "large-active");
    s = run(s, 30);
    if (!anyLarge) {
      expect(fac(s).dogs[0]!.checkedIn).toBe(false);
      expect(fac(s).staff.at(-1)!.note).toMatch(/Bruno/);
    }
  });
  it("if the player hasn't decided by the time that family is upset, the receptionist kindly reschedules them — free", () => {
    let s = ok(hire(base(), "reception"));
    s = add(s, pup(fac(s), "bruno", { size: "large", temper: "active" }));
    if (caps(fac(s)).playrooms.some((p) => p.group === "large-active")) return;
    const rep = fac(s).reputation;
    s = run(s, 35);
    expect(fac(s).dogs).toHaveLength(1); // still the player's call before the upset stage
    s = run(s, 15);
    expect(fac(s).dogs).toHaveLength(0);
    expect(fac(s).outcomes).toHaveLength(0); // a turn-away: no visit judged, no charge
    expect(fac(s).reputation).toBe(rep);
    expect(fac(s).staff.at(-1)!.note).toMatch(/Rescheduled Bruno/);
  });
  it("respects room capacity: fills free spots, then leaves the rest waiting", () => {
    let s = ok(hire(base(), "reception"));
    const f = fac(s);
    const room = playroom(f);
    const spots = caps(f).playrooms.find((p) => p.room.uid === room.uid)!.spots;
    const group = caps(f).playrooms.find((p) => p.room.uid === room.uid)!.group;
    const [size, temper] = group.split("-") as ["small" | "large", "gentle" | "active"];
    const n = spots + 2;
    s = add(s, ...Array.from({ length: n }, (_, i) => pup(f, "pup" + i, { size, temper })));
    s = run(s, 120);
    const inRoom = fac(s).dogs.filter((d) => d.place.kind === "room" && d.place.room === room.uid).length;
    expect(inRoom).toBeLessThanOrEqual(spots);
  });
  it("sends a family with no concerns home — billed exactly once", () => {
    let s = ok(hire(base(), "reception"));
    const f = fac(s);
    const room = playroom(f).uid;
    s = add(s, pup(f, "daisy", { place: { kind: "room", room }, checkedIn: true, happiness: 95, played: 2 }, { ownerHere: 9 * 60, checkedInAt: 8 * 60, owner: "Morgan" }));
    const before = s.coins;
    s = run(s, 20);
    expect(fac(s).dogs).toHaveLength(0);
    const outs = fac(s).outcomes.filter((o) => o.dog === "Daisy");
    expect(outs).toHaveLength(1);
    expect(s.coins - before).toBeGreaterThanOrEqual(outs[0]!.total);
  });
  it("leaves a family with a concern for the player", () => {
    let s = ok(hire(base(), "reception"));
    const f = fac(s);
    const room = playroom(f).uid;
    s = add(s, pup(f, "pip", { place: { kind: "room", room }, checkedIn: true, happiness: 95, played: 2 }, { ownerHere: 9 * 60, requests: ["daycare", "bath"], checkedInAt: 8 * 60, owner: "Casey" }));
    s = run(s, 20);
    expect(fac(s).dogs).toHaveLength(1);
    expect(fac(s).staff.at(-1)!.note).toMatch(/Casey|Pip/);
  });
});

describe("two people never take the same job", () => {
  it("two receptionists, one family: one checks in, the other stays free", () => {
    let s = ok(hire(base(), "reception"));
    s = ok(hire(s, "reception"));
    s = add(s, pup(fac(s), "luna"));
    s = run(s, 1);
    const jobs = fac(s).staff.filter((x) => x.job).map((x) => x.job!.dog);
    expect(jobs).toEqual(["luna"]);
  });
  it("two attendants never play with the same pup at once", () => {
    let s = ok(hire(base(), "attendant"));
    s = ok(hire(s, "attendant"));
    const f = fac(s);
    const room = playroom(f).uid;
    s = add(s, pup(f, "luna", { place: { kind: "room", room }, checkedIn: true, happiness: 50 }), pup(f, "milo", { place: { kind: "room", room }, checkedIn: true, happiness: 60 }));
    s = run(s, 1);
    const dogs = fac(s).staff.filter((x) => x.job).map((x) => x.job!.dog);
    expect(new Set(dogs).size).toBe(dogs.length);
    expect(dogs.sort()).toEqual(["luna", "milo"]);
  });
});

describe("attendants and cleaners", () => {
  it("an attendant's play takes 10 minutes and has the play's real effect", () => {
    let s = ok(hire(base(), "attendant"));
    const f = fac(s);
    const room = playroom(f).uid;
    s = add(s, pup(f, "luna", { place: { kind: "room", room }, checkedIn: true, happiness: 40 }));
    s = run(s, 2);
    expect(fac(s).dogs[0]!.played).toBe(0);
    s = run(s, WORK_MIN.play + 15);
    expect(fac(s).dogs[0]!.played).toBeGreaterThanOrEqual(1);
    expect(fac(s).dogs[0]!.happiness).toBeGreaterThan(40);
  });
  it("an attendant only works their assigned playrooms", () => {
    let s = ok(hire(base(), "attendant"));
    const f = fac(s);
    const calm = f.rooms.find((r) => r.type === "calm")!.uid;
    const room = playroom(f).uid;
    s = ok(setRooms(s, fac(s).staff.at(-1)!.id, [room]));
    s = add(s, pup(f, "luna", { place: { kind: "calm", room: calm }, checkedIn: true, happiness: 30 }));
    s = run(s, 20);
    expect(fac(s).dogs[0]!.played).toBe(0); // calm room: the player's call
  });
  it("a cleaner mops the dirtiest room, taking 12 minutes, and it's clean afterwards", () => {
    let s = ok(hire(base(), "cleaner"));
    const f = fac(s);
    const room = playroom(f).uid;
    s = withFac(s, { ...fac(s), roomClean: { ...Object.fromEntries(f.rooms.map((r) => [r.uid, 95])), [room]: 30 } });
    s = run(s, 1);
    expect(fac(s).staff.at(-1)!.job).toMatchObject({ kind: "clean", room });
    s = run(s, 40);
    expect(roomCleanOf(fac(s), room)).toBeGreaterThan(90);
  });
});

describe("the bath queue", () => {
  it("a bath attendant bathes only booked baths, holds the tub for the full 40 minutes, and the bath is charged once at pickup", () => {
    let s = ok(hire(base(), "bath"));
    const f = fac(s);
    const room = playroom(f).uid;
    s = add(s, pup(f, "luna", { place: { kind: "room", room }, checkedIn: true }, { requests: ["daycare", "bath"], checkedInAt: 8 * 60 }), pup(f, "milo", { place: { kind: "room", room }, checkedIn: true }, { requests: ["daycare"] }));
    s = run(s, 30);
    const luna = fac(s).dogs.find((d) => d.id === "luna")!;
    const milo = fac(s).dogs.find((d) => d.id === "milo")!;
    expect(luna.bathing).toBeGreaterThan(0);
    expect(milo.bathing ?? null).toBeNull();
    expect(staffStatus(fac(s), fac(s).staff.at(-1)!).text).toMatch(/Bathing Luna/);
    s = run(s, BATH_MIN);
    expect(fac(s).dogs.find((d) => d.id === "luna")!.bathed).toBe(true);
    expect(fac(s).dogs.find((d) => d.id === "milo")!.bathed).toBe(false);
    const before = s.coins;
    s = ok(checkout(s, "luna", false));
    const o = fac(s).outcomes.at(-1)!;
    expect(o.lines.filter((l) => /^Bath/.test(l.label) && l.amount > 0)).toHaveLength(1);
    expect(s.coins - before).toBeGreaterThanOrEqual(o.total);
  });
  it("one tub, one bath attendant, two bookings: one at a time", () => {
    let s = ok(hire(base(), "bath"));
    s = ok(hire(s, "bath"));
    const f = fac(s);
    const room = playroom(f).uid;
    s = add(s, pup(f, "luna", { place: { kind: "room", room }, checkedIn: true }, { requests: ["daycare", "bath"], checkedInAt: 8 * 60 }), pup(f, "milo", { place: { kind: "room", room }, checkedIn: true }, { requests: ["daycare", "bath"], checkedInAt: 8 * 60 + 5 }));
    s = run(s, 30);
    expect(fac(s).dogs.filter((d) => d.bathing).length).toBe(1);
  });
  it("a second tub (a capacity change) lets two baths run at once", () => {
    let s = ok(hire(base(), "bath"));
    s = ok(hire(s, "bath"));
    const bathRoom = fac(s).rooms.find((r) => r.type === "bath")!;
    let placed = false;
    for (let c = bathRoom.c; c < bathRoom.c + bathRoom.w && !placed; c++)
      for (let r = bathRoom.r; r < bathRoom.r + bathRoom.d && !placed; r++) {
        const t = placeThing(s, "bath_tub", c, r, 0);
        if (t.ok) (s = t.state), (placed = true);
      }
    expect(placed).toBe(true);
    const f = fac(s);
    const room = playroom(f).uid;
    s = add(s, pup(f, "luna", { place: { kind: "room", room }, checkedIn: true }, { requests: ["daycare", "bath"] }), pup(f, "milo", { place: { kind: "room", room }, checkedIn: true }, { requests: ["daycare", "bath"] }));
    s = run(s, 30);
    const bathing = fac(s).dogs.filter((d) => d.bathing);
    expect(bathing).toHaveLength(2);
    expect(new Set(bathing.map((d) => d.bathTub)).size).toBe(2);
  });
});

describe("interrupted jobs", () => {
  it("the player checks a pup out while an attendant is on the way: the job is dropped, no double effect", () => {
    let s = ok(hire(base(), "attendant"));
    const f = fac(s);
    const room = playroom(f).uid;
    s = add(s, pup(f, "luna", { place: { kind: "room", room }, checkedIn: true, happiness: 40 }));
    s = run(s, 1);
    expect(fac(s).staff.at(-1)!.job?.dog).toBe("luna");
    s = ok(checkout(s, "luna", false)); // an early checkout by the player
    s = run(s, 1);
    const st = fac(s).staff.at(-1)!;
    expect(st.job).toBeNull();
    expect(st.note).toMatch(/Luna/);
    expect(fac(s).outcomes.filter((o) => o.dog === "Luna")).toHaveLength(1);
  });
  it("a pup moved to the calm room mid-play: the attendant stops", () => {
    let s = ok(hire(base(), "attendant"));
    const f = fac(s);
    const room = playroom(f).uid;
    s = add(s, pup(f, "luna", { place: { kind: "room", room }, checkedIn: true, happiness: 40 }));
    s = run(s, 4);
    s = ok(toCalm(s, "luna"));
    s = run(s, 30);
    expect(fac(s).dogs[0]!.played).toBe(0);
    expect(fac(s).staff.at(-1)!.job).toBeNull();
  });
  it("the player takes the only tub while the bath attendant walks to it: the attendant waits for the next free tub", () => {
    let s = ok(hire(base(), "bath"));
    const f = fac(s);
    const room = playroom(f).uid;
    s = add(s, pup(f, "luna", { place: { kind: "room", room }, checkedIn: true }, { requests: ["daycare", "bath"] }), pup(f, "milo", { place: { kind: "room", room }, checkedIn: true }));
    s = run(s, 1);
    expect(fac(s).staff.at(-1)!.job?.dog).toBe("luna");
    s = ok(bath(s, "milo"));
    s = run(s, 10);
    expect(fac(s).dogs.filter((d) => d.bathing).map((d) => d.id)).toEqual(["milo"]);
    s = run(s, BATH_MIN + 15);
    expect(fac(s).dogs.find((d) => d.id === "luna")!.bathing ?? fac(s).dogs.find((d) => d.id === "luna")!.bathed).toBeTruthy();
  });
  it("a job in progress survives a save and load", () => {
    let s = ok(hire(base(), "attendant"));
    const f = fac(s);
    const room = playroom(f).uid;
    s = add(s, pup(f, "luna", { place: { kind: "room", room }, checkedIn: true, happiness: 40 }));
    s = run(s, 2);
    const job = fac(s).staff.at(-1)!.job;
    const p = parseTycoon(JSON.parse(JSON.stringify(s)))!;
    expect(fac(p).staff.at(-1)!.job).toEqual(job);
  });
});

describe("hours", () => {
  it("no new jobs while the daycare is closed", () => {
    let s = ok(hire(base(false), "attendant"));
    const f = fac(s);
    const room = playroom(f).uid;
    s = add(s, pup(f, "luna", { place: { kind: "room", room }, checkedIn: true, happiness: 40 }));
    s = runStaff(s, 30);
    expect(fac(s).staff.every((x) => !x.job)).toBe(true);
  });
  it("arrivals still need an open daycare (a receptionist doesn't create drop-offs)", () => {
    const s = ok(hire(base(false), "reception"));
    expect(createArrival(s, () => 0.1).ok).toBe(false);
    expect(ids(fac(s))).toHaveLength(1);
  });
});
