// Audit finding 4: connection edge cases, with valid fixtures (everything placed through the real build rules).
import { describe, expect, it } from "vitest";
import { addDoor, buildConnectedRoom, buyLand, connectRoom, connectionPlan, firstFreeRoomPlan, moveRoom, moveThing, placeThing, removeDoor, sellRoom, sellThing } from "./build";
import { MAX_THINGS } from "./catalog";
import { connectedRooms } from "./connect";
import { doorOutside } from "./grid";
import { createArrival } from "./run";
import { quickStart } from "./start";
import { fac, newTycoon, withFac } from "./state";
import { ok, richState } from "./testkit";
import type { TDog, TPlace, TycoonState } from "./types";

const spent = (s: TycoonState) => fac(s).ledger.find((l) => l.day === fac(s).day)?.expenses.building ?? 0;
const started = (): TycoonState => ({ ...ok(quickStart(newTycoon(0))), coins: 50000, xp: 50 * 6 * 5, tour: null });
const room = (s: TycoonState, type: string) => fac(s).rooms.find((r) => r.type === type)!;

/** Fences placed through the real rules on owned, free squares until the daycare holds `target` things. */
function fillWithFences(s: TycoonState, target: number): TycoonState {
  for (let r = 16; r < 28 && fac(s).items.length < target; r++)
    for (let c = 0; c < 36 && fac(s).items.length < target; c++) {
      if (c >= 10 && c < 26) continue; // leave the starter lot (rooms, paths, routes) alone
      const t = placeThing(s, "fence", c, r, 0);
      if (t.ok) s = t.state;
    }
  return s;
}

/** A pup placed as the game would have it (checked in, at `place`). */
function pupAt(s: TycoonState, place: TPlace, extra: Partial<TDog> = {}): TycoonState {
  const f = fac(s);
  const d = fac(ok(createArrival(withFac(s, { ...f, open: true, clockMin: 9 * 60 }), () => 0.1))).dogs.at(-1)!;
  return withFac(s, { ...f, dogs: [...f.dogs, { ...d, checkedIn: place.kind !== "lobby" || !!extra.checkedIn, place, ...extra }] });
}

describe("A. a 2 × 2 room whose doorway is on the neighbour's wall", () => {
  it("Connect it restores a doorway on the neighbour's wall, for exactly the price shown", () => {
    let s = ok(buildConnectedRoom(started(), { c: 16, r: 20, w: 2, d: 2 }, "calm"));
    const small = fac(s).rooms.at(-1)!;
    const lobby = room(s, "lobby");
    const doorway = lobby.doors.find((d) => d.side === "N")!;
    expect(doorway).toBeTruthy(); // the small room's way in belongs to the lobby
    s = ok(removeDoor(s, lobby.uid, doorway)); // nobody inside: allowed
    expect(connectedRooms(fac(s)).has(small.uid)).toBe(false);
    const plan = connectionPlan(fac(s), small.uid);
    expect(plan).toMatchObject({ newDoor: true, cost: 30, doorOn: lobby.uid });
    const t = ok(connectRoom(s, small.uid, plan!));
    expect(connectedRooms(fac(t)).has(small.uid)).toBe(true);
    expect(spent(t) - spent(s)).toBe(30);
  });
  it("…but never as the neighbour's fifth door", () => {
    let s = ok(buildConnectedRoom(started(), { c: 16, r: 20, w: 2, d: 2 }, "calm"));
    const small = fac(s).rooms.at(-1)!;
    let lobby = room(s, "lobby");
    s = ok(removeDoor(s, lobby.uid, lobby.doors.find((d) => d.side === "N")!));
    // the lobby already has four doors (its own, valid positions)
    for (const d of [{ side: "S" as const, i: 1 }, { side: "E" as const, i: 1 }]) {
      lobby = room(s, "lobby");
      if (!lobby.doors.some((x) => x.side === d.side && x.i === d.i)) s = ok(addDoor(s, lobby.uid, d));
    }
    expect(room(s, "lobby").doors.length).toBe(4);
    const plan = connectionPlan(fac(s), small.uid);
    expect(plan === null || plan.doorOn !== room(s, "lobby").uid).toBe(true);
  });
});

