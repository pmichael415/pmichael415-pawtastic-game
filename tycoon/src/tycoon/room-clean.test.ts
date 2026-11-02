// Cleanliness per room (staff design §3): pups dirty the room they're in, the Mop button mops every room, and a
// family's "dirty" complaint is about their own pup's room.
import { describe, expect, it } from "vitest";
import { assessVisit } from "./assess";
import { clean, tick } from "./run";
import { aggregateClean, roomCleanOf, roomName } from "./rooms";
import { fac, withFac } from "./state";
import { ok, richState } from "./testkit";
import { defaultVisit } from "./visit";
import type { Facility, TDog, TycoonState } from "./types";

const still = () => 0.99;
const pup = (f: Facility, id: string, room: string): TDog => {
  const d: TDog = { id, name: "Pup" + id, breed: 1, size: "small", temper: "gentle", visits: 1, place: { kind: "room", room }, checkedIn: true, happiness: 90, clean: 80, boarding: false, played: 1, bathed: false };
  return { ...d, visit: defaultVisit(f, d) };
};
function twoRooms(): { s: TycoonState; a: string; b: string } {
  const s = richState();
  const f = fac(s);
  const play = f.rooms.filter((r) => r.type === "playroom");
  const a = play[0]!.uid;
  const b = (play[1] ?? f.rooms.find((r) => r.type === "calm")!).uid;
  return { s: withFac(s, { ...f, open: false, cleanliness: 100, roomClean: Object.fromEntries(f.rooms.map((r) => [r.uid, 100])), dogs: [pup(f, "a", a), pup(f, "b", a), pup(f, "c", a)] }), a, b };
}

describe("cleanliness per room", () => {
  it("a room with three pups gets dirtier at the old rate; an empty room stays clean", () => {
    const { s, a, b } = twoRooms();
    const t = tick(s, 10, still);
    expect(roomCleanOf(fac(t), a)).toBeCloseTo(100 - 0.08 * 3 * 10, 5);
    expect(roomCleanOf(fac(t), b)).toBe(100);
  });
  it("the daycare's cleanliness is the average weighted by pups in each room", () => {
    const { s, a } = twoRooms();
    const f = fac(s);
    const rc = { ...f.roomClean!, [a]: 40 };
    const g = { ...f, roomClean: rc };
    const weights = f.rooms.map((r) => (r.uid === a ? 4 : 1));
    const expected = f.rooms.reduce((sum, r, i) => sum + rc[r.uid]! * weights[i]!, 0) / weights.reduce((x, y) => x + y, 0);
    expect(aggregateClean(g)).toBeCloseTo(expected, 5);
  });
  it("Mop raises every room by 35", () => {
    const { s, a, b } = twoRooms();
    const f = fac(s);
    const dirty = withFac(s, { ...f, roomClean: { ...f.roomClean!, [a]: 20, [b]: 50 } });
    const m = fac(ok(clean(dirty)));
    expect(roomCleanOf(m, a)).toBe(55);
    expect(roomCleanOf(m, b)).toBe(85);
  });
  it("the dirty complaint is about the pup's own room, and names it", () => {
    const { s, a, b } = twoRooms();
    const f = fac(s);
    const otherDirty = { ...f, roomClean: { ...f.roomClean!, [b]: 10 } };
    expect(assessVisit(otherDirty, otherDirty.dogs[0]!, {}).complaints.some((c) => c.kind === "dirty")).toBe(false);
    const ownDirty = { ...f, roomClean: { ...f.roomClean!, [a]: 10 } };
    const c = assessVisit(ownDirty, ownDirty.dogs[0]!, {}).complaints.find((x) => x.kind === "dirty");
    expect(c?.text).toContain(roomName(ownDirty, a));
  });
  it("old tests that set only the daycare-wide value still work (rooms without their own value use it)", () => {
    const s = richState();
    const f = fac(s);
    const room = f.rooms.find((r) => r.type === "playroom")!.uid;
    expect(roomCleanOf({ ...f, cleanliness: 30, roomClean: {} }, room)).toBe(30);
  });
  it("rooms are named for people: Lobby, Playroom 1, Bath Room", () => {
    const f = fac(richState());
    const play = f.rooms.filter((r) => r.type === "playroom");
    expect(roomName(f, f.rooms.find((r) => r.type === "lobby")!.uid)).toBe("Lobby");
    expect(roomName(f, play[0]!.uid)).toBe(play.length > 1 ? "Playroom 1" : "Playroom");
  });
});
