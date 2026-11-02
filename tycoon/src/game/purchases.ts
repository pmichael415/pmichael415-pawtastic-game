// What a delivered purchase does to the hub save: Recess Rush power-ups. Counts stay within 0–9,999.
import type { Contents } from "@/lib/catalog";
import type { GameState } from "./engine";

const clamp = (n: number) => Math.max(0, Math.min(9999, Math.floor(n)));
export function applyHubContents(s: GameState, c: Contents, sign: 1 | -1): GameState {
  const shield = Math.floor(Number(c.shieldStarts) || 0);
  const life = Math.floor(Number(c.extraLives) || 0);
  if (!shield && !life) return s;
  return { ...s, recessPowerups: { shield: clamp(s.recessPowerups.shield + sign * shield), life: clamp(s.recessPowerups.life + sign * life) } };
}
