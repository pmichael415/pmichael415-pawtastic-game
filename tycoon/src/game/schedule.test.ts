import { describe, expect, it } from "vitest";
import {
  admitDog, assignRoom, BREAK_END, BREAK_START, DAY_CLOSE, DAY_OPEN, hasScuffle, lobbyDogs, playtime, lobbyStatus, LOBBY_CAP, newGame, parseSave, REP_MIN, roomAtRisk, roomDogs, separateDogs, tick, welcomeBack, type GameState,
} from "./engine";

const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]!; };
const smallGentle = seq([0.2, 0, 0.1, 0.5, 0.5, 0.5, 0.5]);
const largeActive = seq([0, 0, 0.9, 0.5, 0.5, 0.5, 0.5]);
const never = () => 0.99;
const always = () => 0;
const at = (min: number, s: GameState = newGame(0, "d")) => ({ ...s, clockMin: min });
function must(r: ReturnType<typeof admitDog>): GameState { if (!r.ok) throw new Error(r.error); return r.state; }

describe("game clock & midday lobby closure", () => {
  it("lobby is open at 11:59, closed at 12:00 and 13:59, open again at 14:00", () => {
    expect(lobbyStatus(11 * 60 + 59).open).toBe(true);
    expect(lobbyStatus(BREAK_START).open).toBe(false);
    expect(lobbyStatus(13 * 60 + 59).open).toBe(false);
    expect(lobbyStatus(BREAK_END).open).toBe(true);
  });

  it("drop-offs are refused during the break but accepted at 14:00", () => {
    expect(admitDog(at(12 * 60), smallGentle).ok).toBe(false);
    expect(admitDog(at(13 * 60 + 59), smallGentle).ok).toBe(false);
    expect(admitDog(at(14 * 60), smallGentle).ok).toBe(true);
    expect(admitDog(at(11 * 60 + 59), smallGentle).ok).toBe(true);
  });

  it("one real second advances the clock 2 game minutes; 18:00 rolls to next day 07:00", () => {
    expect(tick(at(600), 1, never).clockMin).toBe(602);
    const t = tick(at(DAY_CLOSE - 1), 1, never);
    expect(t.clockMin).toBe(DAY_OPEN + 1);
    expect(t.gameDay).toBe(2);
  });

  it("random customers drop off into the lobby while open", () => {
    const s = tick(at(9 * 60), 1, always);
    expect(lobbyDogs(s, "hawthorne").length).toBeGreaterThan(0);
  });

  it("no random arrivals during 12:00–14:00, but care continues", () => {
    const s = tick(at(12 * 60), 30, always); // 60 game minutes, all inside the break
    expect(s.dogs.length).toBe(0);
    expect(s.clockMin).toBe(13 * 60);
  });

  it("arrivals never overflow the lobby", () => {
    const s = tick(at(8 * 60), 60, always);
    expect(lobbyDogs(s, "hawthorne").length).toBeLessThanOrEqual(LOBBY_CAP);
  });

  it("time away (paused / closed tab) does not advance the clock or add dogs", () => {
    const s = at(700);
    const w = welcomeBack(s, 1000 * 60 * 60);
    expect(w.state.clockMin).toBe(700);
    expect(w.state.dogs.length).toBe(0);
  });
});

