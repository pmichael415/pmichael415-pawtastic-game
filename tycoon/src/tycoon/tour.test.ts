// The guided tour (Stage A, spec §3.2): beats that complete when the real game state shows them, scripted pups,
// held arrivals and clock while it runs, a reward paid once, and no dead ends.
import { describe, expect, it } from "vitest";
import { groupOf } from "@/game/engine";
import { GUIDE_REWARD } from "./catalog";
import { placeFirstFree } from "./build";
import { assignRoom, checkIn, checkout, playtime, setOpen, tick, toCalm } from "./run";
import { fac, newTycoon, parseTycoon } from "./state";
import { chooseUpgrade, skipTour, startTour, syncTour, tourHolds } from "./tour";
import { ok } from "./testkit";
import { nextAction } from "./nextAction";
import { addDoor, drawRoom, paintPaths, placeThing, setRoomType } from "./build";
import type { TourBeat, TResult, TycoonState } from "./types";

const dog = (s: TycoonState, name: string) => fac(s).dogs.find((d) => d.name === name) ?? null;
const playroom = (s: TycoonState, group = "small-gentle") => fac(s).rooms.find((r) => r.type === "playroom" && r.group === group)!.uid;
const never = () => 0.999999; // no random arrivals or scuffles

/** Runs an action, then lets the tour catch up (as the store does after every action). */
function step(s: TycoonState, fn: (s: TycoonState) => TResult, seen: TourBeat[]): TycoonState {
  const r = syncTour(ok(fn(s)), 0);
  seen.push(...r.reached);
  return r.state;
}
function careFor(s: TycoonState, name: string, seen: TourBeat[]): TycoonState {
  const id = () => dog(s, name)!.id;
  s = step(s, (x) => checkIn(x, id()), seen);
  s = step(s, (x) => assignRoom(x, id(), playroom(x)), seen);
  s = step(s, (x) => playtime(x, id()), seen);
  return step(s, (x) => checkout(x, id(), false), seen);
}

describe("the quick-start tour", () => {
  it("goes beat by beat with real actions, from meeting Biscuit to the next goals", () => {
    const seen: TourBeat[] = [];
    let s = startTour(newTycoon(0), "quick", 0);
    expect(fac(s).open).toBe(true);
    expect(dog(s, "Biscuit")?.place.kind).toBe("lobby");
    expect(groupOf(dog(s, "Biscuit")!)).toBe("small-gentle");
    expect(s.tour?.beat).toBe("checkin");
    s = careFor(s, "Biscuit", seen);
    expect(s.tour?.beat).toBe("upgrade");
    s = chooseUpgrade(s, "toy_bin");
    s = step(s, (x) => placeFirstFree(x, "toy_bin"), seen);
    expect(s.tour?.beat).toBe("benefit");
    expect(groupOf(dog(s, "Daisy")!)).toBe("small-gentle");
    s = careFor(s, "Daisy", seen);
    expect(s.tour?.beat).toBe("decision");
    const rocket = dog(s, "Rocket")!;
    expect(groupOf(rocket)).toBe("large-active");
    const coins = s.coins;
    s = step(s, (x) => checkIn(x, rocket.id), seen);
    s = step(s, (x) => toCalm(x, rocket.id), seen);
    s = step(s, (x) => checkout(x, rocket.id, false), seen);
    expect(s.tour?.beat).toBe("goals");
    expect(s.tour?.done).toBe(true);
    expect(seen).toEqual(["place", "play", "checkout", "upgrade", "benefit", "decision", "goals"]); // "checkin" is reached inside startTour
    expect(s.coins).toBe(coins + GUIDE_REWARD); // Rocket went home free; the guide reward is paid
    expect(s.guide.done).toBe(true);
    expect(tourHolds(s)).toBe(false);
    expect(syncTour(s, 0).state.coins).toBe(s.coins); // paid once
  });

  it("the decision is also done when Rocket gets his own Large & Active playroom", () => {
    const seen: TourBeat[] = [];
    let s = startTour({ ...newTycoon(0), coins: 20000 }, "quick", 0);
    s = careFor(s, "Biscuit", seen);
    s = chooseUpgrade(s, "toy_bin");
    s = step(s, (x) => placeFirstFree(x, "toy_bin"), seen);
    s = careFor(s, "Daisy", seen);
    s = step(s, (x) => placeFirstFree(x, { room: "playroom", group: "large-active" }), seen);
    s = step(s, (x) => placeFirstFree(x, "dog_bed"), seen); // a spot for him (first free spot in a playroom)
    const big = fac(s).rooms.find((r) => r.type === "playroom" && r.group === "large-active")!;
    if (!fac(s).items.some((i) => i.room === big.uid && i.kind === "dog_bed")) s = ok(placeThing(s, "dog_bed", big.c, big.r, 0));
    const rocket = dog(s, "Rocket")!;
    s = step(s, (x) => checkIn(x, rocket.id), seen);
    s = step(s, (x) => assignRoom(x, rocket.id, big.uid), seen);
    expect(s.tour?.beat).toBe("goals");
  });
});

