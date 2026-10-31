// Pulls Graduation Day progress (read-only) into the shared profile: achievements + free daycare bandanas.
import { checkAchievements, linkProgress, type Cosmetic } from "./engine";
import { updateSave } from "./store";
import { readGraduationFromStorage } from "@/lib/graduation";

export function syncGraduation(): { newCosmetics: Cosmetic[]; newAchievements: string[] } {
  const g = readGraduationFromStorage();
  let out: { newCosmetics: Cosmetic[]; newAchievements: string[] } = {
    newCosmetics: [],
    newAchievements: [],
  };
  updateSave((s) => {
    const r = linkProgress(s, g);
    const a = checkAchievements(r.state);
    out = { newCosmetics: r.newCosmetics, newAchievements: a.unlocked.map((x) => x.label) };
    return a.state;
  });
  return out;
}
