import { describe, expect, it } from "vitest";
import {
  BREAK_START,
  DAY_CLOSE,
  admitDog,
  assignRoom,
  bath,
  checkout,
  claimWeekly,
  createArrival,
  friendshipLevel,
  newGame,
  nextGoal,
  parseSave,
  personalityOf,
  playtime,
  rollWeek,
  tick,
  weeklyChallenge,
  weekKey,
  type GameState,
} from "./engine";

const seq = (vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length]!;
};
const smallGentle = seq([0.2, 0, 0.1, 0.5, 0.5, 0.5, 0.5]);
const must = (r: { ok: boolean; state?: GameState; error?: string }) => {
  if (!r.ok) throw new Error(r.error);
  return r.state!;
};
const rich = (): GameState => ({ ...newGame(0, "2026-10-31"), coins: 5000, clockMin: 9 * 60 });

describe("personalities & favourites", () => {
  it("are stable for the same pup and independent of temperament", () => {
    const a = personalityOf({ name: "Biscuit", breed: 1 });
    expect(personalityOf({ name: "Biscuit", breed: 1 })).toEqual(a);
    expect(a.trait.length).toBeGreaterThan(2);
    expect(["fetch", "tug", "zoomies", "cuddles", "splash"]).toContain(a.favorite);
  });

  it("a favourite activity gives a small extra happiness boost (never coins from fights)", () => {
    let s = must(admitDog(rich(), smallGentle));
    s = must(assignRoom(s, s.dogs[0]!.id, "small-gentle"));
    const d = s.dogs[0]!;
    const fav = personalityOf(d).favorite;
    s = { ...s, dogs: s.dogs.map((x) => ({ ...x, happiness: 40, clean: 40 })) };
    const p = must(playtime(s, d.id));
    const b = must(bath(s, d.id));
    const playGain = p.dogs[0]!.happiness - 40;
    const bathGain = b.dogs[0]!.happiness - 40;
    if (fav === "splash") expect(bathGain).toBeGreaterThan(5);
    else if (fav === "cuddles") expect(bathGain).toBe(5);
    else expect(playGain).toBeGreaterThan(25);
  });
});

describe("regulars, friendship & milestones", () => {
  it("checkout records the pup in the guest book; later arrivals can be returning regulars", () => {
    let s = must(admitDog(rich(), smallGentle));
    s = must(assignRoom(s, s.dogs[0]!.id, "small-gentle"));
    const first = s.dogs[0]!;
    s = { ...s, dogs: s.dogs.map((d) => ({ ...d, happiness: 95 })) };
    s = must(checkout(s, first.id, false));
    expect(s.guestBook).toHaveLength(1);
    expect(s.guestBook[0]).toMatchObject({
      name: first.name,
      breed: first.breed,
      size: first.size,
      temper: first.temper,
      visits: 1,
    });
    // r=0.1 < regular chance → pick the regular
    const back = must(createArrival(s, seq([0.1, 0, 0.5, 0.5, 0.5, 0.5, 0.5])));
    const returning = back.dogs[0]!;
    expect(returning).toMatchObject({
      name: first.name,
      breed: first.breed,
      size: first.size,
      temper: first.temper,
      visits: 2,
    });
  });

  it("friendship grows with happy visits and pays a one-time milestone bonus", () => {
    let s: GameState = {
      ...rich(),
      guestBook: [
        {
          name: "Luna",
          breed: 0,
          size: "large",
          temper: "gentle",
          visits: 4,
          friendship: 48,
          lastDay: 1,
        },
      ],
    };
    s = must(createArrival(s, seq([0.1, 0, 0.5, 0.5, 0.5, 0.5, 0.5])));
    const id = s.dogs[0]!.id;
    expect(s.dogs[0]!.name).toBe("Luna");
    s = {
      ...s,
      dogs: s.dogs.map((d) => (d.id === id ? { ...d, checkedIn: true, happiness: 100 } : d)),
    };
    s = must(assignRoom(s, id, "large-gentle"));
    const before = s.coins;
    const out = checkout(s, id, false);
    expect(out.ok).toBe(true);
    const after = out.ok ? out.state : s;
    const entry = after.guestBook.find((g) => g.name === "Luna")!;
    expect(entry.visits).toBe(5);
    expect(entry.friendship).toBeGreaterThanOrEqual(50);
    expect(friendshipLevel(entry.friendship).label).toBe("Buddy");
    expect(after.coins - before).toBeGreaterThan(60); // fee + milestone bonus
    expect(out.ok && out.msg).toMatch(/Buddy/);
  });
});

