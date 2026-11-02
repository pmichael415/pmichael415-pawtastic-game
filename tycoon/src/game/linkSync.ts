// Pulls Graduation Day progress (read-only) into the shared profile: achievements + free daycare bandanas.
import { checkAchievements, linkProgress, type Cosmetic } from "./engine";
import { updateSave } from "./store";
import { readGraduationFromStorage } from "@/lib/graduation";
import { gradTeamPoints } from "@/lib/team";
import { nyDateKey } from "./engine";

export function syncGraduation(): { newCosmetics: Cosmetic[]; newAchievements: string[] } {
  const g = readGraduationFromStorage();
  let out: { newCosmetics: Cosmetic[]; newAchievements: string[] } = {
    newCosmetics: [],
    newAchievements: [],
  };
  let newLevels = 0;
  let team: "hawthorne" | "hillsdale" | null = null;
  updateSave((s) => {
    const r = linkProgress(s, g);
    newLevels = r.state.linked.gradCleared - (s.linked?.gradCleared ?? 0);
    team = r.state.team;
    const a = checkAchievements(r.state);
    out = { newCosmetics: r.newCosmetics, newAchievements: a.unlocked.map((x) => x.label) };
    return a.state;
  });
  gradTeamPoints(team, newLevels, nyDateKey()); // flat per day: bought moves can't raise team scores
  return out;
}
