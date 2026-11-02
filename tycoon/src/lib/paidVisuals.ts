// Paid cosmetics are purely visual. Ownership comes ONLY from fresh server entitlements held in memory;
// the local preference just remembers which owned items the player switched on.
import type { PaidProduct } from "./catalog";

export type PaidItemId = "ribbon-collar" | "navy-star-bandana" | "sparkle-trail" | "deluxe-decor" | "rainbow-trail" | "rocket-cape";
export const PAID_ITEMS: { id: PaidItemId; pack: PaidProduct["id"]; name: string }[] = [
  { id: "ribbon-collar", pack: "blue-ribbon-style", name: "Blue Ribbon Collar" },
  { id: "navy-star-bandana", pack: "blue-ribbon-style", name: "Navy Star Bandana" },
  { id: "sparkle-trail", pack: "blue-ribbon-style", name: "Sparkle Trail (Recess Rush)" },
  { id: "deluxe-decor", pack: "deluxe-daycare-decor", name: "Cloud Beds, Paw-Print Rug, Lighthouse Fort & Bubble Machine" },
  { id: "rainbow-trail", pack: "runner-looks", name: "Rainbow Trail (Recess Rush)" },
  { id: "rocket-cape", pack: "runner-looks", name: "Rocket Cape (Recess Rush)" },
];
export const NAVY_STAR = "oklch(0.27 0.06 252)";

export type EntStatus = "guest" | "loading" | "ready" | "error";
export type Prefs = Partial<Record<PaidItemId, boolean>>;
export type ActiveVisuals = Record<PaidItemId, boolean>;

/** Fail closed: nothing paid shows unless the server list loaded successfully for the signed-in user. */
export function activePaidVisuals(prefs: Prefs, status: EntStatus, owned: ReadonlySet<string>): ActiveVisuals {
  const out = {} as ActiveVisuals;
  for (const it of PAID_ITEMS) out[it.id] = status === "ready" && owned.has(it.pack) && prefs[it.id] === true;
  return out;
}

export const PREFS_KEY = "pawtastic-paid-prefs";
export function readPrefs(): Prefs {
  try {
    const v = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    const out: Prefs = {};
    if (v && typeof v === "object") for (const it of PAID_ITEMS) if (v[it.id] === true) out[it.id] = true;
    return out;
  } catch {
    return {};
  }
}
