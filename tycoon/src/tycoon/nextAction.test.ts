// The one obvious next thing to do for a pup (the old game's big button, empire milestone §1): check in, move to the
// safe room, bath if booked, play when it needs it, check out when the family is here.
import { describe, expect, it } from "vitest";
import { nextAction, safeRooms } from "./nextAction";
import { fac, withFac } from "./state";
import { ok, richState } from "./testkit";
import { defaultVisit } from "./visit";
import type { Facility, TDog, TycoonState, Visit } from "./types";

const playroom = (f: Facility, g = "small-gentle") => f.rooms.find((r) => r.type === "playroom" && r.group === g)!;
function scene(over: Partial<TDog> = {}, visit: Partial<Visit> = {}): TycoonState {
  const s = richState();
  const f = fac(s);
  const d: TDog = { id: "p", name: "Pip", breed: 1, size: "small", temper: "gentle", visits: 1, place: { kind: "lobby" }, checkedIn: false, happiness: 80, clean: 70, boarding: false, played: 0, bathed: false, ...over };
  return withFac(s, { ...f, open: true, clockMin: 10 * 60, introDay: 0, dogs: [{ ...d, visit: { ...defaultVisit(f, d), arrivedDay: f.day, arrived: 9 * 60 + 50, ...visit } }] });
}
const next = (s: TycoonState) => nextAction(fac(s), fac(s).dogs[0]!);

describe("the next thing to do for a pup", () => {
  it("a family just dropped off: Check in", () => {
    expect(next(scene())).toMatchObject({ id: "checkin" });
  });
  it("checked in and waiting in the lobby: move to the matching playroom (the safe room), named", () => {
    const s = scene({ checkedIn: true });
    const n = next(s);
    expect(n).toMatchObject({ id: "room", room: playroom(fac(s)).uid });
    expect(n.label).toMatch(/Small & Gentle/);
  });
  it("no safe room with space: no move offered, and it says why", () => {
    const s = scene({ checkedIn: true, size: "large", temper: "active" });
    const f = fac(s);
    const s2 = withFac(s, { ...f, rooms: f.rooms.filter((r) => !(r.type === "playroom" && r.group === "large-active")), items: f.items });
    const n = next(s2);
    expect(n.id).toBe("none");
    expect(n.reason).toMatch(/Large & Active/);
  });
  it("settled with a bath booked and not done: Bath", () => {
    const s = scene({ checkedIn: true, played: 1, place: { kind: "room", room: playroom(fac(richState())).uid } }, { requests: ["daycare", "bath"] });
    expect(next(s)).toMatchObject({ id: "bath" });
  });
  it("settled and bored (never played, or under 70% happy): Play", () => {
    const s = scene({ checkedIn: true, played: 0, place: { kind: "room", room: playroom(fac(richState())).uid } });
    expect(next(s)).toMatchObject({ id: "play" });
  });
  it("the family is here: Check out comes first", () => {
    const s = scene({ checkedIn: true, played: 0, place: { kind: "room", room: playroom(fac(richState())).uid } }, { ownerHere: 10 * 60 - 5 });
    expect(next(s)).toMatchObject({ id: "checkout" });
  });
  it("all done: nothing to do, and when the family comes", () => {
    const s = scene({ checkedIn: true, played: 2, happiness: 90, place: { kind: "room", room: playroom(fac(richState())).uid } }, { pickup: 17 * 60 + 30 });
    const n = next(s);
    expect(n.id).toBe("none");
    expect(n.reason).toMatch(/17:30/);
  });
  it("safe rooms are the working playrooms of the pup's own group with a free spot", () => {
    const s = scene({ checkedIn: true });
    const f = fac(s);
    expect(safeRooms(f, f.dogs[0]!).map((r) => r.uid)).toEqual([playroom(f).uid]);
    void ok;
  });
});
