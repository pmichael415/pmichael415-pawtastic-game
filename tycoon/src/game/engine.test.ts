import { describe, expect, it } from "vitest";
import { admitDog, applyRun, bath, buyUpgrade, capacity, checkout, hireStaff, newGame, parseSave, tick, welcomeBack, MAX_OFFLINE_REWARD } from "./engine";

const r = () => 0.5;
const fresh = () => newGame(0, "2026-10-31");

describe("tycoon rules", () => {
  it("starts with 500 coins and 8 playroom spots (4 rooms x 2)", () => {
    expect(fresh().coins).toBe(500);
    expect(capacity(fresh())).toBe(8);
  });

  it("refuses unaffordable upgrades and keeps coins", () => {
    const s = fresh();
    expect(buyUpgrade(s, "hillsdale").ok).toBe(false);
    const res = buyUpgrade({ ...s, coins: 299 }, "yard1");
    expect(res.ok).toBe(false);
    const ok = buyUpgrade(s, "yard1");
    expect(ok.ok && ok.state.coins).toBe(200);
  });

  it("second staff costs 250 and staff energy gates services", () => {
    const h = hireStaff(fresh());
    expect(h.ok && h.state.coins).toBe(250);
    let s = admitDog(fresh(), r);
    if (!s.ok) throw 0;
    const tired = { ...s.state, staff: s.state.staff.map((x) => ({ ...x, energy: 5 })) };
    expect(bath(tired, tired.dogs[0]!.id).ok).toBe(false);
  });

  it("boarding requires the upgrade", () => {
    expect(admitDog(fresh(), r, true).ok).toBe(false);
  });

  it("checkout removes the dog and pays", () => {
    const a = admitDog(fresh(), r);
    if (!a.ok) throw 0;
    const c = checkout(a.state, a.state.dogs[0]!.id, false);
    expect(c.ok && c.state.dogs.length).toBe(0);
    expect(c.ok && c.state.coins).toBeGreaterThan(a.state.coins);
  });

  it("never takes coins over time and absence is not punished", () => {
    const s = { ...fresh(), lastSeen: 0 };
    expect(tick(s, 600, () => 0.99).coins).toBe(500);
    const w = welcomeBack(s, 1000 * 60 * 60 * 24 * 7);
    expect(w.bonus).toBe(MAX_OFFLINE_REWARD);
    expect(w.state.staff[0]!.energy).toBe(100);
  });

  it("recess run coins are capped at 120", () => {
    expect(applyRun(fresh(), 99999).coins).toBe(120);
  });

  it("rejects corrupt or negative saves", () => {
    expect(parseSave({ ...fresh(), coins: -5 })).toBeNull();
    expect(parseSave("x")).toBeNull();
  });
});
