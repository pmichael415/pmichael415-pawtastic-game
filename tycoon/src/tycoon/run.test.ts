import { describe, expect, it } from "vitest";
import { groupOf, mulberry, seedFrom } from "@/game/engine";
import { addDoor, drawRoom, placeThing, sellThing, setRoomType } from "./build";
import { countToday, setPrice } from "./business";
import { BATH_MIN, assignBed, assignRoom, bath, checkIn, checkout, clean, createArrival, hireStaff, lobbyDogs, playtime, separate, setOpen, tick, toCalm, welcomeBack } from "./run";
import { fac, newTycoon, withFac } from "./state";
import { guidedBuild, ok, richState } from "./testkit";
import type { Facility, TDog, TPlace, TycoonState } from "./types";

const r = () => 0.5;
const setF = (s: TycoonState, over: Partial<Facility>) => withFac(s, { ...fac(s), ...over });
const roomOfType = (s: TycoonState, type: string) => fac(s).rooms.find((x) => x.type === type)!;
const dog = (id: string, over: Partial<TDog> = {}): TDog =>
  ({ id, name: `Pup ${id}`, breed: 5, size: "small", temper: "gentle", visits: 1, place: { kind: "lobby" }, checkedIn: true, happiness: 50, clean: 70, boarding: false, played: 0, bathed: false, ...over }) as TDog;
const withDogs = (s: TycoonState, dogs: TDog[]) => setF(s, { dogs });
/** The guided build, open, at 08:00. */
const opened = (s = guidedBuild(newTycoon(0))) => setF(ok(setOpen(s, true)), { clockMin: 8 * 60 });
const placed = (s: TycoonState, id: string) => fac(s).dogs.find((d) => d.id === id)!.place;

describe("opening", () => {
  it("a new game can't open and lists what's missing", () => {
    const res = setOpen(newTycoon(0), true);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("A connected Lobby with a Front Desk Counter");
      expect(res.error).toContain("A connected Playroom with a dog spot");
      expect(res.error).toContain("A connected Calm-Down Room");
    }
  });
  it("arrivals need the daycare open", () => {
    const g = setF(guidedBuild(newTycoon(0)), { clockMin: 8 * 60 });
    expect(createArrival(g, r)).toEqual({ ok: false, error: "Open the daycare first." });
    expect(fac(tick(g, 600, () => 0)).dogs).toHaveLength(0);
    expect(fac(tick(g, 600, () => 0)).clockMin).toBe(8 * 60); // the day clock pauses while closed
    expect(createArrival(opened(), r).ok).toBe(true);
  });
});

describe("check-in", () => {
  it("random arrivals wait unchecked; check-in pays 0, adds 5 XP and counts 1 supply", () => {
    const a = ok(createArrival(opened(), r));
    const d = fac(a).dogs[0]!;
    expect(d).toMatchObject({ checkedIn: false, place: { kind: "lobby" } });
    const c = ok(checkIn(a, d.id));
    expect(c.coins).toBe(a.coins);
    expect(c.xp).toBe(a.xp + 5);
    expect(fac(c).ledger.at(-1)!.checkIns).toBe(1);
    expect(checkIn(c, d.id)).toEqual({ ok: false, error: `${d.name} is already checked in.` });
  });
  it("premium supplies add +5 happiness at check-in", () => {
    const a = ok(createArrival(setF(opened(), { supplies: "premium" }), r));
    const d = fac(a).dogs[0]!;
    expect(fac(ok(checkIn(a, d.id))).dogs[0]!.happiness).toBe(d.happiness + 5);
  });
  it("unchecked pups can't be roomed, bathed or checked out", () => {
    const a = ok(createArrival(opened(richState()), r));
    const d = fac(a).dogs[0]!;
    expect(assignRoom(a, d.id, roomOfType(a, "playroom").uid).ok).toBe(false);
    expect(bath(a, d.id).ok).toBe(false);
    expect(checkout(a, d.id, false).ok).toBe(false);
  });
  it("12:00–14:00 stops new drop-offs, but pups already inside can still be checked in", () => {
    const a = ok(createArrival(opened(), r));
    const noon = setF(a, { clockMin: 12 * 60 });
    expect(createArrival(noon, r).ok).toBe(false);
    expect(checkIn(noon, fac(noon).dogs[0]!.id).ok).toBe(true);
    expect(createArrival(setF(a, { clockMin: 14 * 60 }), r).ok).toBe(true);
  });
  it("arrivals never overflow the lobby's waiting spots", () => {
    // (owners now come back for their pups, so the lobby also empties again: check the most it ever held)
    // every arrival with rand = 0 is the same kind of pup: give it the playroom, so families drop off (book what you offer)
    let s = opened();
    const g = groupOf(fac(ok(createArrival(s, () => 0))).dogs.at(-1)!);
    const play = fac(s).rooms.find((r) => r.type === "playroom")!.uid;
    s = ok(setRoomType(s, play, "playroom", g));
    let most = 0;
    for (let i = 0; i < 300; i++) {
      s = tick(s, 1, () => 0);
      most = Math.max(most, lobbyDogs(fac(s)).length);
    }
    expect(most).toBe(4); // 2 + 2 for the bench
  });
});

