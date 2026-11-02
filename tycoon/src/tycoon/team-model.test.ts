// Staff roles, jobs, bath stations and room cleanliness in the save — and old saves loading cleanly (staff design §2–3).
import { describe, expect, it } from "vitest";
import { caps } from "./connect";
import { fac, newTycoon, parseTycoon, withFac } from "./state";
import { richState } from "./testkit";
import type { TStaff } from "./types";

const roundTrip = <T,>(x: T) => parseTycoon(JSON.parse(JSON.stringify(x)))!;

describe("old saves", () => {
  it("a save from before roles: Phil is the founder, everyone has no role and no job", () => {
    const s = richState();
    const f = fac(s);
    const old = { ...s, facilities: { f1: { ...f, staff: [{ id: "s0", name: "Phil", energy: 70 }, { id: "s4", name: "Maya", energy: 90 }] } } };
    const p = fac(roundTrip(old));
    expect(p.staff[0]).toMatchObject({ id: "s0", founder: true, role: null, job: null });
    expect(p.staff[1]).toMatchObject({ id: "s4", role: null, rooms: [], job: null });
    expect(p.staff[1]!.founder).toBeFalsy();
  });
  it("rooms get their own cleanliness, starting from the old daycare-wide value", () => {
    const s = richState();
    const f = fac(s);
    const p = fac(roundTrip({ ...s, facilities: { f1: { ...f, cleanliness: 62, roomClean: undefined } } }));
    for (const r of p.rooms) expect(p.roomClean![r.uid]).toBe(62);
  });
  it("a pup already in the bath gets a tub to stand in", () => {
    const s = richState();
    const f = fac(s);
    const room = f.rooms.find((r) => r.type === "playroom")!.uid;
    const pup = { id: "d1", name: "Luna", breed: 1, size: "small", temper: "gentle", visits: 1, place: { kind: "room", room }, checkedIn: true, happiness: 70, clean: 50, boarding: false, played: 1, bathed: false, bathing: 20 };
    const p = fac(roundTrip({ ...s, facilities: { f1: { ...f, dogs: [pup] } } }));
    const tub = caps(p).tubs[0]!;
    expect(p.dogs[0]!.bathTub).toBe(tub.uid);
  });
});

describe("new fields survive a save and load", () => {
  it("roles, rooms, focus, a job in progress and where they stand", () => {
    const s = richState();
    const f = fac(s);
    const room = f.rooms.find((r) => r.type === "playroom")!.uid;
    const maya: TStaff = { id: "s9", name: "Maya", energy: 80, role: "attendant", rooms: [room], focus: "newest", job: { kind: "clean", dog: null, room, tub: null, phase: "walk", left: 3, total: 12, to: { c: 12, r: 23 } }, at: { c: 10, r: 24 }, note: null };
    const p = fac(roundTrip(withFac(s, { ...f, staff: [...f.staff, maya] })));
    expect(p.staff[1]).toMatchObject({ role: "attendant", rooms: [room], focus: "newest", job: { kind: "clean", room, phase: "walk", left: 3 }, at: { c: 10, r: 24 } });
  });
  it("broken or stale values are dropped, not trusted", () => {
    const s = richState();
    const f = fac(s);
    const bad = { id: "s9", name: "Maya", energy: 80, role: "chef", rooms: ["nope"], focus: "speed", job: { kind: "play", dog: "ghost", room: null, tub: null, phase: "work", left: 5, total: 10, to: { c: 1, r: 1 } } };
    const p = fac(roundTrip({ ...s, facilities: { f1: { ...f, staff: [...f.staff, bad] } } }));
    expect(p.staff[1]).toMatchObject({ role: null, rooms: [], job: null });
  });
  it("a founder never keeps a role", () => {
    const s = richState();
    const f = fac(s);
    const p = fac(roundTrip(withFac(s, { ...f, staff: [{ ...f.staff[0]!, founder: true, role: "reception" }] })));
    expect(p.staff[0]).toMatchObject({ founder: true, role: null });
  });
});

describe("bath stations", () => {
  it("caps lists every working tub as a station", () => {
    const c = caps(fac(richState()));
    expect(c.tubs.length).toBeGreaterThanOrEqual(1);
    expect(c.tubs[0]).toMatchObject({ kind: "deluxe" });
  });
  it("a new daycare's founder is marked", () => {
    expect(fac(newTycoon(0)).staff[0]).toMatchObject({ name: "Phil", founder: true });
  });
});
