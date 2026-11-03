// PAWtastic Daycare Tycoon — visits: who the customer is, what they booked, when they come back (service design).
// Pure; the run loop (run.ts) moves visits along and assessVisit (below, Task 3) judges how they went.
import { DAY_OPEN, seedFrom } from "@/game/engine";
import type { Facility, Service, TDog, Visit } from "./types";

/** Fictional first names for the pups' families (none shared with staff). */
export const OWNER_NAMES = ["Taylor", "Morgan", "Casey", "Riley", "Jamie", "Avery", "Quinn", "Drew", "Rowan", "Parker", "Reese", "Emerson", "Hayden", "Logan", "Kendall", "Frankie", "Dana", "Robin", "Lee", "Shay"];
export const LAST_PICKUP = 17 * 60 + 30;
export const BOARDING_PICKUP = 10 * 60;
export const BATH_REQUEST_CHANCE = 0.3;
/** The last daycare drop-off (a pup needs time for care before families collect at 17:30–18:00). */
export const LAST_DROPOFF = 15 * 60 + 30;
export const PREPAID_CHANCE = 0.4;

export const fmtTime = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(Math.floor(min) % 60).padStart(2, "0")}`;

/** The family's name, the same for a pup on every visit. */
export const ownerFor = (d: { name: string; breed: number }) => OWNER_NAMES[seedFrom(`${d.name}|${d.breed}|family`) % OWNER_NAMES.length]!;

/** A plain daycare visit (pups from before visits existed): dropped off at opening, picked up at 17:30. */
export function defaultVisit(f: Facility, d: Pick<TDog, "name" | "breed" | "boarding" | "checkedIn">): Visit {
  return {
    owner: ownerFor(d),
    requests: d.boarding ? ["daycare", "boarding"] : ["daycare"],
    prepaid: [],
    arrivedDay: f.day,
    // a pup still at the desk "just arrived" (an old save must never make a family leave on load)
    arrived: d.checkedIn ? DAY_OPEN : Math.max(DAY_OPEN, Math.floor(f.clockMin)),
    pickupDay: d.boarding ? f.day + 1 : f.day,
    pickup: d.boarding ? BOARDING_PICKUP : LAST_PICKUP,
    ownerHere: null,
    waitedLobby: 0,
    checkedInAt: d.checkedIn ? DAY_OPEN : null,
    history: [],
    scuffle: false,
    safeMove: false,
    finishing: null,
    remedies: {},
    paid: 0,
    waitBefore: 0,
  };
}

export const visitOf = (f: Facility, d: TDog): Visit => d.visit ?? defaultVisit(f, d);

/** A new booking at drop-off. `hasBath`: only a daycare with a working bath room takes bath bookings. */
export function newVisit(f: Facility, d: Pick<TDog, "name" | "breed" | "boarding">, rand: () => number, hasBath: boolean): Visit {
  const requests: Service[] = d.boarding ? ["daycare", "boarding"] : ["daycare"];
  const prepaid: Service[] = [];
  if (hasBath && rand() < BATH_REQUEST_CHANCE) {
    requests.push("bath");
    if (rand() < PREPAID_CHANCE) prepaid.push("bath");
  }
  const stay = 240 + Math.floor(rand() * 180);
  const pickup = d.boarding ? BOARDING_PICKUP : Math.min(LAST_PICKUP, f.clockMin + Math.max(120, stay));
  return {
    owner: ownerFor(d),
    requests,
    prepaid,
    arrivedDay: f.day,
    arrived: Math.floor(f.clockMin),
    pickupDay: d.boarding ? f.day + 1 : f.day,
    pickup,
    ownerHere: null,
    waitedLobby: 0,
    checkedInAt: null,
    history: [`Dropped off ${fmtTime(f.clockMin)} by ${ownerFor(d)} — booked ${requests.join(" + ")}${prepaid.length ? ` (${prepaid.join(", ")} prepaid)` : ""}`],
    scuffle: false,
    safeMove: false,
    finishing: null,
    remedies: {},
    paid: 0,
    waitBefore: 0,
  };
}

/** The visit with one more line of history (kept to the last 12). */
export const logVisit = (v: Visit, line: string): Visit => ({ ...v, history: [...v.history, line].slice(-12) });