describe("placing pups", () => {
  /** The guided build plus a small-active playroom north of the lobby. */
  function twoPlayrooms() {
    let s = ok(drawRoom(guidedBuild(newTycoon(0)), 16, 19, 3, 3));
    const uid = fac(s).rooms.at(-1)!.uid;
    s = ok(setRoomType(s, uid, "playroom", "small-active"));
    s = ok(addDoor(s, uid, { side: "S", i: 1 }));
    s = ok(placeThing(s, "dog_bed", 18, 19, 0));
    return { s: opened(s), active: uid, gentle: fac(s).rooms.find((x) => x.group === "small-gentle")!.uid };
  }
  it("a mismatch needs confirmation; confirmed placement is allowed", () => {
    const { s, active } = twoPlayrooms();
    const t = withDogs(s, [dog("a")]);
    const res = assignRoom(t, "a", active);
    expect(res).toMatchObject({ ok: false, error: expect.stringContaining("Confirm to place anyway") });
    expect(placed(ok(assignRoom(t, "a", active, true)), "a")).toEqual({ kind: "room", room: active });
  });
  it("a full playroom says so before any mismatch", () => {
    const { s, gentle } = twoPlayrooms();
    const t = withDogs(s, [dog("a", { place: { kind: "room", room: gentle } }), dog("b", { place: { kind: "room", room: gentle } }), dog("c", { size: "large" })]);
    expect(assignRoom(t, "c", gentle)).toEqual({ ok: false, error: "That playroom is full." });
  });
  it("compatible rooms never scuffle; mismatched rooms are a risk, not a guarantee", () => {
    const { s, gentle } = twoPlayrooms();
    const safe = withDogs(s, [dog("a", { place: { kind: "room", room: gentle } }), dog("b", { place: { kind: "room", room: gentle } })]);
    expect(fac(tick(safe, 100, () => 0)).scuffles).toEqual([]);
    const risky = withDogs(s, [dog("a", { place: { kind: "room", room: gentle } }), dog("b", { temper: "active", place: { kind: "room", room: gentle } })]);
    expect(fac(tick(risky, 1, () => 0.99)).scuffles).toEqual([]);
    expect(fac(tick(risky, 1, () => 0)).scuffles).toEqual([{ room: gentle }]);
  });
  it("scuffles block play, bath and checkout; separating works with exhausted staff and the lobby closed", () => {
    const { s, gentle } = twoPlayrooms();
    let t = withDogs(s, [dog("a", { place: { kind: "room", room: gentle } }), dog("b", { temper: "active", place: { kind: "room", room: gentle } })]);
    t = setF(tick(t, 1, () => 0), { clockMin: 12 * 60 + 30 });
    t = setF(t, { staff: fac(t).staff.map((x) => ({ ...x, energy: 0 })) });
    expect(playtime(t, "a")).toMatchObject({ ok: false, error: expect.stringContaining("Separate the scuffle") });
    expect(checkout(t, "a", false)).toMatchObject({ ok: false, error: expect.stringContaining("Separate the scuffle") });
    const before = t.coins;
    const sep = ok(separate(t, gentle));
    expect(sep.coins).toBe(before);
    expect(placed(sep, "b")).toEqual({ kind: "calm", room: roomOfType(sep, "calm").uid });
    expect(placed(sep, "a")).toEqual({ kind: "room", room: gentle });
    expect(fac(sep).scuffles).toEqual([]);
    const calmPup = fac(sep).dogs.find((d) => d.id === "b")!;
    expect(calmPup.happiness).toBeLessThan(50);
    expect(playtime(sep, "b")).toMatchObject({ ok: false, error: expect.stringContaining("calming down") });
  });
  it("a single pup can go to calm down preventively, free", () => {
    const { s, gentle } = twoPlayrooms();
    const t = withDogs(s, [dog("a", { place: { kind: "room", room: gentle } })]);
    const c = ok(toCalm(t, "a"));
    expect(c.coins).toBe(t.coins);
    expect(placed(c, "a").kind).toBe("calm");
    expect(fac(c).dogs[0]!.happiness).toBe(50);
  });
  it("a scuffle costs reputation once, when it starts (no drain while it lasts), never below the floor", () => {
    const { s, gentle } = twoPlayrooms();
    const before = withDogs(s, [dog("a", { place: { kind: "room", room: gentle } }), dog("b", { temper: "active", place: { kind: "room", room: gentle } })]);
    const t = tick(before, 1, () => 0);
    expect(fac(t).reputation).toBe(fac(before).reputation - 3);
    expect(fac(tick(t, 10, () => 0.99)).reputation).toBe(fac(t).reputation);
    const low = tick(setF(before, { reputation: 41 }), 1, () => 0);
    expect(fac(low).reputation).toBe(40);
  });
});

