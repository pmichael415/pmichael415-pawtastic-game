import { describe, expect, it } from "vitest";
import {
  ADVENTURES,
  TEAM_SWITCH_MS,
  adventureStatus,
  admitDog,
  buyUpgrade,
  checkAchievements,
  claimChapter,
  createArrival,
  newGame,
  parseSave,
  pickTeam,
  sites,
  upgradeInfo,
  UPGRADES,
  type GameState,
} from "./engine";

const seq = (vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length]!;
};
const r7 = seq([0.2, 0, 0.1, 0.5, 0.5, 0.5, 0.5]);
const must = (r: { ok: boolean; state?: GameState; error?: string }) => {
  if (!r.ok) throw new Error(r.error);
  return r.state!;
};
const DAY = 86400000;
const fresh = (): GameState => ({ ...newGame(0, "2026-10-31"), clockMin: 9 * 60 });

describe("picking a team", () => {
  it("a new player on Team Hillsdale starts their daycare in Hillsdale", () => {
    let s = must(createArrival(fresh(), r7)); // the first customer is already waiting
    s = must(pickTeam(s, "hillsdale", 1000));
    expect(s).toMatchObject({ team: "hillsdale", home: "hillsdale", site: "hillsdale" });
    expect(sites(s)).toEqual(["hillsdale"]);
    expect(s.dogs.every((d) => d.site === "hillsdale")).toBe(true);
    s = must(admitDog(s, r7));
    expect(s.dogs.at(-1)!.site).toBe("hillsdale");
  });

  it("an existing daycare keeps its home; the team's location becomes the second location", () => {
    let s = must(admitDog(fresh(), r7)); // already playing in Hawthorne
    s = must(pickTeam(s, "hillsdale", 1000));
    expect(s).toMatchObject({ team: "hillsdale", home: "hawthorne" });
    expect(sites(s)).toEqual(["hawthorne"]);
    s = must(buyUpgrade({ ...s, coins: 9999, upgrades: ["boarding"] }, "hillsdale"));
    expect(sites(s)).toEqual(["hawthorne", "hillsdale"]);
  });

  it("a Hillsdale daycare's second location is Hawthorne", () => {
    const s = must(pickTeam(fresh(), "hillsdale", 1000));
    const u = UPGRADES.find((x) => x.id === "hillsdale")!;
    expect(upgradeInfo(s, u).name).toBe("Second Location: Hawthorne");
    expect(upgradeInfo(fresh(), u).name).toBe("Second Location: Hillsdale");
    const opened = must(buyUpgrade({ ...s, coins: 9999, upgrades: ["boarding"] }, "hillsdale"));
    expect(sites(opened)).toEqual(["hillsdale", "hawthorne"]);
  });

  it("teams can be switched once a week; switching starts the new team's adventure", () => {
    let s = must(pickTeam(fresh(), "hawthorne", 1000));
    const again = pickTeam(s, "hillsdale", 1000 + 2 * DAY);
    expect(again.ok).toBe(false);
    expect(!again.ok && again.error).toMatch(/once a week/);
    s = must(pickTeam(s, "hillsdale", 1000 + TEAM_SWITCH_MS));
    expect(s.team).toBe("hillsdale");
    expect(s.adventure).toMatchObject({ team: "hillsdale", chapter: 0 });
  });
});

describe("team adventures", () => {
  it("both teams' adventures are equally hard and equally rewarding", () => {
    const sum = (t: "hawthorne" | "hillsdale", k: "target" | "reward") =>
      ADVENTURES[t].chapters.reduce((a, c) => a + c[k], 0);
    expect(ADVENTURES.hawthorne.chapters.length).toBe(ADVENTURES.hillsdale.chapters.length);
    expect(sum("hawthorne", "reward")).toBe(sum("hillsdale", "reward"));
    const needs = (t: "hawthorne" | "hillsdale") =>
      ADVENTURES[t].chapters.map((c) => `${c.stat}:${c.target}`).sort();
    expect(needs("hawthorne")).toEqual(needs("hillsdale"));
  });

  it("chapters progress from the moment they start, pay once, and end with the team bandana", () => {
    let s = must(
      pickTeam({ ...fresh(), stats: { ...fresh().stats, admitted: 50 } }, "hawthorne", 1000),
    );
    const ch = ADVENTURES.hawthorne.chapters;
    expect(adventureStatus(s)).toMatchObject({ chapter: 0, progress: 0, done: false });
    expect(claimChapter(s).ok).toBe(false); // earlier stats don't count
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i]!;
      s = { ...s, stats: { ...s.stats, [c.stat]: s.stats[c.stat] + c.target } };
      const coins = s.coins;
      s = must(claimChapter(s));
      expect(s.coins - coins).toBe(c.reward);
    }
    expect(adventureStatus(s)!.done).toBe(true);
    expect(s.cosmetics).toContain("bandana-team-hawthorne");
    expect(claimChapter(s).ok).toBe(false);
    expect(checkAchievements(s).state.achievements).toContain("teamspirit");
  });
});

describe("saves", () => {
  it("older saves load as Hawthorne-based with no team yet", () => {
    const s = parseSave({ v: 4, coins: 10, dogs: [], staff: [] })!;
    expect(s).toMatchObject({ home: "hawthorne", team: null, adventure: null });
  });

  it("a Hillsdale home keeps its pups in Hillsdale; bad team data is dropped", () => {
    const base = must(pickTeam(must(createArrival(fresh(), r7)), "hillsdale", 1000));
    const s = parseSave(JSON.parse(JSON.stringify(base)))!;
    expect(s).toMatchObject({ home: "hillsdale", site: "hillsdale", team: "hillsdale" });
    expect(s.dogs[0]!.site).toBe("hillsdale");
    const bad = parseSave({
      ...base,
      team: "moon",
      home: "mars",
      adventure: { team: "x", chapter: 99 },
    })!;
    expect(bad).toMatchObject({ team: null, home: "hawthorne", adventure: null });
  });
});
