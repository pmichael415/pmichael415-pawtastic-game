// PAWtastic Daycare Tycoon — staff roles and their two priorities (staff design §2). Constants only, so the save
// parser and the work engine (team.ts) can share them without importing each other.
import type { Focus, JobKind, Role } from "./types";

export const ROLES: Role[] = ["reception", "attendant", "bath", "cleaner"];
export const ROLE_NAME: Record<Role, string> = { reception: "Receptionist", attendant: "Daycare attendant", bath: "Bath attendant", cleaner: "Cleaner" };
export const ROLE_JOB: Record<Role, string> = {
  reception: "Checks in families when a matching playroom spot or bed is free, and sends home families with no concerns.",
  attendant: "Plays with pups in their playrooms who haven't played yet or are under 70% happy. Their presence halves scuffle risk there.",
  bath: "Runs the booked bath queue, one pup per free tub, and stays for the whole 40-minute bath.",
  cleaner: "Mops the dirtiest of their rooms when it drops under 80% clean.",
};
/** Each role's two priorities; the first is the default. */
export const FOCI: Record<Role, [Focus, Focus]> = {
  reception: ["pickups", "arrivals"],
  attendant: ["neediest", "newest"],
  bath: ["soonest", "booked"],
  cleaner: ["dirtiest", "busiest"],
};
export const FOCUS_NAME: Record<Focus, string> = {
  pickups: "Pickups first",
  arrivals: "Arrivals first",
  neediest: "Neediest pup first",
  newest: "Newest arrivals first",
  soonest: "Soonest pickup first",
  booked: "In booking order",
  dirtiest: "Dirtiest room first",
  busiest: "Busiest room first",
};
export const JOB_KINDS: JobKind[] = ["checkin", "pickup", "play", "bath", "clean"];
/** Which role does which job. */
export const JOB_ROLE: Record<JobKind, Role> = { checkin: "reception", pickup: "reception", play: "attendant", bath: "bath", clean: "cleaner" };