describe("care", () => {
  const inPlay = (s: TycoonState, over: Partial<TDog> = {}) => withDogs(opened(s), [dog("a", { place: { kind: "room", room: roomOfType(s, "playroom").uid }, ...over })]);
  it("playtime pays nothing, adds happiness and 2 XP, and costs staff energy", () => {
    const s = inPlay(guidedBuild(newTycoon(0)));
    const p = ok(playtime(s, "a"));
    expect(p.coins).toBe(s.coins);
    expect(p.xp).toBe(s.xp + 2);
    expect(fac(p).dogs[0]!.happiness).toBeGreaterThan(50);
    expect(fac(p).staff[0]!.energy).toBe(90);
  });
  it("staff energy gates services", () => {
    const s = inPlay(guidedBuild(newTycoon(0)));
    const t = setF(s, { staff: [{ id: "s0", name: "Phil", energy: 5 }] });
    expect(playtime(t, "a")).toEqual({ ok: false, error: "Staff are tired — let them rest a moment." });
  });
  it("baths need a working bath room with a tub", () => {
    const s = inPlay(guidedBuild(newTycoon(0)));
    expect(bath(s, "a")).toEqual({ ok: false, error: "Build a Bath Room with a tub first." });
    expect(checkout(s, "a", true)).toEqual({ ok: false, error: "Build a Bath Room with a tub first." });
  });
  it("a bath starts for 3 XP and pays nothing yet (the receipt charges it); it finishes clean; an overpriced bath is turned down", () => {
    const s = inPlay(richState());
    const b = ok(bath(s, "a"));
    expect(b.coins).toBe(s.coins);
    expect(b.xp).toBe(s.xp + 3);
    expect(fac(b).dogs[0]).toMatchObject({ bathing: BATH_MIN, bathed: false });
    expect(fac(tick(b, BATH_MIN / 2, () => 0.99)).dogs[0]).toMatchObject({ clean: 100, bathed: true });
    const pricey = setF(s, { prices: { ...fac(s).prices, bath: 80 } });
    expect(bath(pricey, "a")).toMatchObject({ ok: false, error: expect.stringMatching(/^Too pricey/) });
  });
  it("checkout at happiness 50 pays 32 and adds 10 XP; at 85 it adds 15 XP", () => {
    const s = inPlay(guidedBuild(newTycoon(0)));
    const c = ok(checkout(s, "a", false));
    expect(c.coins).toBe(s.coins + 32);
    expect(c.xp).toBe(s.xp + 10);
    expect(fac(c).dogs).toHaveLength(0);
    expect(fac(c).guestBook[0]).toMatchObject({ name: "Pup a", visits: 1 });
    expect(fac(c).ledger.at(-1)).toMatchObject({ checkouts: 1, income: { daycare: 32 } });
    // +5 XP for a delighted family (happy and played with), not for happiness alone
    const happy = inPlay(guidedBuild(newTycoon(0)), { happiness: 85, played: 1 });
    expect(ok(checkout(happy, "a", false)).xp).toBe(happy.xp + 15);
    const noPlay = inPlay(guidedBuild(newTycoon(0)), { happiness: 85 });
    expect(ok(checkout(noPlay, "a", false)).xp).toBe(noPlay.xp + 10);
  });
  it("only pups leaving a playroom or bed pay; the lobby and calm-down room send them home free", () => {
    const s = withDogs(opened(), [dog("a"), dog("b", { place: { kind: "calm", room: roomOfType(opened(), "calm").uid } })]);
    const a = ok(checkout(s, "a", false));
    expect(a.coins).toBe(s.coins);
    expect(a.xp).toBe(s.xp);
    expect(fac(a).dogs.map((d) => d.id)).toEqual(["b"]);
    expect(fac(a).stats.checkouts).toBe(0);
    const b = ok(checkout(a, "b", false));
    expect(b.coins).toBe(s.coins);
    expect(fac(b).dogs).toHaveLength(0);
  });
  it("cleaning mops the floor for 1 XP", () => {
    const s = setF(opened(), { cleanliness: 50 });
    const c = ok(clean(s));
    expect(fac(c).cleanliness).toBe(85);
    expect(c.xp).toBe(s.xp + 1);
    expect(clean(setF(s, { cleanliness: 100 })).ok).toBe(false);
  });
  it("Fun slows happiness decay", () => {
    const s = inPlay(guidedBuild(newTycoon(0)), { happiness: 80 });
    const plain = fac(tick(s, 10, () => 0.99)).dogs[0]!.happiness;
    const fun = setF(s, { items: [...fac(s).items, { uid: "py", kind: "play_yard", c: 11, r: 26, rot: 0, level: 3, spent: 0, room: null, closed: false }] });
    expect(fac(tick(fun, 10, () => 0.99)).dogs[0]!.happiness).toBeGreaterThan(plain);
  });
  it("staff energy regenerates faster with staff couches and generous wages", () => {
    const tiredOut = (s: TycoonState) => setF(s, { staff: [{ id: "s0", name: "Phil", energy: 0 }] });
    const base = fac(tick(tiredOut(opened()), 1, () => 0.99)).staff[0]!.energy;
    expect(base).toBe(2);
    const rich = fac(tick(tiredOut(setF(opened(richState()), { wage: "generous" })), 1, () => 0.99)).staff[0]!.energy;
    expect(rich).toBeCloseTo(2 * 1.25 * 2);
  });
});

