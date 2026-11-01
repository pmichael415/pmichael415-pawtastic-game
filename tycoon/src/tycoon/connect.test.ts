import { describe, expect, it } from "vitest";
import { addDoor, drawRoom, paintPaths, placeThing, removeDoor, sellThing, setClosed, setRoomType } from "./build";
import { canOpen, caps, connectedRooms, roomStatus } from "./connect";
import { fac, newTycoon } from "./state";
import { guidedBuild, ok, richState } from "./testkit";
import type { Room, TycoonState } from "./types";

const lastRoom = (s: TycoonState) => fac(s).rooms[fac(s).rooms.length - 1]!;
const roomAt = (s: TycoonState, c: number, r: number) => fac(s).rooms.find((x) => x.c === c && x.r === r)!;
const status = (s: TycoonState, room: Room) => roomStatus(fac(s), room);

/** A 4 × 3 lobby at (16,22), a south door and a path down to the entrance. */
function lobby(): TycoonState {
  let s = ok(drawRoom(newTycoon(0), 16, 22, 4, 3));
  const uid = lastRoom(s).uid;
  s = ok(setRoomType(s, uid, "lobby"));
  s = ok(addDoor(s, uid, { side: "S", i: 2 }));
  return ok(paintPaths(s, [{ c: 18, r: 25 }, { c: 18, r: 26 }]));
}

describe("connectivity", () => {
  it("a lobby with a door and a path to the entrance is connected", () => {
    const s = lobby();
    expect(connectedRooms(fac(s)).has(roomAt(s, 16, 22).uid)).toBe(true);
  });
  it("a door with no path in front of it isn't", () => {
    let s = ok(drawRoom(newTycoon(0), 16, 22, 4, 3));
    s = ok(addDoor(s, lastRoom(s).uid, { side: "S", i: 2 }));
    expect(connectedRooms(fac(s)).size).toBe(0);
    expect(status(s, lastRoom(s)).reason).toBe("Not connected");
  });
  it("a playroom sharing the lobby's wall connects through a door on that wall, either room's", () => {
    let s = ok(drawRoom(lobby(), 20, 22, 3, 3));
    const play = lastRoom(s).uid;
    expect(connectedRooms(fac(s)).has(play)).toBe(false);
    const viaPlay = ok(addDoor(s, play, { side: "W", i: 1 }));
    expect(connectedRooms(fac(viaPlay)).has(play)).toBe(true);
    const viaLobby = ok(addDoor(s, roomAt(s, 16, 22).uid, { side: "E", i: 1 }));
    expect(connectedRooms(fac(viaLobby)).has(play)).toBe(true);
    s = ok(removeDoor(viaPlay, play, { side: "W", i: 1 }));
    expect(connectedRooms(fac(s)).has(play)).toBe(false);
  });
  it("rooms are passable: a path leaving a far door connects onward", () => {
    // lobby → playroom (shared wall) → north door → path → a bath room's door
    let s = ok(drawRoom(lobby(), 20, 22, 3, 3));
    const play = lastRoom(s).uid;
    s = ok(addDoor(s, play, { side: "W", i: 1 }));
    s = ok(addDoor(s, play, { side: "N", i: 1 }));
    s = ok(paintPaths(s, [{ c: 21, r: 21 }, { c: 21, r: 20 }]));
    s = ok(drawRoom(s, 20, 17, 3, 3));
    const far = lastRoom(s).uid;
    s = ok(addDoor(s, far, { side: "S", i: 1 }));
    expect(connectedRooms(fac(s)).has(far)).toBe(true);
  });
  it("selling one path tile in the chain disconnects both rooms", () => {
    let s = ok(drawRoom(lobby(), 20, 22, 3, 3));
    s = ok(addDoor(s, lastRoom(s).uid, { side: "W", i: 1 }));
    expect(connectedRooms(fac(s)).size).toBe(2);
    const tile = fac(s).items.find((i) => i.kind === "path" && i.c === 18 && i.r === 26)!;
    s = ok(sellThing(s, tile.uid));
    expect(connectedRooms(fac(s)).size).toBe(0);
  });
});

