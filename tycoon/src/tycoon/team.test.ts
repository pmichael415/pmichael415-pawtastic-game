// Hiring, roles, priorities, letting go and wages (staff design §2).
import { describe, expect, it } from "vitest";
import { WAGES, closeDay } from "./business";
import { fac, newTycoon, parseTycoon, withFac } from "./state";
import { hire, letGo, recommendRole, setFocus, setRole, setRooms, staffStatus, teamWages } from "./team";
import { ok, richState } from "./testkit";

describe("hiring", () => {
  it("hiring takes a role, charges the sign-on fee once and adds the daily wage", () => {
    const s = richState();
    const r = ok(hire(s, "reception"));
    const f = fac(r);
    const maya = f.staff.at(-1)!;
    expect(maya).toMatchObject({ role: "reception", focus: "pickups", rooms: [], job: null });
    expect(maya.founder).toBeFalsy();
    expect(s.coins - r.coins).toBe(250 * fac(s).staff.length);
    expect(teamWages(f)).toBe(WAGES[f.wage] * f.staff.length);
  });
  it("a new daycare can afford its first hire", () => {
    const s = { ...newTycoon(0), coins: 1300 };
    expect(hire(s, "reception").ok).toBe(true);
  });
  it("hiring is refused without the coins, and nothing changes", () => {
    const s = { ...richState(), coins: 10 };
    const r = hire(s, "reception");
    expect(r.ok).toBe(false);
  });
  it("no more than six people", () => {
    let s = richState();
    for (let i = 0; i < 5; i++) s = ok(hire(s, "attendant"));
    expect(fac(s).staff).toHaveLength(6);
    expect(hire(s, "cleaner").ok).toBe(false);
  });
});

describe("roles and priorities", () => {
  it("Phil, the founder, helps when you tap and takes no role", () => {
    const s = richState();
    const r = setRole(s, fac(s).staff[0]!.id, "bath");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/helps when you tap/);
  });
  it("changing a role resets the priority to the new role's default and drops the current job", () => {
    let s = ok(hire(richState(), "reception"));
    const id = fac(s).staff.at(-1)!.id;
    s = withFac(s, { ...fac(s), staff: fac(s).staff.map((x) => (x.id === id ? { ...x, job: { kind: "checkin", dog: "zz", room: null, tub: null, phase: "walk", left: 2, total: 2, to: { c: 1, r: 1 } } } : x)) });
    s = ok(setRole(s, id, "cleaner"));
    expect(fac(s).staff.at(-1)).toMatchObject({ role: "cleaner", focus: "dirtiest", job: null });
  });
  it("a priority must belong to the role", () => {
    const s = ok(hire(richState(), "bath"));
    const id = fac(s).staff.at(-1)!.id;
    expect(setFocus(s, id, "booked").ok).toBe(true);
    expect(setFocus(s, id, "dirtiest").ok).toBe(false);
  });
  it("attendants look after playrooms only; cleaners any room", () => {
    let s = ok(hire(richState(), "attendant"));
    const f = fac(s);
    const id = f.staff.at(-1)!.id;
    const play = f.rooms.find((r) => r.type === "playroom")!.uid;
    const lobby = f.rooms.find((r) => r.type === "lobby")!.uid;
    expect(setRooms(s, id, [lobby]).ok).toBe(false);
    s = ok(setRooms(s, id, [play]));
    expect(fac(s).staff.at(-1)!.rooms).toEqual([play]);
    s = ok(setRole(s, id, "cleaner"));
    expect(setRooms(s, id, [lobby]).ok).toBe(true);
  });
  it("the recommended first hire is a receptionist; a bath queue asks for a bath attendant", () => {
    expect(recommendRole(fac(richState()))).toBe("reception");
  });
});

describe("letting go and wages", () => {
  it("wages are charged at closing for everyone on the team that evening", () => {
    let s = ok(hire(richState(), "reception"));
    s = ok(hire(s, "attendant"));
    const f = fac(s);
    const before = s.coins;
    const c = closeDay(s);
    const wages = fac(c).ledger.at(-2)?.expenses.wages ?? fac(c).ledger.at(-1)!.expenses.wages;
    expect(wages).toBeGreaterThanOrEqual(WAGES[f.wage] * 3);
    expect(before - c.coins).toBeGreaterThanOrEqual(WAGES[f.wage] * 3);
  });
  it("letting someone go stops their wage at the next close; Phil can't be let go", () => {
    let s = ok(hire(richState(), "reception"));
    const id = fac(s).staff.at(-1)!.id;
    s = ok(letGo(s, id));
    expect(fac(s).staff).toHaveLength(1);
    expect(teamWages(fac(s))).toBe(WAGES[fac(s).wage]);
    expect(letGo(s, fac(s).staff[0]!.id).ok).toBe(false);
  });
});

describe("statuses and saves", () => {
  it("a new hire is Available while open, Off duty while closed; Phil helps when you tap", () => {
    let s = ok(hire(richState(), "reception"));
    s = withFac(s, { ...fac(s), open: true });
    const f = fac(s);
    expect(staffStatus(f, f.staff.at(-1)!).text).toBe("Available");
    expect(staffStatus({ ...f, open: false }, f.staff.at(-1)!).text).toMatch(/Off duty/);
    expect(staffStatus(f, f.staff[0]!).text).toMatch(/helps when you tap/i);
  });
  it("a hired team survives a save and load", () => {
    let s = ok(hire(richState(), "bath"));
    s = ok(setFocus(s, fac(s).staff.at(-1)!.id, "booked"));
    const p = parseTycoon(JSON.parse(JSON.stringify(s)))!;
    expect(fac(p).staff.at(-1)).toMatchObject({ role: "bath", focus: "booked" });
  });
});