describe("boarding", () => {
  it("a boarder needs a free connected bed, one each", () => {
    const s = opened(richState());
    const beds = fac(s).items.filter((i) => i.kind === "boarding_bed");
    const a = ok(createArrival(s, r, true));
    const pup = fac(a).dogs[0]!;
    const c = ok(checkIn(a, pup.id));
    expect(checkout(c, pup.id, false)).toMatchObject({ ok: true, msg: expect.stringContaining("no charge") });
    expect(ok(checkout(c, pup.id, false)).coins).toBe(c.coins);
    const b = ok(assignBed(c, pup.id, beds[0]!.uid));
    expect(placed(b, pup.id)).toEqual({ kind: "bed", room: beds[0]!.room, bed: beds[0]!.uid });
    const two = withDogs(b, [...fac(b).dogs, dog("z", { boarding: true })]);
    expect(assignBed(two, "z", beds[0]!.uid)).toMatchObject({ ok: false, error: expect.stringContaining("taken") });
    const full = withDogs(two, [...fac(two).dogs, dog("y", { boarding: true, place: { kind: "bed", room: beds[1]!.room!, bed: beds[1]!.uid } as TPlace })]);
    expect(createArrival(full, r, true)).toEqual({ ok: false, error: "No free boarding bed." });
    const out = ok(checkout(b, pup.id, true));
    expect(out.coins - b.coins).toBe(Math.round(40 * (0.6 + (0.4 * fac(b).dogs[0]!.happiness) / 100)) + 90 + 30);
  });
  it("no beds, no boarders", () => {
    expect(createArrival(opened(), r, true)).toEqual({ ok: false, error: "No free boarding bed." });
  });
});

describe("arrivals and prices", () => {
  /** Families over one open game day (07:00–18:00) when every pup is taken straight in — those who dropped off, plus
   *  those who asked for a kind of pup with no playroom here (they book what you offer). */
  function arrivals(price: number): number {
    const rand = mulberry(seedFrom("t"));
    let s = setF(opened(), { clockMin: 7 * 60 });
    s = ok(setPrice(s, "daycare", price));
    let n = 0;
    for (let i = 0; i < 330; i++) {
      s = tick(s, 1, rand);
      n += fac(s).dogs.length + Object.values(fac(s).asked?.groups ?? {}).reduce((a, b) => a + (b ?? 0), 0);
      s = withDogs(s, []);
      s = setF(s, { asked: null });
    }
    return n;
  }
  it("default prices draw about 540 × 0.04 × demand drop-offs a day; the top price draws far fewer", () => {
    const normal = arrivals(40); // expected ≈ 540 × 0.04 × 1.28 ≈ 28
    const top = arrivals(80); // expected ≈ 540 × 0.04 × 0.45 ≈ 10
    expect(normal).toBeGreaterThanOrEqual(14);
    expect(normal).toBeLessThanOrEqual(42);
    expect(top).toBeLessThan(normal / 1.8);
    expect(top).toBeGreaterThanOrEqual(3);
  });
  it("one real second is 2 game minutes; 18:00 closes the day and opens 07:00 the next", () => {
    let s = setF(opened(), { clockMin: 17 * 60 + 59 });
    s = countToday(s, "checkIns");
    s = tick(s, 1, () => 0.99);
    expect(fac(s)).toMatchObject({ day: 2, clockMin: 7 * 60 + 1 });
    expect(fac(s).report).toMatchObject({ day: 1, admitted: 1 });
    expect(s.coins).toBeLessThan(opened().coins); // wages, upkeep and supplies were charged
  });
  it("0.25 s steps add up like one 1 s step", () => {
    const s = opened();
    let a = s;
    for (let i = 0; i < 4; i++) a = tick(a, 0.25, () => 0.99);
    const b = tick(s, 1, () => 0.99);
    expect(fac(a).clockMin).toBeCloseTo(fac(b).clockMin);
    expect(fac(a).staff[0]!.energy).toBeCloseTo(fac(b).staff[0]!.energy);
  });
});

