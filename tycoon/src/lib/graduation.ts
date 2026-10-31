// Bridge to Graduation Day (the match-3 game embedded at /graduation/). It runs on the same site, so its
// own save in this browser can be read — never written — to show progress and award shared achievements.
// Its Treats economy and any purchases stay inside Graduation Day.
export const GRADUATION_SAVE_KEY = "pawtastic-gd-wallet-v1";
export const GRADUATION_LEVELS = 40;

export type GraduationProgress = {
  cleared: number;
  stars: number;
  highest: number;
  graduated: boolean;
  dogName: string | null;
};
const EMPTY: GraduationProgress = {
  cleared: 0,
  stars: 0,
  highest: 0,
  graduated: false,
  dogName: null,
};

export function readGraduation(raw: string | null): GraduationProgress {
  if (!raw) return { ...EMPTY };
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return { ...EMPTY };
  }
  if (!v || typeof v !== "object") return { ...EMPTY };
  const o = v as Record<string, unknown>;
  const progress = (
    o["progress"] && typeof o["progress"] === "object" ? o["progress"] : {}
  ) as Record<string, unknown>;
  const levels = (
    progress["levels"] && typeof progress["levels"] === "object" ? progress["levels"] : {}
  ) as Record<string, unknown>;
  let cleared = 0;
  let stars = 0;
  let highest = 0;
  for (const [id, r] of Object.entries(levels)) {
    if (!/^\d+$/.test(id)) continue;
    const n = Number(id);
    if (n < 1 || n > GRADUATION_LEVELS || !r || typeof r !== "object") continue;
    const st = Number((r as Record<string, unknown>)["stars"]);
    if (!Number.isFinite(st) || st < 1) continue;
    cleared++;
    stars += Math.min(3, Math.floor(st));
    highest = Math.max(highest, n);
  }
  const dog =
    o["dog"] && typeof o["dog"] === "object" ? (o["dog"] as Record<string, unknown>)["name"] : null;
  return {
    cleared,
    stars,
    highest,
    graduated: highest >= GRADUATION_LEVELS,
    dogName: typeof dog === "string" ? dog.slice(0, 24) : null,
  };
}

export function readGraduationFromStorage(): GraduationProgress {
  try {
    return readGraduation(localStorage.getItem(GRADUATION_SAVE_KEY));
  } catch {
    return { ...EMPTY };
  }
}