describe("A2. a doorway on the neighbour's wall never makes a fifth way into the neighbour (review finding)", () => {
  it("the lobby owns three doors but four doorways open into it (the playroom's door counts): no new lobby doorway", () => {
    let s = ok(buildConnectedRoom(started(), { c: 16, r: 20, w: 2, d: 2 }, "calm"));
    const small = fac(s).rooms.at(-1)!;
    s = ok(removeDoor(s, room(s, "lobby").uid, room(s, "lobby").doors.find((d) => d.side === "N")!));
    s = ok(addDoor(s, room(s, "lobby").uid, { side: "S", i: 1 }));
    const lobby = room(s, "lobby");
    const into = (x: typeof lobby) => fac(s).rooms.filter((r) => r.uid !== x.uid).reduce((n, r) => n + r.doors.filter((d) => { const o = doorOutside(r, d); return o.c >= x.c && o.c < x.c + x.w && o.r >= x.r && o.r < x.r + x.d; }).length, 0);
    expect(lobby.doors.length).toBe(3);
    expect(lobby.doors.length + into(lobby)).toBe(4);
    expect(connectedRooms(fac(s)).has(small.uid)).toBe(false);
    const plan = connectionPlan(fac(s), small.uid);
    expect(plan === null || plan.doorOn !== lobby.uid).toBe(true);
  });
});

describe("B. a full daycare (200 things) still finds a spot that needs no new path squares", () => {
  it("doesn't give up on the first spot that would need path squares", () => {
    let s = started();
    s = ok(buyLand(s, "west"));
    s = ok(buyLand(s, "east"));
    s = fillWithFences(s, MAX_THINGS);
    expect(fac(s).items.length).toBe(MAX_THINGS);
    const q = firstFreeRoomPlan(fac(s), "bath");
    expect(q.ok).toBe(true);
    if (q.ok) expect(q.paths).toHaveLength(0);
  });
});

describe("C. never cutting off pups (lobby, calm room, boarding bed, in the bath)", () => {
  const rich = (): TycoonState => ({ ...richState(), coins: 50000 });
  it("a family waiting in the lobby: the entrance path and the lobby's door stay", () => {
    const s = pupAt(rich(), { kind: "lobby" });
    const path = fac(s).items.find((i) => i.kind === "path" && i.c === 18 && i.r === 26)!;
    expect(sellThing(s, path.uid).ok).toBe(false);
    expect(moveThing(s, path.uid, 11, 26, 0).ok).toBe(false);
    const lobby = room(s, "lobby");
    expect(removeDoor(s, lobby.uid, lobby.doors.find((d) => d.side === "S")!).ok).toBe(false);
  });
  it("a pup in the calm room: its way in through the lobby stays, and the lobby can't be sold or moved", () => {
    const calm = room(rich(), "calm");
    const s = pupAt(rich(), { kind: "calm", room: calm.uid });
    const lobby = room(s, "lobby");
    expect(removeDoor(s, lobby.uid, lobby.doors.find((d) => d.side === "W")!).ok).toBe(false);
    expect(sellRoom(s, lobby.uid).ok).toBe(false);
    expect(moveRoom(s, lobby.uid, lobby.c, lobby.r - 1).ok).toBe(false);
  });
  it("a boarder in its bed: the rooms on its way in stay connected", () => {
    const boarding = room(rich(), "boarding");
    const bed = fac(rich()).items.find((i) => i.kind === "boarding_bed" && i.room === boarding.uid)!;
    const s = pupAt(rich(), { kind: "bed", room: boarding.uid, bed: bed.uid } as TPlace, { boarding: true });
    expect(removeDoor(s, boarding.uid, boarding.doors[0]!).ok).toBe(false);
    const bath = room(s, "bath");
    expect(removeDoor(s, bath.uid, bath.doors.find((d) => d.side === "S")!).ok).toBe(false); // boarding is reached through it
    expect(sellRoom(s, bath.uid).ok).toBe(false);
  });
  it("a pup in the bath: the bath room can't be cut off, sold or moved", () => {
    const bath = room(rich(), "bath");
    const tub = fac(rich()).items.find((i) => i.room === bath.uid && /tub/.test(i.kind))!;
    const s = pupAt(rich(), { kind: "room", room: room(rich(), "playroom").uid }, { bathing: 20, bathTub: tub.uid });
    expect(removeDoor(s, bath.uid, bath.doors[0]!).ok).toBe(false);
    expect(sellRoom(s, bath.uid).ok).toBe(false);
    expect(moveRoom(s, bath.uid, bath.c, bath.r - 1).ok).toBe(false);
  });
});
