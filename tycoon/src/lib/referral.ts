// Referrals: every device gets a random invite code (no name, email or contact info). A friend who opens
// the link is remembered on their device (first link only, never your own), and their anonymous
// first-session event carries the code so the server can count friends who joined and who finished the
// first-day tutorial. Recommending PAWtastic shares the real free-evaluation form with tags for the
// website's analytics — a click there is not a booking.
import { LOCATIONS, type Location } from "./locations";

const CODE_KEY = "pawtastic-ref-code";
const BY_KEY = "pawtastic-referred-by";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
export const isRefCode = (v: unknown): v is string =>
  typeof v === "string" && /^[A-HJ-NP-Z2-9]{8}$/.test(v);

function store(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

let memoryCode: string | null = null;
export function myReferralCode(): string {
  const ls = store();
  const saved = ls?.getItem(CODE_KEY);
  if (isRefCode(saved)) return saved;
  if (!ls && memoryCode) return memoryCode;
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const code = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
  try {
    ls?.setItem(CODE_KEY, code);
  } catch {
    /* storage blocked */
  }
  memoryCode = code;
  return code;
}

export function referredBy(): string | null {
  const v = store()?.getItem(BY_KEY);
  return isRefCode(v) ? v : null;
}

/** Remember who invited this device (first valid link only, never your own). Returns the code if newly captured. */
export function captureReferral(search: string): string | null {
  const code = new URLSearchParams(search).get("ref");
  if (!isRefCode(code) || referredBy() || code === myReferralCode()) return null;
  try {
    store()?.setItem(BY_KEY, code);
  } catch {
    return null;
  }
  return code;
}

export function inviteLink(origin: string, code: string, context = "hub"): string {
  const u = new URL("/", origin);
  u.searchParams.set("ref", code);
  u.searchParams.set("utm_source", "referral");
  u.searchParams.set("utm_medium", "share");
  u.searchParams.set("utm_campaign", "pawtastic_games");
  u.searchParams.set("utm_content", context.replace(/[^a-z_]/g, "").slice(0, 20) || "hub");
  return u.toString();
}

/** The real PAWtastic free-evaluation form for a location, tagged so the website's analytics can attribute the visit. */
export function recommendLink(l: Location, code: string): string {
  const u = new URL(l.form);
  u.searchParams.set("utm_source", "pawtastic_games_referral");
  u.searchParams.set("utm_medium", "friend_share");
  u.searchParams.set("utm_campaign", "free_evaluation");
  u.searchParams.set("utm_content", l.id);
  u.searchParams.set("utm_term", code);
  return u.toString();
}

export { LOCATIONS };
