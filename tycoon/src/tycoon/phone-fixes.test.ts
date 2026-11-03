// Phone readiness (owner brief, 5 Nov): the six small review items and the introductory day.
import { describe, expect, it } from "vitest";
import { mulberry, seedFrom } from "@/game/engine";
import { buyExpansion, clearExpansionQuotes, expansionOptions, EXPANSION_LEVEL } from "./expansion";
import { xpForLevel } from "./progress";
import { bath, checkIn, setOpen, tick } from "./run";
import { fac, parseTycoon, withFac } from "./state";
import { hire, letGo } from "./team";
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
  const d: TDog = { id, name: id[0]!.toUpperCase() + id.slice(1), breed: 1, size: "small", temper: "gentle", visits: 1, place: { kind: "lobby" }, checkedIn: false, happiness: 80, clean: 60, boarding: false, played: 0, bathed: false, ...over };
  return { ...d, visit: { ...defaultVisit(f, d), arrivedDay: f.day, arrived: f.clockMin, ...visit } };
}
/** A daycare past its introductory day (the normal rules apply). */
function pastIntro(s0: TycoonState = richState()): TycoonState {
  const f = fac(s0);
  return withFac(s0, { ...f, open: true, clockMin: 9 * 60, introDay: 0, dogs: [] });
}

describe("time jumps run the same rules as normal play", () => {
  it("one big step equals the same time in one-second steps (same seed): warnings, billing and the day change can't be skipped", () => {
    const start = withFac(ok(hire(richState(), "reception")), { ...fac(richState()), open: true, clockMin: 17 * 60, introDay: 0 });
    const a = tick(start, 45, mulberry(seedFrom("jump")));
    let b = start;
    const r = mulberry(seedFrom("jump"));
    for (let i = 0; i < 45; i++) b = tick(b, 1, r);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(fac(a).day).toBe(fac(start).day + 1);
  });
  it("normal steps across closing: the day changes once and the report is written once", () => {
    let s = withFac(richState(), { ...fac(richState()), open: true, clockMin: 17 * 60 + 55, introDay: 0 });
    const day = fac(s).day;
    for (let i = 0; i < 10; i++) s = tick(s, 0.5, still);
    expect(fac(s).day).toBe(day + 1);
    expect(fac(s).ledger.filter((l) => l.day === day)).toHaveLength(1);
  });
});

