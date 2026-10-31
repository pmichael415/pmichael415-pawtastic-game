import { beforeEach, describe, expect, it } from "vitest";
import { addTeamPoints, parseStandings, TEAM_DAILY_CAP, teamPointsToday } from "./team";

describe("team points", () => {
  beforeEach(() => localStorage.clear());

  it("only count for players on a team, at most 10 per action and 60 per day", () => {
    expect(addTeamPoints(null, 5, "checkin")).toBe(0);
    expect(addTeamPoints("hillsdale", 50, "recess")).toBe(10);
    let total = 10;
    for (let i = 0; i < 20; i++) total += addTeamPoints("hillsdale", 5, "play");
    expect(total).toBe(TEAM_DAILY_CAP);
    expect(teamPointsToday()).toBe(TEAM_DAILY_CAP);
    expect(addTeamPoints("hillsdale", 1, "play")).toBe(0);
  });

  it("standings from the server are validated", () => {
    const ok = {
      thisWeek: { hawthorne: { points: 120, players: 4 }, hillsdale: { points: 90, players: 3 } },
      lastWeek: { hawthorne: { points: 0, players: 0 }, hillsdale: { points: 5, players: 1 } },
    };
    expect(parseStandings(ok)).toEqual(ok);
    expect(parseStandings({ thisWeek: { hawthorne: { points: "lots" } } })).toBeNull();
    expect(parseStandings(null)).toBeNull();
  });
});