describe("grouping & scuffle risk", () => {
  function mixedRoom() {
    let s = at(9 * 60);
    s = must(admitDog(s, largeActive));
    s = must(admitDog(s, smallGentle));
    s = must(assignRoom(s, s.dogs[0]!.id, "large-active"));
    return s;
  }

  it("mismatch requires confirmation; confirmed placement is allowed", () => {
    const s = mixedRoom();
    expect(assignRoom(s, s.dogs[1]!.id, "large-active").ok).toBe(false);
    const ok = assignRoom(s, s.dogs[1]!.id, "large-active", true);
    expect(ok.ok).toBe(true);
    expect(ok.ok && roomAtRisk(ok.state, "hawthorne", "large-active")).toBe(true);
  });

  it("compatible rooms never scuffle", () => {
    let s = at(9 * 60);
    s = must(admitDog(s, largeActive));
    s = must(admitDog(s, largeActive));
    s = must(assignRoom(s, s.dogs[0]!.id, "large-active"));
    s = must(assignRoom(s, s.dogs[1]!.id, "large-active"));
    expect(roomAtRisk(s, "hawthorne", "large-active")).toBe(false);
    const t = tick({ ...s, clockMin: 12 * 60 }, 20, always);
    expect(t.scuffles.length).toBe(0);
  });

  it("mismatched room is a risk, not a guarantee", () => {
    const base = mixedRoom();
    const r = assignRoom(base, base.dogs[1]!.id, "large-active", true);
    if (!r.ok) throw 0;
    const s = { ...r.state, clockMin: 12 * 60 };
    expect(tick(s, 1, never).scuffles.length).toBe(0);
    expect(hasScuffle(tick(s, 1, always), "hawthorne", "large-active")).toBe(true);
  });

  it("separating dogs works even while the public lobby is closed, costs modest happiness, no coins", () => {
    const base = mixedRoom();
    const r = assignRoom(base, base.dogs[1]!.id, "large-active", true);
    if (!r.ok) throw 0;
    const fight = tick({ ...r.state, clockMin: 12 * 60 + 30 }, 1, always);
    const before = fight.dogs.find((d) => d.size === "small")!.happiness;
    const sep = separateDogs(fight, "hawthorne", "large-active");
    if (!sep.ok) throw new Error(sep.error);
    const small = sep.state.dogs.find((d) => d.size === "small")!;
    expect(small.place).toEqual({ kind: "recovery" });
    expect(before - small.happiness).toBe(10);
    expect(sep.state.coins).toBe(fight.coins);
    expect(sep.state.scuffles.length).toBe(0);
    expect(roomDogs(sep.state, "hawthorne", "large-active").length).toBe(1);
  });

  it("reputation drops during unresolved scuffles but never below the floor", () => {
    const base = mixedRoom();
    const r = assignRoom(base, base.dogs[1]!.id, "large-active", true);
    if (!r.ok) throw 0;
    const t = tick({ ...r.state, clockMin: 12 * 60 }, 300, () => 0.5 > 0 ? 0 : 1);
    expect(t.reputation).toBeGreaterThanOrEqual(REP_MIN);
    expect(t.reputation).toBeLessThan(80);
  });
});

describe("save migration v2 → v3", () => {
  it("adds clock, reputation and no scuffles while keeping coins and dogs", () => {
    const { clockMin, gameDay, reputation, scuffles, ...v2 } = newGame(0, "d");
    void clockMin; void gameDay; void reputation; void scuffles;
    const s = parseSave({ ...v2, v: 2, coins: 321 })!;
    expect(s.v).toBe(4);
    expect(s.coins).toBe(321);
    expect(s.clockMin).toBe(DAY_OPEN);
    expect(s.reputation).toBe(80);
    expect(s.scuffles).toEqual([]);
  });
});

describe("recovery space is always available", () => {
  it("separation works with lobby full, lobby closed, exhausted staff and every other room full", async () => {
    const { recoveryDogs } = await import("./engine");
    let s = at(9 * 60, { ...newGame(0, "d"), coins: 9999 });
    s = must(admitDog(s, largeActive));
    s = must(admitDog(s, smallGentle));
    s = must(assignRoom(s, s.dogs[0]!.id, "large-active"));
    s = must(assignRoom(s, s.dogs[1]!.id, "large-active", true));
    // fill the lobby
    for (let i = 0; i < LOBBY_CAP; i++) s = must(admitDog(s, smallGentle));
    // close lobby, exhaust staff, start scuffle
    s = tick({ ...s, clockMin: 12 * 60 + 10 }, 1, always);
    s = { ...s, staff: s.staff.map((x) => ({ ...x, energy: 0 })) };
    expect(hasScuffle(s, "hawthorne", "large-active")).toBe(true);
    const r = separateDogs(s, "hawthorne", "large-active");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(recoveryDogs(r.state, "hawthorne").length).toBe(1);
    expect(lobbyDogs(r.state, "hawthorne").length).toBe(lobbyDogs(s, "hawthorne").length);
  });

  it("recovering pup can rejoin a matching playroom but can't play in recovery", () => {
    let s = at(9 * 60);
    s = must(admitDog(s, largeActive));
    s = must(admitDog(s, smallGentle));
    s = must(assignRoom(s, s.dogs[0]!.id, "large-active"));
    s = must(assignRoom(s, s.dogs[1]!.id, "large-active", true));
    s = must(separateDogs(s, "hawthorne", "large-active") as never);
    const id = s.dogs[1]!.id;
    expect(playtime(s, id).ok).toBe(false);
    expect(assignRoom(s, id, "small-gentle").ok).toBe(true);
  });
});

describe("persistence", () => {
  it("a saved game round-trips through JSON with clock, recovery and suites intact", () => {
    let s = at(13 * 60 + 30, { ...newGame(0, "d"), upgrades: ["boarding"] });
    s = { ...s, clockMin: 9 * 60 };
    s = must(admitDog(s, smallGentle, true));
    const back = parseSave(JSON.parse(JSON.stringify(s)))!;
    expect(back).toEqual(s);
  });
  it("cloud payloads with negative coins are rejected", () => {
    expect(parseSave({ ...newGame(0, "d"), coins: -1 })).toBeNull();
  });
});
