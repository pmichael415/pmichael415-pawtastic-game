// Per-game cloud saves. Daycare Tycoon, Recess Rush and Graduation Day each have their own save in the player's
// account (public.game_saves), so loading or keeping one game's progress never touches another's.
// On the phone, Daycare Tycoon and Recess Rush share one game state (coins, bandanas and achievements are
// shared and live with the Daycare save); Recess Rush's own slice is its best score and today's coin counter.
// Graduation Day keeps its own save file (its key in this browser). Pure functions only — no network here.
import { parseSave, RECESS_DAILY_COIN_CAP, type GameState } from "./engine";

export type GameId = "daycare" | "recess" | "graduation";
export const GAME_IDS: GameId[] = ["daycare", "recess", "graduation"];
export const GAME_NAMES: Record<GameId, string> = {
  daycare: "Daycare Tycoon",
  recess: "Recess Rush",
  graduation: "Graduation Day",
};

export type RecessSave = { best: number; day: string; coinsToday: number };
export type GraduationSave = { version: 1; [k: string]: unknown };
export type SlotData = { daycare: GameState; recess: RecessSave; graduation: GraduationSave };

const MAX_GRADUATION_BYTES = 90_000;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const int = (v: unknown, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.floor(n))) : lo;
};

// ---------- slicing the phone's progress into per-game saves, and merging them back ----------
/**
 * The Daycare save: the whole game state except Recess Rush's own fields (kept neutral) and purchases. Cloud saves
 * are free progress only: bought power-ups and the delivery log never travel, so a restore can't copy a purchase.
 */
export function daycareOf(s: GameState): GameState {
  return { ...s, recessBest: 0, recessDay: "", recessCoinsToday: 0, recessPowerups: { shield: 0, life: 0 }, deliveries: { applied: [], done: [] } };
}
/** Load a Daycare save onto this phone, keeping this phone's Recess Rush progress and its purchases. */
export function withDaycare(local: GameState | null, cloud: GameState): GameState {
  return {
    ...cloud,
    recessBest: local?.recessBest ?? 0,
    recessDay: local?.recessDay ?? "",
    recessCoinsToday: local?.recessCoinsToday ?? 0,
    recessPowerups: local?.recessPowerups ?? { shield: 0, life: 0 },
    deliveries: local?.deliveries ?? { applied: [], done: [] },
    lastSeen: Date.now(),
  };
}
export function recessOf(s: GameState): RecessSave {
  return { best: s.recessBest, day: s.recessDay, coinsToday: s.recessCoinsToday };
}
/** Load a Recess Rush save onto this phone, keeping this phone's daycare. */
export function withRecess(local: GameState, r: RecessSave): GameState {
  return { ...local, recessBest: r.best, recessDay: r.day, recessCoinsToday: r.coinsToday };
}

// ---------- validating what comes back from the cloud ----------
export function parseDaycare(v: unknown): GameState | null {
  const s = parseSave(v);
  return s ? daycareOf(s) : null;
}
export function parseRecess(v: unknown): RecessSave | null {
  if (!isObj(v)) return null;
  const day = typeof v["day"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v["day"]) ? v["day"] : "";
  return { best: int(v["best"], 0, 5000), day, coinsToday: int(v["coinsToday"], 0, RECESS_DAILY_COIN_CAP) };
}
/** Graduation Day's own save file. Only its version and size are checked here; the game validates the rest on load. */
export function parseGraduationSave(v: unknown): GraduationSave | null {
  if (!isObj(v) || v["version"] !== 1) return null;
  const text = JSON.stringify(v);
  if (text.length > MAX_GRADUATION_BYTES) return null;
  const progress = v["progress"];
  if (progress !== undefined && !isObj(progress)) return null;
  if (isObj(progress) && progress["levels"] !== undefined && !isObj(progress["levels"])) return null;
  return JSON.parse(text) as GraduationSave;
}
export function parseSlot<G extends GameId>(game: G, v: unknown): SlotData[G] | null {
  if (game === "daycare") return parseDaycare(v) as SlotData[G] | null;
  if (game === "recess") return parseRecess(v) as SlotData[G] | null;
  return parseGraduationSave(v) as SlotData[G] | null;
}

// ---------- describing a save ----------
function graduationLevels(g: GraduationSave): number {
  const progress = isObj(g["progress"]) ? g["progress"] : {};
  const levels = isObj(progress["levels"]) ? progress["levels"] : {};
  return Object.values(levels).filter((r) => isObj(r) && Number(r["stars"]) >= 1).length;
}
export function hasProgress<G extends GameId>(game: G, d: SlotData[G]): boolean {
  if (game === "daycare") {
    const s = d as GameState;
    return s.stats.admitted > 0 || s.upgrades.length > 0 || s.decor.length > 0 || s.gameDay > 1;
  }
  if (game === "recess") return (d as RecessSave).best > 0;
  return graduationLevels(d as GraduationSave) > 0;
}
export function summaryOf<G extends GameId>(game: G, d: SlotData[G]): string {
  if (game === "daycare") {
    const s = d as GameState;
    return `Day ${s.gameDay} · ${s.coins} coins · ${s.stats.admitted} pups checked in`;
  }
  if (game === "recess") return `Best score ${(d as RecessSave).best}`;
  const g = d as GraduationSave;
  const n = graduationLevels(g);
  const dog = isObj(g["dog"]) && typeof g["dog"]["name"] === "string" ? `${g["dog"]["name"].slice(0, 24)} · ` : "";
  return `${dog}${n} level${n === 1 ? "" : "s"} passed`;
}
/** Fingerprint of a save's progress (the Daycare save ignores its last-seen time, which changes constantly). */
export function slotHash<G extends GameId>(game: G, d: SlotData[G]): string {
  const str = JSON.stringify(game === "daycare" ? { ...(d as GameState), lastSeen: 0 } : d);
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return `${str.length}:${h.toString(36)}`;
}

// ---------- what to do with one game when a player signs in on this phone ----------
export type SignInPlan =
  | { action: "load" }
  | { action: "upload"; expected: number }
  | { action: "link"; revision: number }
  | { action: "ask" };
export function planSignIn(
  local: { has: boolean; hash: string } | null,
  cloud: { hasProgress: boolean; hash: string; revision: number } | null,
): SignInPlan {
  if (!cloud) return local?.has ? { action: "upload", expected: 0 } : { action: "link", revision: 0 };
  if (local && local.hash === cloud.hash) return { action: "link", revision: cloud.revision };
  if (!local?.has) return { action: "load" };
  if (!cloud.hasProgress) return { action: "upload", expected: cloud.revision };
  return { action: "ask" };
}
