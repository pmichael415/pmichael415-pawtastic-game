// PAWtastic Daycare Tycoon — XP, levels, level-up rewards and unlocks (spec §4.6).
import { CAMPAIGNS, FURNITURE, OUTDOOR, PARCELS } from "./catalog";
import type { TycoonState } from "./types";

export const XP = { checkIn: 5, playtime: 2, bath: 3, clean: 1, checkout: 10, happyCheckout: 5, moment: 5 } as const;
/** Building, upgrading and buying land earn a tenth of the coins spent. */
export const buildXp = (coins: number) => Math.max(0, Math.floor(coins / 10));

/** Total XP at which level n starts. */
export const xpForLevel = (n: number) => 50 * n * (n - 1);

export function levelOf(xp: number): number {
  if (!(xp > 0)) return 1;
  let n = Math.max(1, Math.floor((1 + Math.sqrt(1 + xp / 12.5)) / 2));
  while (xpForLevel(n + 1) <= xp) n++;
  while (n > 1 && xpForLevel(n) > xp) n--;
  return n;
}
export const level = (s: TycoonState) => levelOf(s.xp);
export const levelReward = (n: number) => 25 * n;

let levelHook: ((n: number) => void) | null = null;
/** The store wires analytics (`tycoon_level`) here. */
export function setOnLevel(fn: ((n: number) => void) | null) {
  levelHook = fn;
}

/** Adds XP, pays 25 × N coins for each level N crossed, and remembers the highest new level for the celebration. */
export function gainXp(s: TycoonState, amount: number, onLevel: ((n: number) => void) | null = levelHook): TycoonState {
  if (!(amount > 0)) return s;
  const from = levelOf(s.xp);
  const xp = s.xp + Math.floor(amount);
  const to = levelOf(xp);
  if (to === from) return { ...s, xp };
  let coins = s.coins;
  for (let n = from + 1; n <= to; n++) {
    coins += levelReward(n);
    onLevel?.(n);
  }
  return { ...s, xp, coins, pendingLevel: Math.max(to, s.pendingLevel ?? 0) };
}

/** Names of everything that becomes available at level n (for the level-up cards). */
export function unlocksAt(n: number): string[] {
  if (n <= 1) return [];
  return [
    ...FURNITURE.filter((f) => f.unlock === n).map((f) => f.name),
    ...OUTDOOR.filter((o) => o.unlock === n).map((o) => o.name),
    ...PARCELS.filter((p) => p.level === n).map((p) => p.name),
    ...CAMPAIGNS.filter((c) => c.level === n).map((c) => c.name),
  ];
}
