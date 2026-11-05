// Running a new room (empire milestone §6): after you build it, its panel says who looks after it — with one tap to
// give that job to someone free or hire for it — and what it does for families.
import { describe, expect, it } from "vitest";
import { applyStaffPlan, roomReadiness, roomServes, staffPlanFor } from "./roomCare";
import { buildConnectedRoom, placeInRoom } from "./build";
import { buyExpansion } from "./expansion";
import { xpForLevel } from "./progress";
import { quickStart } from "./start";
import { fac, newTycoon } from "./state";
import { hire, setRole, setRooms } from "./team";
import { hireStaff } from "./run";
import { ok } from "./testkit";
import type { TycoonState } from "./types";

const grown = (): TycoonState => ({ ...ok(quickStart(newTycoon(0))), coins: 20000, xp: xpForLevel(5), tour: null });
const room = (s: TycoonState, type: string, i = 0) => fac(s).rooms.filter((r) => r.type === type)[i]!;

describe("who looks after a room", () => {
  it("a new bath room with nobody to run it: hire a bath attendant, for the sign-on shown", () => {
    const s = ok(buyExpansion(grown(), "bath"));
    const plan = staffPlanFor(fac(s), room(s, "bath"));
    expect(plan).toMatchObject({ kind: "hire", role: "bath", label: expect.stringMatching(/^Hire a bath attendant · \d/) });
    const r = ok(applyStaffPlan(s, plan));
    expect(fac(r).staff.some((x) => x.role === "bath")).toBe(true);
    expect(staffPlanFor(fac(r), room(r, "bath"))).toMatchObject({ kind: "covered", text: expect.stringMatching(/runs the baths/) });
  });
  it("someone on the team without a role gets the job instead of a new hire", () => {
    let s = ok(buyExpansion(grown(), "bath"));
    s = ok(hireStaff(s));
    const free = fac(s).staff.at(-1)!;
    const plan = staffPlanFor(fac(s), room(s, "bath"));
    expect(plan).toMatchObject({ kind: "assign", staffId: free.id, role: "bath", label: `Make ${free.name} your bath attendant` });
    const coins = s.coins;
    const r = ok(applyStaffPlan(s, plan));
    expect(r.coins).toBe(coins);
    expect(fac(r).staff.find((x) => x.id === free.id)!.role).toBe("bath");
  });
  it("a second playroom: the attendant who looks after only the first one adds it", () => {
    let s = ok(hire(grown(), "attendant"));
    const att = fac(s).staff.at(-1)!;
    s = ok(setRooms(s, att.id, [room(s, "playroom").uid]));
    s = ok(buyExpansion(s, "playroom"));
    const second = room(s, "playroom", 1);
    const plan = staffPlanFor(fac(s), second);
    expect(plan).toMatchObject({ kind: "assign", staffId: att.id, label: `Add it to ${att.name}'s rooms` });
    const r = ok(applyStaffPlan(s, plan));
    expect(fac(r).staff.find((x) => x.id === att.id)!.rooms).toEqual([room(s, "playroom").uid, second.uid]);
    expect(staffPlanFor(fac(r), second).kind).toBe("covered");
  });
  it("an attendant for every playroom covers a new one already; a calm room needs nobody", () => {
    let s = ok(hire(grown(), "attendant"));
    s = ok(buyExpansion(s, "playroom"));
    expect(staffPlanFor(fac(s), room(s, "playroom", 1)).kind).toBe("covered");
    expect(staffPlanFor(fac(s), room(s, "calm")).kind).toBe("none");
  });
  it("a bath attendant already on the team covers the bath; a full team can't hire", () => {
    let s = ok(buyExpansion(grown(), "bath"));
    s = ok(hireStaff(s));
    s = ok(setRole(s, fac(s).staff.at(-1)!.id, "bath"));
    expect(staffPlanFor(fac(s), room(s, "bath")).kind).toBe("covered");
  });
});

describe("what a room does for families", () => {
  it("names the service and how much of it", () => {
    const s = ok(buyExpansion(grown(), "bath"));
    expect(roomServes(fac(s), room(s, "bath"))).toMatch(/^1 tub — families who book a bath or an exit bath get one here/);
    expect(roomServes(fac(s), room(s, "playroom"))).toMatch(/^\d+ spots for Small & Gentle pups/);
  });
});

describe("a room's four states, told apart (milestone §3)", () => {
  it("built by hand: connected but not furnished, so not operating; furnished: operating, run by you; staffed: run by them; serving pups by name", () => {
    let s: TycoonState = { ...grown(), coins: 20000 };
    s = ok(buildConnectedRoom(s, { c: 11, r: 17, w: 3, d: 3 }, "bath"));
    const uid = fac(s).rooms.at(-1)!.uid;
    let st = roomReadiness(fac(s), fac(s).rooms.find((r) => r.uid === uid)!);
    expect(st.map((x) => x.step)).toEqual(["connected", "furnished", "staffed", "operating"]);
    expect(st[0]).toMatchObject({ done: true });
    expect(st[1]).toMatchObject({ done: false, text: expect.stringMatching(/tub/i) });
    expect(st[3]).toMatchObject({ done: false });
    s = ok(placeInRoom(s, uid, "bath_tub"));
    st = roomReadiness(fac(s), fac(s).rooms.find((r) => r.uid === uid)!);
    expect(st[1]!.done).toBe(true);
    expect(st[2]).toMatchObject({ done: false, text: expect.stringMatching(/you/i) }); // you run it yourself until someone does
    expect(st[3]!.done).toBe(true);
    s = ok(applyStaffPlan(s, staffPlanFor(fac(s), fac(s).rooms.find((r) => r.uid === uid)!)));
    st = roomReadiness(fac(s), fac(s).rooms.find((r) => r.uid === uid)!);
    expect(st[2]!.done).toBe(true);
  });
  it("operating says which pups it is serving now", () => {
    const s = ok(buyExpansion(grown(), "playroom"));
    const play = fac(s).rooms.at(-1)!;
    const dog = { id: "dx", name: "Juno", breed: 1, size: "large" as const, temper: "active" as const, visits: 1, place: { kind: "room" as const, room: play.uid }, checkedIn: true, happiness: 80, clean: 80, boarding: false, played: 1, bathed: false };
    const f = { ...fac(s), dogs: [dog] };
    const st = roomReadiness(f, play);
    expect(st[3]).toMatchObject({ done: true, text: expect.stringMatching(/Juno/) });
  });
});
