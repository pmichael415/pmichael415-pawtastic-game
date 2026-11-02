import { describe, expect, it } from "vitest";
import { newGame, type GameState } from "./engine";
import {
  daycareOf, withDaycare, recessOf, withRecess, parseRecess, parseDaycare, parseGraduationSave,
  hasProgress, planSignIn, summaryOf, slotHash,
} from "./cloudSlots";

const fresh = (): GameState => newGame(0, "2026-11-01");
const played = (): GameState => ({
  ...fresh(), coins: 1840, gameDay: 4, upgrades: ["boarding"],
  stats: { ...fresh().stats, admitted: 30, runs: 2 },
  recessBest: 420, recessDay: "2026-11-01", recessCoinsToday: 120,
});
const grad = (levels: Record<string, { stars: number; score: number }>, name = "Biscuit") =>
  ({ version: 1 as const, dog: { name }, progress: { unlocked: 9, levels, badges: [] }, treats: { free: 5, converted: 0, paid: 0 } });

describe("each game's cloud save is its own slice of the progress", () => {
  it("the Daycare save leaves out Recess Rush's own fields (best score, today's coins)", () => {
    const d = daycareOf(played());
    expect(d).toMatchObject({ coins: 1840, gameDay: 4, recessBest: 0, recessCoinsToday: 0, recessDay: "" });
    expect(d.stats.runs).toBe(2); // run count drives daycare missions and team chapters, so it stays here
  });

  it("loading a Daycare save keeps this phone's Recess Rush progress", () => {
    const local = { ...fresh(), recessBest: 999, recessDay: "2026-11-01", recessCoinsToday: 60 };
    const merged = withDaycare(local, daycareOf(played()));
    expect(merged).toMatchObject({ coins: 1840, gameDay: 4, recessBest: 999, recessCoinsToday: 60 });
  });

  it("loading a Recess Rush save keeps this phone's daycare", () => {
    const local = played();
    const merged = withRecess({ ...local, coins: 77 }, { best: 1500, day: "2026-11-01", coinsToday: 300 });
    expect(merged).toMatchObject({ coins: 77, recessBest: 1500, recessCoinsToday: 300, gameDay: 4 });
    expect(recessOf(played())).toEqual({ best: 420, day: "2026-11-01", coinsToday: 120 });
  });

  it("cloud data is validated before it can touch the phone", () => {
    expect(parseRecess({ best: 1e9, day: "2026-11-01", coinsToday: 9999 })).toEqual({ best: 5000, day: "2026-11-01", coinsToday: 300 });
    expect(parseRecess("nope")).toBeNull();
    expect(parseDaycare({ v: 4, coins: 10, dogs: [], staff: [] })!.coins).toBe(10);
    expect(parseDaycare(null)).toBeNull();
    expect(parseGraduationSave(grad({ 1: { stars: 3, score: 900 } }))).not.toBeNull();
    expect(parseGraduationSave({ version: 2 })).toBeNull();
    expect(parseGraduationSave([])).toBeNull();
    expect(parseGraduationSave({ version: 1, junk: "x".repeat(120_000) })).toBeNull();
  });
});

describe("what counts as real progress", () => {
  it("a fresh daycare, an unplayed Recess Rush or an enrolled pup with no levels don't count", () => {
    expect(hasProgress("daycare", daycareOf(fresh()))).toBe(false);
    expect(hasProgress("recess", recessOf(fresh()))).toBe(false);
    expect(hasProgress("graduation", grad({}))).toBe(false);
    expect(hasProgress("daycare", daycareOf(played()))).toBe(true);
    expect(hasProgress("recess", recessOf(played()))).toBe(true);
    expect(hasProgress("graduation", grad({ 1: { stars: 1, score: 100 } }))).toBe(true);
  });

  it("summaries say what's in each save", () => {
    expect(summaryOf("daycare", daycareOf(played()))).toBe("Day 4 · 1840 coins · 30 pups checked in");
    expect(summaryOf("recess", recessOf(played()))).toBe("Best score 420");
    expect(summaryOf("graduation", grad({ 1: { stars: 3, score: 1 }, 2: { stars: 2, score: 1 } }))).toBe("Biscuit · 2 levels passed");
  });
});

describe("signing in on a phone: what happens to each game", () => {
  const cloud = (hasProg: boolean, hash = "c", revision = 3) => ({ hasProgress: hasProg, hash, revision });
  it("nothing in the cloud: real progress here is saved; otherwise just start syncing", () => {
    expect(planSignIn({ has: true, hash: "a" }, null)).toEqual({ action: "upload", expected: 0 });
    expect(planSignIn({ has: false, hash: "a" }, null)).toEqual({ action: "link", revision: 0 });
    expect(planSignIn(null, null)).toEqual({ action: "link", revision: 0 });
  });
  it("cloud progress and nothing real here: it loads by itself", () => {
    expect(planSignIn({ has: false, hash: "a" }, cloud(true))).toEqual({ action: "load" });
    expect(planSignIn(null, cloud(true))).toEqual({ action: "load" });
  });
  it("the same progress in both places just links", () => {
    expect(planSignIn({ has: true, hash: "c" }, cloud(true, "c", 7))).toEqual({ action: "link", revision: 7 });
  });
  it("an empty cloud save is replaced by real progress here", () => {
    expect(planSignIn({ has: true, hash: "a" }, cloud(false, "c", 2))).toEqual({ action: "upload", expected: 2 });
  });
  it("real progress in both places: the player chooses, for that game only", () => {
    expect(planSignIn({ has: true, hash: "a" }, cloud(true))).toEqual({ action: "ask" });
  });
  it("hashes ignore the last-seen time so an idle phone isn't 'different'", () => {
    const s = daycareOf(played());
    expect(slotHash("daycare", s)).toBe(slotHash("daycare", { ...s, lastSeen: 12345 }));
  });
});

describe("purchases never travel in cloud saves (free progress only)", () => {
  const O = "00000000-0000-4000-8000-00000000000a";
  it("the uploaded Daycare slot carries no power-ups and no delivery log", () => {
    const s: GameState = { ...newGame(0, "2026-11-02"), recessPowerups: { shield: 7, life: 3 }, deliveries: { applied: [O], done: [] } };
    const up = daycareOf(s);
    expect(up.recessPowerups).toEqual({ shield: 0, life: 0 });
    expect(up.deliveries).toEqual({ applied: [], done: [] });
  });
  it("restoring a Daycare slot keeps this device's power-ups and delivery log", () => {
    const local: GameState = { ...newGame(0, "2026-11-02"), recessPowerups: { shield: 2, life: 1 }, deliveries: { applied: [], done: [O] } };
    const cloud: GameState = { ...newGame(0, "2026-11-02"), coins: 9999, recessPowerups: { shield: 50, life: 50 }, deliveries: { applied: [], done: [] } };
    const r = withDaycare(local, cloud);
    expect(r.coins).toBe(9999);
    expect(r.recessPowerups).toEqual({ shield: 2, life: 1 });
    expect(r.deliveries).toEqual({ applied: [], done: [O] });
    expect(withDaycare(null, cloud).recessPowerups).toEqual({ shield: 0, life: 0 });
  });
});