describe("the tour is comfortable and never a dead end", () => {
  it("holds random drop-offs and the day clock while it runs", () => {
    const s = startTour(newTycoon(0), "quick", 0);
    const later = tick(s, 600, () => 0); // would roll an arrival every minute if not held
    expect(fac(later).dogs.map((d) => d.name)).toEqual(["Biscuit"]);
    expect(fac(later).clockMin).toBe(fac(s).clockMin);
  });
  it("after a reload mid-tour it carries on and never adds a second Biscuit", () => {
    let s = startTour(newTycoon(0), "quick", 0);
    s = syncTour(ok(checkIn(s, dog(s, "Biscuit")!.id)), 0).state;
    const reloaded = syncTour(parseTycoon(JSON.parse(JSON.stringify(s)))!, 0).state;
    expect(reloaded.tour?.beat).toBe("place");
    expect(fac(reloaded).dogs.filter((d) => d.name === "Biscuit")).toHaveLength(1);
  });
  it("skipping stops the hold, pays nothing and hides the old checklist too", () => {
    let s = startTour(newTycoon(0), "quick", 0);
    const coins = s.coins;
    s = skipTour(s);
    expect(tourHolds(s)).toBe(false);
    expect(s.coins).toBe(coins);
    expect(s.guide.skipped).toBe(true);
    const later = tick(s, 120, () => 0);
    expect(fac(later).clockMin).toBeGreaterThan(fac(s).clockMin);
    // families keep coming: they drop off, or ask for a kind of pup with no playroom yet (they book what you offer)
    const asked = Object.values(fac(later).asked?.groups ?? {}).reduce((a, b) => a + (b ?? 0), 0);
    expect(fac(later).dogs.length + asked).toBeGreaterThan(1);
  });
  it("Biscuit going home early (calm room, no pay) still moves the tour on", () => {
    const seen: TourBeat[] = [];
    let s = startTour(newTycoon(0), "quick", 0);
    const id = dog(s, "Biscuit")!.id;
    s = step(s, (x) => checkIn(x, id), seen);
    s = step(s, (x) => toCalm(x, id), seen);
    s = step(s, (x) => checkout(x, id, false), seen);
    expect(s.tour?.beat).toBe("upgrade");
  });
});

describe("Build from scratch", () => {
  it("Biscuit matches the playroom the player built and arrives once they open", () => {
    let s = startTour(newTycoon(0), "scratch", 0);
    expect(dog(s, "Biscuit")).toBeNull();
    expect(s.tour?.beat).toBe("meet");
    // Lobby, a Large & Active playroom with a bed, and a calm room.
    s = ok(drawRoom(s, 16, 22, 4, 3));
    const lobby = fac(s).rooms.at(-1)!.uid;
    s = ok(setRoomType(s, lobby, "lobby"));
    s = ok(addDoor(s, lobby, { side: "S", i: 2 }));
    s = ok(paintPaths(s, [{ c: 18, r: 25 }, { c: 18, r: 26 }]));
    s = ok(placeThing(s, "front_counter", 16, 24, 0));
    s = ok(drawRoom(s, 20, 22, 3, 3));
    const play = fac(s).rooms.at(-1)!.uid;
    s = ok(setRoomType(s, play, "playroom", "large-active"));
    s = ok(addDoor(s, play, { side: "W", i: 1 }));
    s = ok(placeThing(s, "dog_bed", 21, 24, 0));
    s = ok(drawRoom(s, 14, 22, 2, 2));
    s = ok(setRoomType(s, fac(s).rooms.at(-1)!.uid, "calm"));
    s = ok(addDoor(s, lobby, { side: "W", i: 1 }));
    expect(syncTour(s, 0).state.tour?.beat).toBe("meet"); // not open yet
    s = syncTour(ok(setOpen(s, true)), 0).state;
    const biscuit = dog(s, "Biscuit")!;
    expect(groupOf(biscuit)).toBe("large-active");
    expect(s.tour?.beat).toBe("checkin");
    expect(fac(tick(s, 600, never)).dogs).toHaveLength(1);
  });
});

// Found in the first-session play-through (milestone §6): the coach said "Check out" while the pup's panel said "All
// set — picks up at 16:00" and offered no checkout step, and a pup whose panel was closed could only be found in 3D.
describe("when the guide says check out, the family is here", () => {
  it("after Biscuit's playtime his family arrives: his next step is Check out, and the desk lists the pickup", () => {
    const seen: TourBeat[] = [];
    let s = startTour(newTycoon(0), "quick", 0);
    const id = () => dog(s, "Biscuit")!.id;
    s = step(s, (x) => checkIn(x, id()), seen);
    s = step(s, (x) => assignRoom(x, id(), playroom(x)), seen);
    expect(nextAction(fac(s), dog(s, "Biscuit")!).id).toBe("play");
    s = step(s, (x) => playtime(x, id()), seen);
    expect(s.tour?.beat).toBe("checkout");
    expect(nextAction(fac(s), dog(s, "Biscuit")!).id).toBe("checkout");
    expect(dog(s, "Biscuit")!.visit!.ownerHere).toBe(fac(s).clockMin);
  });
  it("the same for Daisy once she has played", () => {
    const seen: TourBeat[] = [];
    let s = careFor(startTour({ ...newTycoon(0), coins: 5000 }, "quick", 0), "Biscuit", seen);
    s = step(chooseUpgrade(s, "toy_bin"), (x) => placeFirstFree(x, "toy_bin"), seen);
    const id = () => dog(s, "Daisy")!.id;
    s = step(s, (x) => checkIn(x, id()), seen);
    s = step(s, (x) => assignRoom(x, id(), playroom(x)), seen);
    expect(dog(s, "Daisy")!.visit!.ownerHere).toBeNull();
    s = step(s, (x) => playtime(x, id()), seen);
    expect(s.tour?.beat).toBe("benefit");
    expect(nextAction(fac(s), dog(s, "Daisy")!).id).toBe("checkout");
  });
});
