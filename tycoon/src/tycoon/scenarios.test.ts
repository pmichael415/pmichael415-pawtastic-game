// Private test scenarios are repeatable and live in their own save — never the player's (phone readiness, tasks 1, 6).
import { afterEach, describe, expect, it, vi } from "vitest";
import { caps } from "./connect";
import { buildScenario } from "./scenarios";
import { tick } from "./run";
import { fac } from "./state";

describe("test scenarios", () => {
  it("the busy scene: a grown daycare with 6 staff and 30 pups, built from the real rules", () => {
    const s = buildScenario("busy", 0);
    const f = fac(s);
    expect(f.dogs).toHaveLength(30);
    expect(f.staff).toHaveLength(6);
    expect(caps(f).playrooms.length).toBeGreaterThanOrEqual(2);
    expect(caps(f).tubs).toHaveLength(2);
    expect(f.open).toBe(true);
    expect(f.name).toMatch(/^Test daycare/);
  });
  it("a normal day: the quick-start daycare with a receptionist and an attendant", () => {
    const f = fac(buildScenario("normal", 0));
    expect(f.staff.map((x) => x.role ?? "-")).toEqual(["-", "reception", "attendant"]);
    expect(f.dogs).toHaveLength(6);
  });
  it("repeatable: the same scenario is the same save every time", () => {
    expect(JSON.stringify(buildScenario("busy", 5))).toBe(JSON.stringify(buildScenario("busy", 5)));
  });
  it("it plays: a minute of game time runs without error and staff take jobs", () => {
    let s = buildScenario("busy", 0);
    for (let i = 0; i < 30; i++) s = tick(s, 0.5, () => 0.99);
    expect(fac(s).staff.some((x) => x.job)).toBe(true);
  });
});

describe("test saves never touch the player's save", () => {
  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.resetModules();
  });
  it("in test mode the store reads and writes the test key; the player's save stays byte-for-byte the same", async () => {
    localStorage.setItem("pawtastic-daycare-next-v1", '{"v":1,"mine":true}');
    sessionStorage.setItem("pawtastic-test-save", "normal");
    vi.resetModules();
    const store = await import("./store");
    expect(store.SAVE_KEY).toBe(store.TEST_KEY);
    expect(store.testScenario()).toBe("normal");
    const unsub = store.tycoonStore.subscribe(() => {});
    store.tycoonStore.set((s) => ({ ...s, coins: s.coins + 1 }));
    unsub();
    expect(localStorage.getItem("pawtastic-daycare-next-v1")).toBe('{"v":1,"mine":true}');
  });
  it("without the flag, the player's own key is used", async () => {
    vi.resetModules();
    const store = await import("./store");
    expect(store.SAVE_KEY).toBe(store.KEY);
  });
});
