// Fixes from the final whole-branch review: each test reproduces a finding first.
import { afterEach, describe, expect, it } from "vitest";
import { furnitureDef } from "./catalog";
import { drawRoom, placeThing } from "./build";
import { caps } from "./connect";
import { funAppeal } from "./effects";
import { setOwnedPaid } from "./paid";
import { bath, checkIn, checkout, createArrival, setOpen, tick, welcomeBack } from "./run";
import { fac, newTycoon, parseTycoon, withFac } from "./state";
import { guidedBuild, ok, richState } from "./testkit";
import type { TDog, TycoonState } from "./types";

const dog = (id: string, over: Partial<TDog> = {}): TDog =>
  ({ id, name: `Pup ${id}`, breed: 5, size: "small", temper: "gentle", visits: 1, place: { kind: "lobby" }, checkedIn: true, happiness: 50, clean: 70, boarding: false, played: 0, bathed: false, ...over }) as TDog;
const reload = (s: unknown) => parseTycoon(JSON.parse(JSON.stringify(s)))!;

describe("C1: the cosmetic pack gives no gameplay advantage", () => {
  afterEach(() => setOwnedPaid(new Set()));
  it("Cloud Bed costs and does exactly what a Dog Bed does; Lighthouse Fort what Mini Hurdles do", () => {
    const bed = furnitureDef("dog_bed")!;
    const cloud = furnitureDef("cloud_bed")!;
    expect([cloud.price, cloud.unlock, cloud.spots ?? 0, cloud.fun ?? 0, cloud.appeal ?? 0]).toEqual([bed.price, bed.unlock, bed.spots ?? 0, bed.fun ?? 0, bed.appeal ?? 0]);
    const hurdles = furnitureDef("hurdles")!;
    const fort = furnitureDef("lighthouse_fort")!;
    expect([fort.price, fort.unlock, fort.spots ?? 0, fort.fun ?? 0, fort.appeal ?? 0]).toEqual([hurdles.price, hurdles.unlock, hurdles.spots ?? 0, hurdles.fun ?? 0, hurdles.appeal ?? 0]);
    expect(fort.w * fort.d).toBeGreaterThanOrEqual(hurdles.w * hurdles.d);
  });
  it("placing a Cloud Bed charges like a Dog Bed and pays upkeep", () => {
    const owned = new Set(["deluxe-decor"] as const);
    const g = guidedBuild(newTycoon(0));
    const t = ok(placeThing(g, "cloud_bed", 22, 22, 0, owned));
    expect(t.coins).toBe(g.coins - 60);
    expect(fac(t).items.at(-1)!.spent).toBe(60);
    expect(caps(fac(t), owned).playrooms[0]!.spots).toBe(3);
    expect(funAppeal(fac(t), owned)).toEqual(funAppeal(fac(g), owned));
  });
});

describe("I1: baths can't be farmed", () => {
  function pupIn(s: TycoonState, place: TDog["place"], over: Partial<TDog> = {}) {
    return withFac(s, { ...fac(s), open: true, clockMin: 480, dogs: [dog("a", { place, ...over })] });
  }
  it("one bath per visit, and starting one never pays (the receipt charges it once)", () => {
    const s = richState();
    const play = fac(s).rooms.find((r) => r.type === "playroom")!.uid;
    const t = pupIn(s, { kind: "room", room: play });
    const once = ok(bath(t, "a"));
    expect(once.coins).toBe(t.coins);
    expect(bath(once, "a")).toEqual({ ok: false, error: "Pup a is already in the bath." });
    const done = tick(once, 30, () => 0.99);
    expect(bath(done, "a")).toEqual({ ok: false, error: "Pup a already had a bath today." });
  });
  it("only pups in a playroom or boarding bed get a paid bath", () => {
    const s = richState();
    expect(bath(pupIn(s, { kind: "lobby" }), "a")).toEqual({ ok: false, error: "Settle Pup a into a playroom or boarding bed first." });
  });
  it("the reviewer's repro no longer mints coins: open, one arrival, close, 200 × (rest, bath)", () => {
    let s = withFac(richState(), { ...fac(richState()), clockMin: 480 });
    s = ok(setOpen(s, true));
    s = ok(createArrival(s, () => 0.4));
    const id = fac(s).dogs[0]!.id;
    s = ok(checkIn(s, id));
    s = ok(setOpen(s, false));
    const start = s.coins;
    let baths = 0;
    for (let i = 0; i < 200; i++) {
      s = tick(s, 3, () => 0.99);
      const r = bath(s, id);
      if (r.ok) (s = r.state), baths++;
    }
    expect(baths).toBe(0);
    expect(s.coins).toBe(start);
  });
});

