import { describe, expect, it } from "vitest";
import {
  REFERRAL_COINS_EACH,
  REFERRAL_MAX_REWARDED,
  checkAchievements,
  claimReferrals,
  linkProgress,
  newGame,
  parseSave,
} from "./engine";
import { readGraduation } from "@/lib/graduation";

const fresh = () => newGame(0, "2026-10-31");

describe("Graduation Day progress linked into the shared profile", () => {
  it("reads cleared levels and stars from Graduation Day's own save", () => {
    const save = {
      progress: {
        unlocked: 10,
        levels: {
          "1": { stars: 3, score: 900 },
          "2": { stars: 1, score: 400 },
          "9": { stars: 2, score: 700 },
        },
        badges: [],
      },
      dog: { name: "Biscuit" },
    };
    expect(readGraduation(JSON.stringify(save))).toEqual({
      cleared: 3,
      stars: 6,
      highest: 9,
      graduated: false,
      dogName: "Biscuit",
    });
    expect(readGraduation(null)).toEqual({
      cleared: 0,
      stars: 0,
      highest: 0,
      graduated: false,
      dogName: null,
    });
    expect(readGraduation("{not json")).toEqual({
      cleared: 0,
      stars: 0,
      highest: 0,
      graduated: false,
      dogName: null,
    });
    const tampered = {
      progress: {
        levels: {
          "999": { stars: 3, score: 1 },
          abc: { stars: 3, score: 1 },
          "5": { stars: 99, score: 1 },
        },
      },
    };
    expect(readGraduation(JSON.stringify(tampered))).toMatchObject({
      cleared: 1,
      stars: 3,
      highest: 5,
    });
  });

  it("milestones unlock free daycare bandanas and shared achievements; coins stay separate", () => {
    let s = fresh();
    const a = linkProgress(s, { cleared: 8, stars: 20 });
    expect(a.state.coins).toBe(s.coins); // no currency conversion between games
    expect(a.newCosmetics.map((c) => c.id)).toEqual(["bandana-honor"]);
    s = checkAchievements(a.state).state;
    expect(s.achievements).toContain("honor");
    const b = linkProgress(s, { cleared: 40, stars: 100 });
    expect(b.newCosmetics.map((c) => c.id)).toEqual(["bandana-valedictorian"]);
    expect(checkAchievements(b.state).state.achievements).toContain("valedictorian");
    // progress never goes backwards (e.g. Graduation Day save cleared on another browser)
    expect(linkProgress(b.state, { cleared: 0, stars: 0 }).state.linked.gradCleared).toBe(40);
  });

  it("All-Rounder needs all three games", () => {
    let s = { ...fresh(), stats: { ...fresh().stats, admitted: 1, runs: 1 } };
    expect(checkAchievements(s).state.achievements).not.toContain("allround");
    s = linkProgress(s, { cleared: 1, stars: 1 }).state;
    expect(checkAchievements(s).state.achievements).toContain("allround");
  });
});

describe("referral rewards", () => {
  it("pays once per friend who finished their first day, capped, with a bandana for the first", () => {
    let s = fresh();
    let r = claimReferrals(s, 0);
    expect(r.coins).toBe(0);
    r = claimReferrals(s, 2);
    expect(r.coins).toBe(2 * REFERRAL_COINS_EACH);
    expect(r.state.cosmetics).toContain("bandana-buddy");
    s = r.state;
    expect(claimReferrals(s, 2).coins).toBe(0); // same friends never pay twice
    r = claimReferrals(s, 50);
    expect(r.state.referralsRewarded).toBe(REFERRAL_MAX_REWARDED);
    expect(r.coins).toBe((REFERRAL_MAX_REWARDED - 2) * REFERRAL_COINS_EACH);
    expect(checkAchievements(r.state).state.achievements).toContain("referral");
  });

  it("saves can't pre-claim more than the cap or negative rewards", () => {
    expect(parseSave({ ...fresh(), referralsRewarded: 999 })!.referralsRewarded).toBe(
      REFERRAL_MAX_REWARDED,
    );
    expect(parseSave({ ...fresh(), referralsRewarded: -3 })!.referralsRewarded).toBe(0);
    expect(parseSave({ ...fresh(), linked: { gradCleared: 9999, gradStars: -1 } })!.linked).toEqual(
      { gradCleared: 40, gradStars: 0 },
    );
  });
});

describe("Graduation Day team points can't be bought", () => {
  it("a flat 6 on a New York day with at least one new level, however many", async () => {
    const { GRAD_TEAM_POINTS, gradTeamPoints, teamPointsToday } = await import("@/lib/team");
    localStorage.clear();
    expect(GRAD_TEAM_POINTS).toBe(6);
    expect(gradTeamPoints("hillsdale", 3, "2026-11-02")).toBe(6);
    expect(gradTeamPoints("hillsdale", 5, "2026-11-02")).toBe(0); // already given today
    expect(gradTeamPoints("hillsdale", 0, "2026-11-03")).toBe(0); // no new level
    expect(gradTeamPoints("hillsdale", 1, "2026-11-03")).toBe(6); // a new day
    expect(gradTeamPoints(null, 4, "2026-11-04")).toBe(0);
    expect(teamPointsToday()).toBeGreaterThanOrEqual(6);
  });
});