describe("room status", () => {
  it("gives the first reason in order", () => {
    let s = lobby();
    const uid = roomAt(s, 16, 22).uid;
    expect(status(s, roomAt(s, 16, 22))).toEqual({ connected: true, working: false, reason: "Needs a Front Desk Counter" });
    s = ok(placeThing(s, "front_counter", 16, 22, 0));
    expect(status(s, roomAt(s, 16, 22))).toEqual({ connected: true, working: true, reason: null });
    s = ok(setClosed(s, uid, true));
    expect(status(s, roomAt(s, 16, 22))).toEqual({ connected: true, working: false, reason: "Closed" });
    const bare = ok(drawRoom(lobby(), 20, 22, 3, 3));
    const b = ok(addDoor(bare, lastRoom(bare).uid, { side: "W", i: 1 }));
    expect(status(b, lastRoom(b)).reason).toBe("Choose a room type");
    const p = ok(setRoomType(b, lastRoom(b).uid, "playroom", "small-gentle"));
    expect(status(p, lastRoom(p)).reason).toBe("Needs a dog bed or play mat");
  });
  it("names what bath, boarding and staff rooms need", () => {
    const s = richState();
    const f = fac(s);
    const need = (type: string) => {
      const room = f.rooms.find((r) => r.type === type)!;
      const without = { ...f, items: f.items.filter((i) => i.room !== room.uid) };
      return roomStatus(without, room).reason;
    };
    expect(need("bath")).toBe("Needs a bath tub");
    expect(need("boarding")).toBe("Needs a boarding bed");
    expect(need("staff")).toBe("Needs a staff couch");
    for (const room of f.rooms) expect(roomStatus(f, room).reason).toBeNull();
  });
});

describe("capabilities", () => {
  /** A connected 3 × 3 playroom east of the lobby with `beds` dog beds. */
  function playroomWith(beds: number) {
    let s = ok(drawRoom(lobby(), 20, 22, 3, 3));
    const uid = lastRoom(s).uid;
    s = ok(addDoor(s, uid, { side: "W", i: 1 }));
    s = ok(setRoomType(s, uid, "playroom", "small-gentle"));
    const spots = [[21, 22], [22, 22], [21, 23], [22, 23], [21, 24], [22, 24]].slice(0, beds);
    for (const [c, r] of spots) s = ok(placeThing(s, "dog_bed", c!, r!, 0));
    return s;
  }
  it("dog spots are beds + mats, up to area / 2", () => {
    expect(caps(fac(playroomWith(2))).playrooms[0]).toMatchObject({ group: "small-gentle", spots: 2 });
    expect(caps(fac(playroomWith(6))).playrooms[0]!.spots).toBe(4);
  });
  it("closed furniture doesn't count, and non-working rooms give nothing", () => {
    let s = playroomWith(2);
    const bed = fac(s).items.find((i) => i.kind === "dog_bed")!;
    s = ok(setClosed(s, bed.uid, true));
    expect(caps(fac(s)).playrooms[0]!.spots).toBe(1);
    expect(caps(fac(lobby())).lobby).toBeNull();
  });
  it("5 benches give 10 waiting spots, not 12", () => {
    let s = ok(drawRoom(newTycoon(0), 14, 22, 6, 4));
    const uid = lastRoom(s).uid;
    s = ok(setRoomType(s, uid, "lobby"));
    s = ok(addDoor(s, uid, { side: "S", i: 4 }));
    s = ok(paintPaths(s, [{ c: 18, r: 26 }]));
    s = ok(placeThing(s, "front_counter", 14, 22, 0));
    expect(caps(fac(s)).waiting).toBe(2);
    for (const [c, r] of [[16, 22], [18, 22], [14, 23], [16, 23], [18, 23]]) s = ok(placeThing(s, "bench", c!, r!, 0));
    expect(caps(fac(s)).waiting).toBe(10);
  });
  it("the guided build and the rich state", () => {
    const g = caps(fac(guidedBuild(newTycoon(0))));
    expect(g.lobby).not.toBeNull();
    expect(g.waiting).toBe(4);
    expect(g.playrooms).toHaveLength(1);
    expect(g.calm).toHaveLength(1);
    expect(g.bath).toBeNull();
    expect(g.beds).toEqual([]);
    expect(g.staffBoost).toBe(0);
    const r = caps(fac(richState()));
    expect(r.bath?.tub).toBe("deluxe");
    expect(r.beds).toHaveLength(2);
    expect(r.staffBoost).toBe(1);
  });
});

describe("opening", () => {
  it("lists all three missing things on a new game", () => {
    expect(canOpen(fac(newTycoon(0)))).toEqual({
      ok: false,
      missing: ["A connected Lobby with a Front Desk Counter", "A connected Playroom with a dog spot", "A connected Calm-Down Room"],
    });
  });
  it("is ok after the guided build", () => {
    expect(canOpen(fac(guidedBuild(newTycoon(0))))).toEqual({ ok: true, missing: [] });
  });
});
