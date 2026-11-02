// Team Hawthorne vs Team Hillsdale: a friendly weekly total. Points come from playing (check-ins, care,
// Recess Rush runs, Graduation Day levels), capped per device per day here AND again on the server, so no
// single player can swamp the scoreboard. Totals are real counts from the server — never made up.
import type { SiteId } from "@/game/engine";
import { track } from "./analytics";

export const TEAM_DAILY_CAP = 60;
export const TEAM_POINTS_MAX_EVENT = 10;
const KEY = "pawtastic-team-points";
const nyDay = (ms = Date.now()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));

function read(): { day: string; total: number } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as {
      day?: unknown;
      total?: unknown;
    } | null;
    if (v && typeof v.day === "string" && typeof v.total === "number" && v.day === nyDay())
      return { day: v.day, total: Math.max(0, v.total) };
  } catch {
    /* ignore */
  }
  return { day: nyDay(), total: 0 };
}

export const teamPointsToday = () => read().total;

/** A finished Recess Rush run: a flat amount, so bought power-ups (better runs) can't raise team scores. */
export const RECESS_TEAM_POINTS = 5;

/** Adds points for the player's team (if they have one). Returns how many counted after today's cap. */
export function addTeamPoints(
  team: SiteId | null | undefined,
  points: number,
  reason: string,
): number {
  if (team !== "hawthorne" && team !== "hillsdale") return 0;
  const want = Math.max(0, Math.min(TEAM_POINTS_MAX_EVENT, Math.floor(points)));
  const cur = read();
  const allowed = Math.min(want, TEAM_DAILY_CAP - cur.total);
  if (allowed <= 0) return 0;
  try {
    localStorage.setItem(KEY, JSON.stringify({ day: cur.day, total: cur.total + allowed }));
  } catch {
    return 0;
  }
  track("team_points", { team, points: allowed, reason: reason.slice(0, 20) });
  return allowed;
}

export type TeamTotals = Record<SiteId, { points: number; players: number }>;
export type Standings = { thisWeek: TeamTotals; lastWeek: TeamTotals };

export function parseStandings(v: unknown): Standings | null {
  const totals = (x: unknown): TeamTotals | null => {
    if (!x || typeof x !== "object") return null;
    const o = x as Record<string, { points?: unknown; players?: unknown }>;
    const one = (k: SiteId) => {
      const t = o[k];
      return t && typeof t.points === "number" && typeof t.players === "number"
        ? { points: Math.max(0, Math.floor(t.points)), players: Math.max(0, Math.floor(t.players)) }
        : null;
    };
    const h = one("hawthorne");
    const s = one("hillsdale");
    return h && s ? { hawthorne: h, hillsdale: s } : null;
  };
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const thisWeek = totals(o["thisWeek"]);
  const lastWeek = totals(o["lastWeek"]);
  return thisWeek && lastWeek ? { thisWeek, lastWeek } : null;
}

export async function fetchStandings(): Promise<Standings | null> {
  if (import.meta.env["VITE_REVIEW_BUILD"]) return null;
  try {
    const r = await fetch("/api/public/team-standings", {
      headers: { accept: "application/json" },
    });
    return r.ok ? parseStandings(await r.json()) : null;
  } catch {
    return null;
  }
}

/** Team points for one finished Recess Rush run (flat, whatever the score). */
export function recessRunTeamPoints(team: SiteId | null | undefined): number {
  return addTeamPoints(team, RECESS_TEAM_POINTS, "recess");
}
