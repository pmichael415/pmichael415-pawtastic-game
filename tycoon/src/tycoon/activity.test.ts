// What each pup is doing, readable from the world (combined-loop plan, task 3): one small bubble over every pup, and
// the families standing at the desk. Pure — the 3D view and the 2D map both draw from it.
import { describe, expect, it } from "vitest";
import { dogActivity, familiesAtDesk } from "./activity";
import { openMoments } from "./moments";
import { fac, withFac } from "./state";
import { hire } from "./team";
import { ok, richState } from "./testkit";
import { defaultVisit } from "./visit";
import type { Facility, TDog, TycoonState, Visit } from "./types";

const playroom = (f: Facility) => f.rooms.find((r) => r.type === "playroom")!;
function scene(over: Partial<TDog> = {}, visit: Partial<Visit> = {}, s0: TycoonState = richState()): TycoonState {
  const f = fac(s0);
  const d: TDog = { id: "p", name: "Pip", breed: 1, size: "small", temper: "gentle", visits: 1, place: { kind: "room", room: playroom(f).uid }, checkedIn: true, happiness: 80, clean: 70, boarding: false, played: 1, bathed: false, ...over };
  const dog = { ...d, visit: { ...defaultVisit(f, d), arrivedDay: f.day, arrived: 9 * 60, checkedInAt: 9 * 60, pickup: 17 * 60, ...visit } };
  return withFac(s0, { ...f, open: true, clockMin: 12 * 60, introDay: 0, dogs: [dog] });
}
const act = (s: TycoonState) => dogActivity(fac(s), fac(s).dogs[0]!);

describe("the bubble over a pup", () => {
  it("a contented pup in its playroom shows nothing (no clutter)", () => {
    expect(act(scene())).toBeNull();
  });
  it("⏳ a pup just dropped off, waiting to be checked in", () => {
    expect(act(scene({ place: { kind: "lobby" }, checkedIn: false }, { arrived: 11 * 60 + 50 }))).toMatchObject({ emoji: "⏳", kind: "wait" });
  });
  it("🫧 in the bath; 💤 in a boarding bed or the calm room", () => {
    expect(act(scene({ bathing: 12 }))).toMatchObject({ emoji: "🫧", kind: "bath" });
    const f = fac(richState());
    const calm = f.rooms.find((r) => r.type === "calm")!.uid;
    expect(act(scene({ place: { kind: "calm", room: calm } }))).toMatchObject({ emoji: "💤", kind: "rest" });
  });
  it("🎾 while a team member plays with it", () => {
    let s = ok(hire(scene({ happiness: 40 }), "attendant"));
    const f = fac(s);
    s = withFac(s, { ...f, staff: f.staff.map((st) => (st.role === "attendant" ? { ...st, job: { kind: "play" as const, dog: "p", room: null, tub: null, phase: "work" as const, left: 5, total: 5, to: { c: 0, r: 0 }, who: "Pip" } } : st)) });
    expect(act(s)).toMatchObject({ emoji: "🎾", kind: "play" });
  });
  it("✨ when it's asking for you — above everything but a need", () => {
    expect(act(openMoments(scene()))).toMatchObject({ emoji: "✨", kind: "moment" });
    expect(act(openMoments(scene({ happiness: 20 })))).toMatchObject({ emoji: "❗", kind: "needs" });
  });
  it("❗ when it needs you: very unhappy, or its family is upset at the desk", () => {
    expect(act(scene({ happiness: 20 }))).toMatchObject({ emoji: "❗", kind: "needs" });
    expect(act(scene({ place: { kind: "lobby" }, checkedIn: false }, { arrived: 11 * 60 + 15 }))).toMatchObject({ emoji: "❗", kind: "needs" });
  });
  it("⏳ while its family waits at pickup", () => {
    expect(act(scene({}, { ownerHere: 12 * 60 - 2 }))).toMatchObject({ emoji: "⏳", kind: "wait" });
  });
});

describe("families at the desk", () => {
  it("a family who just dropped off waits at the desk until check-in; pickup families wait there too; then they go", () => {
    expect(familiesAtDesk(fac(scene({ place: { kind: "lobby" }, checkedIn: false }))).map((d) => d.id)).toEqual(["p"]);
    expect(familiesAtDesk(fac(scene()))).toEqual([]);
    expect(familiesAtDesk(fac(scene({}, { ownerHere: 12 * 60 }))).map((d) => d.id)).toEqual(["p"]);
    expect(familiesAtDesk(fac(scene({}, { finishing: "bath" }))).map((d) => d.id)).toEqual(["p"]);
  });
  it("a checked-in pup waiting in the lobby has no family at the desk (they left after check-in)", () => {
    expect(familiesAtDesk(fac(scene({ place: { kind: "lobby" }, checkedIn: true })))).toEqual([]);
  });
});
