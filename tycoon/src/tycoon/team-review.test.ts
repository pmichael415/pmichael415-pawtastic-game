// Fixes from the independent review of the staff and expansion work (each test reproduces one finding).
import { describe, expect, it } from "vitest";
import { placeThing, sellRoom, setClosed } from "./build";
import { caps } from "./connect";
import { EXPANSION_LEVEL, buyExpansion, expansionOptions } from "./expansion";
import { xpForLevel } from "./progress";
import { tick } from "./run";
import { quickStart } from "./start";
import { fac, newTycoon, parseTycoon, withFac } from "./state";
import { hire, setRooms } from "./team";
import { ok, richState } from "./testkit";
import { defaultVisit } from "./visit";
import type { Facility, TDog, TycoonState, Visit } from "./types";

const still = () => 0.99;
const run = (s: TycoonState, min: number) => {
  for (let i = 0; i < min; i++) s = tick(s, 0.5, still);
  return s;
};
const playroom = (f: Facility) => f.rooms.find((r) => r.type === "playroom")!;
function pup(f: Facility, id: string, over: Partial<TDog> = {}, visit: Partial<Visit> = {}): TDog {
  const d: TDog = { id, name: id[0]!.toUpperCase() + id.slice(1), breed: 1, size: "small", temper: "gentle", visits: 1, place: { kind: "room", room: playroom(f).uid }, checkedIn: true, happiness: 80, clean: 60, boarding: false, played: 1, bathed: false, ...over };
  return { ...d, visit: { ...defaultVisit(f, d), ...visit } };
}

describe("I1: the bath attendant doesn't start a bath the family would have to wait for", () => {
  it("not while the family is already here for pickup — that's the player's call (a 'needs you' note)", () => {
    let s = ok(hire(richState(), "bath"));
    const f = fac(s);
    s = withFac(s, { ...f, open: true, clockMin: 15 * 60 + 10, dogs: [pup(f, "luna", {}, { requests: ["daycare", "bath"], ownerHere: 15 * 60, owner: "Taylor" })] });
    s = run(s, 10);
    expect(fac(s).dogs[0]?.bathing ?? null).toBeNull();
    expect(fac(s).staff.at(-1)!.note).toMatch(/Taylor/);
  });
  it("not one that can't finish before closing", () => {
    let s = ok(hire(richState(), "bath"));
    const f = fac(s);
    s = withFac(s, { ...f, open: true, clockMin: 17 * 60 + 30, dogs: [pup(f, "luna", {}, { requests: ["daycare", "bath"] })] });
    s = run(s, 5);
    expect(fac(s).dogs[0]?.bathing ?? null).toBeNull();
  });
});

describe("I2: the expansion price is never stale", () => {
  it("closing the bath room changes the option (open it again, free — never a duplicate), and after reopening, buying spends exactly what the card says", () => {
    let s = { ...richState(), coins: 20000, xp: xpForLevel(EXPANSION_LEVEL) + 10000 };
    const before = expansionOptions(s).find((o) => o.id === "bath")!;
    const bath = fac(s).rooms.find((r) => r.type === "bath")!.uid;
    s = ok(setClosed(s, bath, true));
    const after = expansionOptions(s).find((o) => o.id === "bath")!;
    expect(after.mode).not.toBe(before.mode);
    expect(after.available).toBe(false);
    expect(after.why).toMatch(/open it again/);
    const spent = (x: TycoonState) => fac(x).ledger.find((l) => l.day === fac(x).day)?.expenses.building ?? 0;
    expect(buyExpansion(s, "bath").ok).toBe(false);
    s = ok(setClosed(s, bath, false));
    const reopened = expansionOptions(s).find((o) => o.id === "bath")!;
    expect(reopened.mode).toBe(before.mode);
    const r = ok(buyExpansion(s, "bath"));
    expect(spent(r) - spent(s)).toBe(reopened.cost);
  });
});

describe("I3: 'improve' never sells a bed that adds no spot", () => {
  it("once the playrooms are at their maximum, it adds a toy and says so", () => {
    let s: TycoonState = { ...ok(quickStart(newTycoon(0))), coins: 20000, tour: null };
    s = { ...s, xp: Math.max(s.xp, xpForLevel(EXPANSION_LEVEL)) };
    s = ok(buyExpansion(s, "playroom"));
    for (let i = 0; i < 12; i++) {
      const o = expansionOptions(s).find((x) => x.id === "playroom")!;
      if (!o.available) break;
      const spots = caps(fac(s)).playrooms.reduce((a, p) => a + p.spots, 0);
      const r = ok(buyExpansion(s, "playroom"));
      const gained = caps(fac(r)).playrooms.reduce((a, p) => a + p.spots, 0) - spots;
      if (/\+1 spot/.test(o.capacity)) expect(gained).toBe(1);
      else expect(gained).toBe(0);
      s = r;
    }
    const max = caps(fac(s)).playrooms.every((p) => p.spots >= Math.floor((p.room.w * p.room.d) / 2));
    if (max) expect(expansionOptions(s).find((x) => x.id === "playroom")!.capacity).not.toMatch(/\+1 spot/);
  });
});

describe("I4: a save from before staff roles never makes a waiting family leave on load", () => {
  it("a family that had been at the desk for 90 minutes in an older save is still there after loading", () => {
    const s = richState();
    const f = fac(s);
    const d = pup(f, "pepper", { place: { kind: "lobby" }, checkedIn: false, played: 0 }, { arrivedDay: f.day, arrived: 9 * 60 });
    const older = JSON.parse(JSON.stringify({ ...s, facilities: { f1: { ...f, open: true, clockMin: 10 * 60 + 30, dogs: [d], staff: [{ id: "s0", name: "Phil", energy: 100 }] } } }));
    let p = parseTycoon(older)!;
    p = run(p, 3);
    expect(fac(p).dogs).toHaveLength(1);
    expect(fac(p).outcomes).toHaveLength(0);
  });
});

describe("I5: staff whose assigned room is sold go back to all rooms", () => {
  it("an attendant assigned only to a sold playroom keeps playing with pups elsewhere", () => {
    let s = { ...richState(), coins: 20000 };
    // a second playroom to assign, then sell
    const bathRoom = fac(s).rooms.find((r) => r.type === "bath")!;
    void bathRoom;
    s = ok(buyExpansion({ ...s, xp: xpForLevel(EXPANSION_LEVEL) + 10000 }, "playroom"));
    const wing = fac(s).rooms.filter((r) => r.type === "playroom").at(-1)!.uid;
    s = ok(hire(s, "attendant"));
    s = ok(setRooms(s, fac(s).staff.at(-1)!.id, [wing]));
    s = ok(sellRoom(s, wing));
    const f = fac(s);
    s = withFac(s, { ...f, open: true, clockMin: 10 * 60, dogs: [pup(f, "luna", { happiness: 50, played: 0 })] });
    s = run(s, 25);
    expect(fac(s).dogs[0]!.played).toBeGreaterThanOrEqual(1);
  });
});

export const _unused = placeThing;
