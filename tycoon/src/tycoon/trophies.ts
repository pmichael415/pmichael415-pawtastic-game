// PAWtastic Daycare Tycoon — one-time trophies with small coin rewards (spec §3 "Milestones"). They reward playing.
import { PARCELS } from "./catalog";
import { earn } from "./business";
import { caps } from "./connect";
import { fac } from "./state";
import type { Facility, RoomType, TycoonState } from "./types";

export type Trophy = { id: string; name: string; reward: number; test: (s: TycoonState, f: Facility) => boolean };

const ROOM_TYPES: RoomType[] = ["lobby", "playroom", "calm", "bath", "boarding", "staff"];

/** Every playroom spot and every boarding bed taken at once (at least one playroom). */
function fullyBooked(f: Facility): boolean {
  const c = caps(f);
  if (c.playrooms.length === 0) return false;
  const roomsFull = c.playrooms.every((p) => f.dogs.filter((d) => d.place.kind === "room" && d.place.room === p.room.uid).length >= p.spots);
  const bedsFull = c.beds.every((b) => f.dogs.some((d) => d.place.kind === "bed" && d.place.bed === b.bed));
  return roomsFull && bedsFull;
}

export const TROPHIES: Trophy[] = [
  { id: "first_dog", name: "First happy pup", reward: 50, test: (_s, f) => f.stats.checkouts >= 1 },
  { id: "dogs_10", name: "10 pups served", reward: 100, test: (_s, f) => f.stats.checkouts >= 10 },
  { id: "dogs_50", name: "50 pups served", reward: 200, test: (_s, f) => f.stats.checkouts >= 50 },
  { id: "dogs_250", name: "250 pups served", reward: 400, test: (_s, f) => f.stats.checkouts >= 250 },
  { id: "profit_1000", name: "A 1,000-coin day", reward: 300, test: (s) => s.bestProfit >= 1000 },
  { id: "first_boarder", name: "First boarding night", reward: 100, test: (_s, f) => f.stats.boarders >= 1 },
  { id: "fully_booked", name: "Fully booked", reward: 150, test: (_s, f) => fullyBooked(f) },
  { id: "all_room_types", name: "Every kind of room", reward: 250, test: (_s, f) => ROOM_TYPES.every((t) => f.rooms.some((r) => r.type === t)) },
  { id: "all_land", name: "The whole block", reward: 500, test: (_s, f) => PARCELS.every((p) => f.land.includes(p.id)) },
];

/** Unlocks every trophy whose condition holds now, once each, paying its reward as bonus income. */
export function checkTrophies(s: TycoonState): { state: TycoonState; unlocked: Trophy[] } {
  const f = fac(s);
  const unlocked = TROPHIES.filter((t) => !s.trophies.includes(t.id) && t.test(s, f));
  if (!unlocked.length) return { state: s, unlocked };
  const reward = unlocked.reduce((a, t) => a + t.reward, 0);
  const state = earn({ ...s, trophies: [...s.trophies, ...unlocked.map((t) => t.id)] }, { bonus: reward });
  return { state, unlocked };
}
