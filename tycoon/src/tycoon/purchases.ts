// What a delivered purchase does to the new Daycare's save. Bought coins are never daycare earnings: no ledger
// income, no weekly-challenge profit, never multiplied by any boost. A reversal never takes coins below 0.
import type { Contents } from "@/lib/catalog";
import type { TycoonState } from "./types";

export function applyTycoonContents(s: TycoonState, c: Contents, sign: 1 | -1): TycoonState {
  const coins = Math.floor(Number(c.coins) || 0);
  if (!coins) return s;
  return { ...s, coins: Math.max(0, s.coins + sign * coins) };
}
