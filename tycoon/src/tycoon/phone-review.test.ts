// Fixes from the independent review of the phone-readiness work (each test reproduces one finding).
import { afterEach, describe, expect, it, vi } from "vitest";
import { tick } from "./run";
import { fac, newTycoon, withFac } from "./state";
import { hire, deskTile } from "./team";
import { quickStart } from "./start";
import { ok, richState } from "./testkit";
import { skipTour, startTour } from "./tour";
import { defaultVisit } from "./visit";
import type { TDog, TycoonState } from "./types";

const still = () => 0.99;

describe("C1: Quick start players get the introductory day", () => {
  it("quick start → guide skipped → a family ignored for an hour is kindly rescheduled, not judged", () => {
    let s = skipTour(startTour(newTycoon(0), "quick", 0));
    if (!fac(s).rooms.length) s = ok(quickStart(s));
    s = withFac(s, { ...fac(s), open: true });
    s = tick(s, 0.5, still); // the first open minute marks the day
    const f = fac(s);
    expect(f.introDay).toBe(f.day);
    const d: TDog = { id: "x1", name: "Bruno", breed: 0, size: "large", temper: "active", visits: 1, place: { kind: "lobby" }, checkedIn: false, happiness: 80, clean: 60, boarding: false, played: 0, bathed: false };
    s = withFac(s, { ...f, dogs: [{ ...d, visit: { ...defaultVisit(f, d), arrivedDay: f.day, arrived: f.clockMin } }] });
    const rep = fac(s).reputation;
    for (let i = 0; i < 130; i++) s = tick(s, 0.5, still);
    expect(fac(s).outcomes.filter((o) => o.dog === "Bruno")).toHaveLength(0);
    expect(fac(s).reputation).toBeGreaterThanOrEqual(rep);
  });
});

describe("I3: a staff job that finishes before a deadline wins, whatever the step size", () => {
  it("a check-in finishing 0.4 game minutes before the 60-minute limit happens in quarter-second and one-second steps alike", () => {
    const s0 = ok(hire(richState(), "reception"));
    const f = fac(s0);
    const room = f.rooms.find((r) => r.type === "playroom")!;
    const [size, temper] = (room.group ?? "small-gentle").split("-") as ["small" | "large", "gentle" | "active"];
    const d: TDog = { id: "x1", name: "Bruno", breed: 1, size, temper, visits: 1, place: { kind: "lobby" }, checkedIn: false, happiness: 80, clean: 60, boarding: false, played: 0, bathed: false };
    const dog = { ...d, visit: { ...defaultVisit(f, d), owner: "Taylor", arrivedDay: f.day, arrived: 9 * 60 } };
    const rec = f.staff.at(-1)!;
    const staff = f.staff.map((x) => (x.id === rec.id ? { ...x, energy: 100, at: deskTile(f), job: { kind: "checkin" as const, dog: "x1", room: room.uid, tub: null, bed: null, phase: "work" as const, left: 0.4, total: 4, to: deskTile(f), who: "Bruno" } } : x));
    const start: TycoonState = withFac(s0, { ...f, open: true, introDay: 0, clockMin: 9 * 60 + 59, dogs: [dog], staff });
    let fast = start;
    for (let i = 0; i < 8; i++) fast = tick(fast, 0.25, still);
    let slow = start;
    for (let i = 0; i < 2; i++) slow = tick(slow, 1, still);
    for (const x of [fast, slow]) {
      expect(fac(x).dogs.find((q) => q.id === "x1")?.checkedIn).toBe(true);
      expect(fac(x).outcomes).toHaveLength(0);
    }
  });
});

describe("I2: switching test saves starts the new one fresh", () => {
  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.resetModules();
  });
  it("leaving a test save never writes it back on the way out", async () => {
    sessionStorage.setItem("pawtastic-test-save", "normal");
    vi.resetModules();
    const store = await import("./store");
    const unsub = store.tycoonStore.subscribe(() => {});
    store.tycoonStore.set((s) => ({ ...s, coins: s.coins + 1 }));
    store.stopSaving(); // what switchSave does before it reloads
    localStorage.removeItem(store.TEST_KEY);
    window.dispatchEvent(new Event("pagehide"));
    store.tycoonStore.set((s) => ({ ...s, coins: s.coins + 1 }));
    unsub();
    expect(localStorage.getItem(store.TEST_KEY)).toBeNull();
  });
});

describe("minor→important: a lock or a background isn't one giant frame in the diagnostics", () => {
  it("an interval longer than a second (the page was away) isn't recorded", async () => {
    const diag = await import("./diag");
    diag.setDiag(true);
    diag.recordFrame(16.7, 1);
    diag.recordFrame(30000, 1);
    diag.recordFrame(16.7, 1);
    expect(diag.summary().longestFrame).toBeLessThan(1000);
    diag.setDiag(false);
  });
});