describe("end-of-day report", () => {
  it("closing time produces a report of the day and starts the next day fresh", () => {
    let s = must(admitDog(rich(), smallGentle));
    s = must(assignRoom(s, s.dogs[0]!.id, "small-gentle"));
    s = must(playtime(s, s.dogs[0]!.id));
    s = { ...s, clockMin: DAY_CLOSE - 0.5 };
    const r = tick(s, 0.5, () => 0.99);
    expect(r.gameDay).toBe(2);
    expect(r.report).toMatchObject({ day: 1, admitted: 1, plays: 1 });
    expect(r.report!.earned).toBeGreaterThan(0);
    expect(r.dayBase.plays).toBe(r.stats.plays);
  });

  it("scuffles are counted on the report", () => {
    let s = must(admitDog(rich(), smallGentle));
    s = must(assignRoom(s, s.dogs[0]!.id, "small-gentle"));
    s = must(admitDog(s, seq([0, 0, 0.9, 0.5, 0.5, 0.5, 0.5])));
    s = must(assignRoom(s, s.dogs[1]!.id, "small-gentle", true));
    s = tick(s, 1, () => 0); // forces a scuffle roll
    expect(s.stats.scuffles).toBe(1);
  });

  it("a pup still inside at 12:00 is never forced out by the schedule", () => {
    const s = tick(
      { ...must(admitDog(rich(), smallGentle)), clockMin: BREAK_START - 1 },
      1,
      () => 0.99,
    );
    expect(s.dogs).toHaveLength(1);
  });
});

describe("weekly challenge & next goal", () => {
  it("rotates by week and pays once when complete", () => {
    const wk = weekKey(Date.UTC(2026, 10, 2, 15));
    expect(weekKey(Date.UTC(2026, 10, 4, 15))).toBe(wk);
    expect(weekKey(Date.UTC(2026, 10, 10, 15))).not.toBe(wk);
    let s = rollWeek(rich(), wk);
    const c = weeklyChallenge(wk);
    expect(claimWeekly(s, wk).ok).toBe(false);
    s = { ...s, stats: { ...s.stats, [c.stat]: s.weekBase[c.stat] + c.target } };
    const r = claimWeekly(s, wk);
    expect(r.ok).toBe(true);
    expect(r.ok && claimWeekly(r.state, wk).ok).toBe(false);
  });

  it("next goal points at something concrete", () => {
    const g = nextGoal(newGame(0, "d"));
    expect(g.label.length).toBeGreaterThan(5);
    expect(g.progress).toBeGreaterThanOrEqual(0);
    expect(g.progress).toBeLessThanOrEqual(1);
  });

  it("new fields survive save/load and are sanitized", () => {
    const s = parseSave({
      ...rich(),
      guestBook: [
        {
          name: "X",
          breed: 1,
          size: "small",
          temper: "gentle",
          visits: 3,
          friendship: 999,
          lastDay: 2,
        },
        { bogus: true },
      ],
      report: { day: 1, admitted: 2 },
    })!;
    expect(s.guestBook).toHaveLength(1);
    expect(s.guestBook[0]!.friendship).toBe(100);
    expect(s.report).toBeNull();
  });
});
