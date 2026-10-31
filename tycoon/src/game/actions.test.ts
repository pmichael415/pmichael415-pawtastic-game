import { describe, expect, it } from "vitest";
import { admitDog, assignRoom, buyUpgrade, createArrival, newGame, BREAK_START, type GameState } from "./engine";
import { bestRoom, describePlace, primaryAction, roomOptions } from "./actions";

const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]!; };
const smallGentle = seq([0.2, 0, 0.1, 0.5, 0.5, 0.5, 0.5]);
const largeActive = seq([0, 0, 0.9, 0.5, 0.5, 0.5, 0.5]);
const must = (r: { ok: boolean; state?: GameState; error?: string }) => { if (!r.ok) throw new Error(r.error); return r.state!; };
const rich = (): GameState => ({ ...newGame(0, "d"), coins: 5000, clockMin: 9 * 60 });

describe("primary action per pup", () => {
  it("a just-dropped-off pup's first action is Check in (also during the midday closure)", () => {
    const s = must(createArrival(rich(), smallGentle));
    const a = primaryAction(s, s.dogs[0]!);
    expect(a.id).toBe("checkin");
    expect(a.label).toMatch(/Check in/);
    const closed = primaryAction({ ...s, clockMin: BREAK_START + 10 }, s.dogs[0]!);
    expect(closed.id).toBe("checkin");
    expect(closed.apply && closed.apply({ ...s, clockMin: BREAK_START + 10 }).ok).toBe(true);
  });

  it("after check-in it offers the matching playroom, and applying it is a safe match", () => {
    const s = must(admitDog(rich(), smallGentle));
    const a = primaryAction(s, s.dogs[0]!);
    expect(a.id).toBe("assign");
    expect(a.label).toMatch(/Small & Gentle/);
    const r = a.apply!(s);
    expect(r.ok && r.state.dogs[0]!.place).toEqual({ kind: "room", group: "small-gentle" });
  });

  it("when the matching room is full it explains why instead of mis-grouping", () => {
    let s = rich();
    for (let i = 0; i < 2; i++) { s = must(admitDog(s, smallGentle)); s = must(assignRoom(s, s.dogs[i]!.id, "small-gentle")); }
    s = must(admitDog(s, smallGentle));
    const a = primaryAction(s, s.dogs[2]!);
    expect(a.id).toBe("none");
    expect(a.reason).toMatch(/full/);
    expect(bestRoom(s, s.dogs[2]!)).toBeNull();
  });

  it("boarders are offered an open private suite", () => {
    let s = must(buyUpgrade(rich(), "boarding"));
    s = must(admitDog(s, smallGentle, true));
    const a = primaryAction(s, s.dogs[0]!);
    expect(a.id).toBe("suite");
    expect(a.apply!(s).ok).toBe(true);
  });

  it("a pup in an active scuffle must be separated first", () => {
    let s = must(admitDog(rich(), smallGentle));
    s = must(assignRoom(s, s.dogs[0]!.id, "small-gentle"));
    s = must(admitDog(s, largeActive));
    s = must(assignRoom(s, s.dogs[1]!.id, "small-gentle", true));
    s = { ...s, scuffles: [{ site: "hawthorne", group: "small-gentle" }] };
    for (const d of s.dogs) expect(primaryAction(s, d).id).toBe("separate");
    const r = primaryAction(s, s.dogs[0]!).apply!(s);
    expect(r.ok && r.state.scuffles).toEqual([]);
    expect(r.ok && r.earned).toBeUndefined();
  });

  it("room options rate every playroom by BOTH size and temperament", () => {
    const s = must(admitDog(rich(), largeActive));
    const opts = Object.fromEntries(roomOptions(s, s.dogs[0]!).map((o) => [o.group, o.status]));
    expect(opts).toEqual({ "small-gentle": "warn", "small-active": "warn", "large-gentle": "warn", "large-active": "fit" });
  });

  it("describes location and check-in status in plain words", () => {
    const s = must(createArrival(rich(), smallGentle));
    expect(describePlace(s, s.dogs[0]!)).toMatch(/Lobby · waiting for check-in/);
    const t = must(admitDog(rich(), smallGentle));
    expect(describePlace(t, t.dogs[0]!)).toMatch(/Lobby · checked in/);
  });
});
