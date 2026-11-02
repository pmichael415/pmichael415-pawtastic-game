// PAWtastic Daycare Tycoon — reputation earned by service, with reasons; public reviews; referrals
// (service design, "Reputation, reviews, loyalty"). Pure.
import { REP_MIN } from "@/game/engine";
import type { Facility, Review } from "./types";

export const REVIEW_FACTOR_MIN = 0.8;
export const REVIEW_FACTOR_MAX = 1.12;
export const REFERRAL_BOOST = 1.5;

/** How a visit's satisfaction moves reputation. */
export const repDeltaFor = (sat: number) => (sat >= 85 ? 2 : sat >= 70 ? 1 : sat >= 50 ? 0 : sat >= 35 ? -2 : -4);

/** Changes reputation (within REP_MIN..100) and records why. A change that can't apply (at a limit) isn't logged. */
export function adjustRep(f: Facility, delta: number, reason: string): Facility {
  const reputation = Math.max(REP_MIN, Math.min(100, f.reputation + delta));
  const applied = Math.round((reputation - f.reputation) * 10) / 10;
  if (!applied) return f;
  return { ...f, reputation, repLog: [...(f.repLog ?? []), { day: f.day, min: Math.floor(f.clockMin), delta: applied, reason }].slice(-40) };
}

const FIVE = ["{dog} comes home tired and happy. The team is wonderful!", "Booked again already — {dog} loves it here.", "Clean, friendly, and {dog} had a blast."];
const FOUR = ["A good day for {dog}. Pickup was easy.", "{dog} was happy — we'll be back."];
const TWO = ["{dog} didn't get what we booked.", "Not our best visit — hoping next time is better."];
const ONE = ["Disappointed. {dog} wasn't looked after the way we expected."];
const pick = (xs: string[], rand: () => number, dog: string) => xs[Math.floor(rand() * xs.length) % xs.length]!.replace("{dog}", dog);

/**
 * Whether this family posts a public review, and what it says. Delighted families sometimes do (≥88: 5★ 35% of the
 * time; 75–87: 4★ 15%); upset ones more often (under 45: 50%, or 25% if the problem was fixed). `rand` is seeded per
 * visit by the caller, so the same visit always gets the same answer.
 */
export function reviewFor(f: Facility, d: { name: string; owner: string }, sat: number, fixed: boolean, rand: () => number): Review | null {
  const r = rand();
  const make = (stars: Review["stars"], xs: string[]): Review => ({ day: f.day, stars, owner: d.owner, dog: d.name, text: pick(xs, rand, d.name) });
  if (sat >= 88) return r < 0.35 ? make(5, FIVE) : null;
  if (sat >= 75) return r < 0.15 ? make(4, FOUR) : null;
  if (sat < 45) return r < (fixed ? 0.25 : 0.5) ? (sat < 30 ? make(1, ONE) : make(2, TWO)) : null;
  return null;
}

/** Recent reviews nudge drop-offs: 1 + (average stars of the last 10 − 3.5) × 0.08, within 0.8–1.12. */
export function reviewFactor(f: Facility): number {
  const last = (f.reviews ?? []).slice(-10);
  if (!last.length) return 1;
  const avg = last.reduce((n, r) => n + r.stars, 0) / last.length;
  return Math.max(REVIEW_FACTOR_MIN, Math.min(REVIEW_FACTOR_MAX, 1 + (avg - 3.5) * 0.08));
}

/** A 5★ review brings referrals: more drop-offs for the rest of that day. */
export const referralBoost = (f: Facility) => (f.referralUntil !== null && f.referralUntil !== undefined && f.referralUntil >= f.day ? REFERRAL_BOOST : 1);