describe("staff names are unique; ids never come from names", () => {
  it("letting someone go and hiring again never repeats a name on the team", () => {
    let s = ok(hire(richState(), "reception"));
    s = ok(hire(s, "attendant"));
    const maya = fac(s).staff[1]!;
    s = ok(letGo(s, maya.id));
    s = ok(hire(s, "bath"));
    const names = fac(s).staff.map((x) => x.name);
    expect(new Set(names).size).toBe(names.length);
    const ids = fac(s).staff.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("staff baths obey the same price check as the Bath button", () => {
  it("a bath priced above what families will pay: the player can't start it, and neither can staff — the player decides", () => {
    let s = ok(hire(pastIntro(), "bath"));
    const f = fac(s);
    s = withFac(s, { ...f, prices: { ...f.prices, bath: 400 }, dogs: [pup(f, "luna", { place: { kind: "room", room: playroom(f).uid }, checkedIn: true }, { requests: ["daycare", "bath"] })] });
    expect(bath(s, "luna").ok).toBe(false);
    s = run(s, 20);
    expect(fac(s).dogs[0]!.bathing ?? null).toBeNull();
    expect(fac(s).staff.at(-1)!.note).toMatch(/price/i);
  });
});

describe("families still at the desk at closing", () => {
  it("are kindly rescheduled once — no visit judged, no charge, no reputation change; a checked-in boarder stays", () => {
    let s = pastIntro();
    const f = fac(s);
    s = withFac(s, { ...f, clockMin: 17 * 60 + 50, dogs: [pup(f, "late", { boarding: true }, { arrived: 17 * 60 + 45 }), pup(f, "guest", { boarding: true }, { arrived: 9 * 60 })] });
    s = ok(checkIn(s, "guest"));
    const rep = fac(s).reputation;
    const outcomes = fac(s).outcomes.length;
    s = run(s, 30);
    const g = fac(s);
    expect(g.dogs.some((d) => d.id === "late")).toBe(false);
    expect(g.dogs.some((d) => d.id === "guest")).toBe(true);
    expect(g.outcomes).toHaveLength(outcomes + g.outcomes.filter((o) => o.dog === "Guest").length);
    expect(g.outcomes.some((o) => o.dog === "Late")).toBe(false);
    expect(g.reputation).toBe(rep);
    expect(g.courtesy?.names).toContain("Late");
    s = run(s, 120); // the next morning: nothing more happens to "late"
    expect(fac(s).outcomes.some((o) => o.dog === "Late")).toBe(false);
  });
});

describe("no hidden state shared between games", () => {
  it("a staff note about a pup that left uses the name recorded on the job, not a module-level memory", () => {
    let s = ok(hire(pastIntro(), "attendant"));
    const f = fac(s);
    s = withFac(s, { ...f, dogs: [pup(f, "luna", { place: { kind: "room", room: playroom(f).uid }, checkedIn: true, happiness: 40 })] });
    s = run(s, 1);
    expect(fac(s).staff.at(-1)!.job?.who).toBe("Luna");
  });
  it("expansion quotes are a pure memo: clearing it changes nothing, and two games with the same layout agree", () => {
    const s = { ...richState(), coins: 20000, xp: xpForLevel(EXPANSION_LEVEL) + 10000 };
    const a = expansionOptions(s).map((o) => o.cost);
    clearExpansionQuotes();
    const b = expansionOptions({ ...s, coins: 5 }).map((o) => o.cost);
    expect(b).toEqual(a);
    const bought = ok(buyExpansion(s, "playroom"));
    expect(expansionOptions(bought).find((o) => o.id === "playroom")!.cost).not.toBe(-1);
  });
});

describe("the introductory day", () => {
  it("is the first day the daycare opens, saved so reloads agree", () => {
    const s0 = richState();
    const f = fac(s0);
    const fresh = withFac(s0, { ...f, open: false, day: 1, stats: { ...f.stats, checkouts: 0 }, introDay: null });
    const s = ok(setOpen(fresh, true));
    expect(fac(s).introDay).toBe(1);
    expect(fac(parseTycoon(JSON.parse(JSON.stringify(s)))!).introDay).toBe(1);
  });
  it("a family ignored to the limit on the introductory day is kindly rescheduled: no upset outcome, no reputation loss, a tip", () => {
    let s = richState();
    const f = fac(s);
    s = withFac(s, { ...f, open: true, clockMin: 9 * 60, introDay: f.day, dogs: [pup(f, "bruno", {}, { owner: "Taylor" })] });
    const rep = fac(s).reputation;
    s = run(s, 65);
    expect(fac(s).dogs).toHaveLength(0);
    expect(fac(s).outcomes).toHaveLength(0);
    expect(fac(s).reputation).toBe(rep);
    expect(fac(s).courtesy).toMatchObject({ why: "intro", names: ["Bruno"] });
  });
  it("after it, the normal rule applies: the family leaves upset at 60 game minutes", () => {
    let s = pastIntro();
    const f = fac(s);
    s = withFac(s, { ...f, dogs: [pup(f, "bruno")] });
    s = run(s, 65);
    expect(fac(s).outcomes.at(-1)).toMatchObject({ dog: "Bruno", how: "left", mood: "upset" });
  });
  it("an old save that already ran days isn't given a second introductory day", () => {
    const s = richState();
    const f = fac(s);
    const old = JSON.parse(JSON.stringify(withFac(s, { ...f, day: 4, stats: { ...f.stats, checkouts: 12 } })));
    delete old.facilities.f1.introDay;
    expect(fac(parseTycoon(old)!).introDay).toBe(0);
  });
  it("an already checked-in pup never disappears because an arrival timer ran out", () => {
    let s = pastIntro();
    const f = fac(s);
    s = withFac(s, { ...f, dogs: [pup(f, "milo", { checkedIn: true }, { arrived: 7 * 60 })] });
    s = run(s, 90);
    expect(fac(s).dogs.some((d) => d.id === "milo")).toBe(true);
  });
});

describe("rules don't depend on the frame rate or graphics", () => {
  it("the busy scene over 40 game minutes gives the same results in quarter-second steps (a fast browser) and one-second steps (a slow phone)", async () => {
    const { buildScenario } = await import("./scenarios");
    const base = buildScenario("busy", 0);
    let fast = base;
    for (let i = 0; i < 80; i++) fast = tick(fast, 0.25, still);
    let slow = base;
    for (let i = 0; i < 20; i++) slow = tick(slow, 1, still);
    const key = (s: TycoonState) => ({ coins: s.coins, clock: fac(s).clockMin, outcomes: fac(s).outcomes.map((o) => `${o.dog}:${o.total}`), dogs: fac(s).dogs.map((d) => `${d.id}:${d.played}:${d.bathed}:${d.checkedIn}:${d.place.kind}`).sort() });
    expect(key(fast)).toEqual(key(slow));
  });
});

describe("a calm-room safety move stays penalty-free", () => {
  it("a pup kept safe in the calm room all day: no charge, and the family is never upset — no reputation lost", async () => {
    const { settle } = await import("./run");
    let s = pastIntro();
    const f = fac(s);
    const calm = f.rooms.find((r) => r.type === "calm")!.uid;
    const d = pup(f, "otis", { place: { kind: "calm", room: calm }, checkedIn: true, happiness: 0 }, { safeMove: true, ownerHere: 15 * 60 });
    s = withFac(s, { ...f, clockMin: 15 * 60 + 5, dogs: [d] });
    const rep = fac(s).reputation;
    s = ok(settle(s, "otis", "checkout"));
    const o = fac(s).outcomes.at(-1)!;
    expect(o.total).toBe(0);
    expect(o.mood).not.toBe("upset");
    expect(fac(s).reputation).toBeGreaterThanOrEqual(rep);
  });
});