describe("I2: hand-edited saves load safely", () => {
  it("a prototype key as the active facility doesn't crash", () => {
    const s = reload({ ...newTycoon(0), active: "constructor", facilities: {} });
    expect(s.active).toBe("f1");
    expect(fac(s).rooms).toEqual([]);
    expect(() => welcomeBack(s, Date.now())).not.toThrow();
    const proto = parseTycoon(JSON.parse(`{"v":1,"active":"__proto__","facilities":{"__proto__":{"name":"x"}}}`))!;
    expect(proto.active).toBe("f1");
  });
  it("seq never reuses an id already in the save", () => {
    const g = guidedBuild(newTycoon(0));
    const s = reload({ ...g, seq: 1 });
    expect(s.seq).toBeGreaterThan(Math.max(...[...fac(g).rooms.map((r) => r.uid), ...fac(g).items.map((i) => i.uid)].map((u) => Number(u.replace(/\D/g, "")) || 0)));
    expect(drawRoom(s, 16, 22, 4, 3).ok).toBe(false); // can't build on top of the lobby
  });
  it("duplicate dog ids keep one pup each", () => {
    const g = guidedBuild(newTycoon(0));
    const s = reload(withFac(g, { ...fac(g), dogs: [dog("x"), dog("x", { name: "Twin" })] }));
    expect(fac(s).dogs.map((d) => d.id)).toEqual(["x"]);
  });
  it("placements are normalised: over capacity, boarders in playrooms, unchecked pups, fake beds", () => {
    const g = richState();
    const play = fac(g).rooms.find((r) => r.type === "playroom")!.uid;
    const boarding = fac(g).rooms.find((r) => r.type === "boarding")!.uid;
    const bed = fac(g).items.find((i) => i.kind === "boarding_bed")!.uid;
    const dogs = [
      ...["a", "b", "c", "d"].map((id) => dog(id, { place: { kind: "room", room: play } })),
      dog("e", { boarding: true, place: { kind: "room", room: play } }),
      dog("f", { checkedIn: false, place: { kind: "room", room: play } }),
      dog("g", { boarding: true, place: { kind: "bed", room: boarding, bed } }),
      dog("h", { boarding: true, place: { kind: "bed", room: boarding, bed } }),
      dog("i", { boarding: false, place: { kind: "bed", room: boarding, bed: fac(g).items.find((i) => i.kind === "boarding_bed" && i.uid !== bed)!.uid } }),
    ];
    const s = reload(withFac(g, { ...fac(g), dogs }));
    const f = fac(s);
    const where = (id: string) => f.dogs.find((d) => d.id === id)!.place.kind;
    expect(f.dogs.filter((d) => d.place.kind === "room" && (d.place as { room: string }).room === play)).toHaveLength(2); // 2 spots
    expect(f.dogs).toHaveLength(9); // nobody vanishes
    expect(where("e")).toBe("lobby");
    expect(where("f")).toBe("lobby");
    expect(where("g")).toBe("bed");
    expect(where("h")).toBe("lobby"); // that bed is taken
    expect(where("i")).toBe("lobby"); // daycare pups don't sleep in boarding beds
    expect(checkout(s, "e", false)).toMatchObject({ ok: true, msg: expect.stringContaining("no charge") });
  });
  it("broken guest-book entries and long staff names are cleaned up", () => {
    const g = guidedBuild(newTycoon(0));
    const s = reload(withFac(g, {
      ...fac(g),
      guestBook: [{ name: "Rex" } as never, { name: "Ok", breed: 1, size: "small", temper: "gentle", visits: 2, friendship: 10, lastDay: 1 }],
      staff: [{ id: "s0", name: "x".repeat(500), energy: 50 }],
    }));
    expect(fac(s).guestBook.map((r) => r.name)).toEqual(["Ok"]);
    expect(fac(s).staff[0]!.name.length).toBeLessThanOrEqual(24);
    let t = withFac(s, { ...fac(s), open: true, clockMin: 480 });
    for (let i = 0; i < 20; i++) {
      const r = createArrival(t, () => 0.1);
      if (r.ok) t = withFac(r.state, { ...fac(r.state), dogs: [] });
    }
    expect(fac(t).dogs).toEqual([]);
  });
});