describe("Review Focus 1: doors and paths", () => {
  it("the only path can't be sold while a pup is inside (never trap pups); once it's out, it can, and new placements say Not connected", () => {
    let s = opened();
    const play = roomOfType(s, "playroom").uid;
    s = withDogs(s, [dog("a", { place: { kind: "room", room: play } })]);
    const path = fac(s).items.find((i) => i.kind === "path" && i.uid !== "entrance")!;
    expect(sellThing(s, path.uid)).toMatchObject({ ok: false, error: expect.stringMatching(/cut off/) });
    s = ok(checkout(s, "a", false));
    s = ok(sellThing(s, path.uid));
    s = withDogs(s, [dog("b")]);
    expect(assignRoom(s, "b", play)).toMatchObject({ ok: false, error: expect.stringMatching(/^Not connected/) });
  });
});

describe("time away and staff", () => {
  it("welcome-back gives a capped bonus, charges nothing and doesn't advance the day", () => {
    const s = { ...opened(), lastSeen: 0 };
    const hour = welcomeBack(s, 60 * 60 * 1000);
    expect(hour.bonus).toBe(120);
    expect(hour.state.coins).toBe(s.coins + 120);
    expect(fac(hour.state).day).toBe(fac(s).day);
    expect(fac(hour.state).clockMin).toBe(fac(s).clockMin);
    expect(fac(hour.state).staff[0]!.energy).toBe(100);
    expect(welcomeBack(s, 7 * 24 * 3600 * 1000).bonus).toBe(150);
    expect(welcomeBack(s, 60 * 1000).bonus).toBe(0);
  });
  it("hiring costs 250 for the second member, up to 6", () => {
    const s = opened();
    const h = ok(hireStaff(s));
    expect(h.coins).toBe(s.coins - 250);
    expect(fac(h).staff).toHaveLength(2);
    const six = setF(s, { staff: Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, name: "x", energy: 100 })) });
    expect(hireStaff(six)).toEqual({ ok: false, error: "Team is fully staffed." });
    expect(hireStaff({ ...s, coins: -5 })).toEqual({ ok: false, error: "Paused until your coins are back above zero." });
  });
});

describe("rush hour", () => {
  it("clearing 3+ waiting pups within 30 game minutes pays round(0.1 × 40 × peak) once a day", () => {
    let s = opened();
    for (let i = 0; i < 3; i++) s = ok(createArrival(s, r));
    const ids = fac(s).dogs.map((d) => d.id);
    for (const id of ids) s = ok(checkIn(s, id));
    s = setF(s, { clockMin: fac(s).clockMin + 20 });
    let last;
    for (const id of ids) {
      last = toCalm(s, id);
      s = ok(last);
    }
    expect(last).toMatchObject({ ok: true, msg: expect.stringContaining("Smooth operator! +12") });
    expect(fac(s).ledger.at(-1)!.income.bonus).toBe(12);
    // again the same day: no bonus
    s = withDogs(s, []);
    for (let i = 0; i < 3; i++) s = ok(createArrival(s, r));
    for (const d of fac(s).dogs) last = toCalm(s, d.id), (s = ok(last));
    expect(last).toMatchObject({ ok: true, msg: expect.not.stringContaining("Smooth operator") });
  });
  it("too slow, no bonus", () => {
    let s = opened();
    for (let i = 0; i < 3; i++) s = ok(createArrival(s, r));
    s = setF(s, { clockMin: fac(s).clockMin + 31 });
    let last;
    for (const d of fac(s).dogs) last = toCalm(s, d.id), (s = ok(last));
    expect(last).toMatchObject({ ok: true, msg: expect.not.stringContaining("Smooth operator") });
  });
});
