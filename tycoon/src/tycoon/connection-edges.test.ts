// Audit finding 4: connection edge cases, with valid fixtures (everything placed through the real build rules).
import { describe, expect, it } from "vitest";
import { addDoor, buildConnectedRoom, buyLand, connectRoom, connectionPlan, drawRoom, firstFreeRoomPlan, moveRoom, moveThing, placeThing, planRoom, removeDoor, sellRoom, sellThing } from "./build";
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
    // the lobby at its limit: three doors of its own plus the playroom's doorway into it are four ways in (this fixture
    // used to add a fourth own door as well — five ways in, which the rules now refuse: audit gap C)
    s = ok(addDoor(s, room(s, "lobby").uid, { side: "S", i: 1 }));
    lobby = room(s, "lobby");
    expect(lobby.doors.length).toBe(3);
    expect(addDoor(s, lobby.uid, { side: "E", i: 1 }).ok).toBe(false); // a fifth way in is refused
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

describe("A3. a room's own new doorway never makes a fifth way into the room it opens into (audit gap C)", () => {
  /** Every doorway into a room: its own doors plus doors of other rooms whose outside square is inside it. */
  const ways = (s: TycoonState, uid: string) => {
    const f = fac(s);
    const x = f.rooms.find((r) => r.uid === uid)!;
    return x.doors.length + f.rooms.filter((r) => r.uid !== uid).reduce((n, r) => n + r.doors.filter((d) => { const o = doorOutside(r, d); return o.c >= x.c && o.c < x.c + x.w && o.r >= x.r && o.r < x.r + x.d; }).length, 0);
  };
  /** The starter lobby with four ways in: S (entrance), W (calm), a second S door, and the playroom's doorway. */
  const fullLobby = () => {
    const s = ok(addDoor(started(), room(started(), "lobby").uid, { side: "S", i: 1 }));
    expect(ways(s, room(s, "lobby").uid)).toBe(4);
    return s;
  };
  it("Add door: a door on a new room that would open into the full lobby is refused, nothing charged", () => {
    let s = fullLobby();
    s = ok(drawRoom(s, 16, 19, 3, 3)); // walls only, no door yet, right above the lobby
    const north = fac(s).rooms.at(-1)!;
    const coins = s.coins;
    const r = addDoor(s, north.uid, { side: "S", i: 1 }); // its outside square is inside the lobby
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/4 ways in|four ways in|Lobby/i);
    expect(s.coins).toBe(coins);
    // a door on another wall is still fine
    expect(addDoor(s, north.uid, { side: "N", i: 1 }).ok).toBe(true);
  });
  it("connected building: a room planned right above the full lobby doesn't get its door into the lobby", () => {
    const s = fullLobby();
    const rect = { c: 16, r: 19, w: 3, d: 3 };
    const plan = planRoom(fac(s), rect);
    if (plan.ok) {
      const t = ok(buildConnectedRoom(s, rect, "calm", undefined, plan));
      expect(ways(t, room(t, "lobby").uid)).toBe(4);
      expect(spent(t) - spent(s)).toBe(plan.cost.total);
    }
  });
  it("Connect it: reconnecting a room above the full lobby never adds a fifth way into the lobby", () => {
    let s = ok(buildConnectedRoom(started(), { c: 16, r: 19, w: 3, d: 3 }, "calm"));
    const north = fac(s).rooms.at(-1)!;
    // its doorway into the lobby (on either room) goes; the lobby gets a second south door: four ways in again
    const lobby0 = room(s, "lobby");
    const shared = lobby0.doors.find((d) => d.side === "N");
    s = shared ? ok(removeDoor(s, lobby0.uid, shared)) : ok(removeDoor(s, north.uid, fac(s).rooms.find((r) => r.uid === north.uid)!.doors.find((d) => d.side === "S")!));
    s = ok(addDoor(s, room(s, "lobby").uid, { side: "S", i: 1 }));
    expect(ways(s, room(s, "lobby").uid)).toBe(4);
    expect(connectedRooms(fac(s)).has(north.uid)).toBe(false);
    const plan = connectionPlan(fac(s), north.uid);
    if (plan && !plan.blocked) {
      const t = ok(connectRoom(s, north.uid, plan));
      expect(ways(t, room(t, "lobby").uid)).toBe(4);
      expect(connectedRooms(fac(t)).has(north.uid)).toBe(true);
    }
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
