// PAWtastic Daycare Tycoon — running a room (empire milestone §6): who looks after it, with one tap to give that job to
// someone free or hire for it, and what it does for families. Pure; staffing uses the team's own actions (hire,
// setRole, setRooms), so wages and roles follow the usual rules.
import { groupName } from "@/game/engine";
import { WAGES } from "./business";
import { caps } from "./connect";
import { ROLE_NAME } from "./roles";
import { roomName } from "./rooms";
import { canHire, hire, hireCostFor, liveRooms, setRole, setRooms } from "./team";
import type { Facility, Role, Room, TResult, TStaff, TycoonState } from "./types";

export type StaffPlan =
  | { kind: "none"; text: string }
  | { kind: "covered"; text: string }
  | { kind: "assign"; text: string; label: string; staffId: string; role: Role; rooms?: string[] }
  | { kind: "hire"; text: string; label: string; role: Role; cost: number; wage: number };

/** The role that runs each kind of room (calm and staff rooms need nobody). */
const ROLE_FOR: Partial<Record<NonNullable<Room["type"]>, Role>> = { bath: "bath", playroom: "attendant", boarding: "reception", lobby: "reception" };

const covers = (f: Facility, st: TStaff, role: Role, room: Room) => {
  if (st.role !== role) return false;
  if (role !== "attendant") return true;
  const live = liveRooms(f, st);
  return !live.length || live.includes(room.uid);
};
const names = (xs: TStaff[]) => (xs.length <= 2 ? xs.map((x) => x.name).join(" and ") : `${xs.slice(0, -1).map((x) => x.name).join(", ")} and ${xs.at(-1)!.name}`);

const WHAT: Record<Role, { covered: (who: string, n: number) => string; open: string }> = {
  bath: { covered: (who, n) => `✓ ${who} run${n === 1 ? "s" : ""} the baths.`, open: "No one runs baths yet — you can bath pups yourself (tap a pup booked for a bath, then Bath)." },
  attendant: { covered: (who) => `✓ ${who} looks after the pups here.`, open: "No attendant here yet — you play with the pups yourself." },
  reception: { covered: (who, n) => `✓ ${who} check${n === 1 ? "s" : ""} families in.`, open: "You check families in yourself." },
  cleaner: { covered: (who) => `✓ ${who} keeps it clean.`, open: "You mop it yourself." },
};

/** Who looks after this room, or the one-tap way to get someone on it. */
export function staffPlanFor(f: Facility, room: Room): StaffPlan {
  const role = room.type ? ROLE_FOR[room.type] : undefined;
  if (!role) return { kind: "none", text: room.type === "staff" ? "Nobody works here — your team rests here between jobs." : room.type === "calm" ? "Nobody needs to work here — an overwhelmed pup settles on its own." : "Pick what this room is for first." };
  const hired = f.staff.filter((x) => !x.founder);
  const on = hired.filter((x) => covers(f, x, role, room));
  if (on.length) return { kind: "covered", text: WHAT[role].covered(names(on), on.length) };
  // an attendant who looks after other playrooms only: add this one to their rooms
  const partial = role === "attendant" ? hired.find((x) => x.role === "attendant") : undefined;
  // (only rooms that are still playrooms: one retyped since would make the change refused)
  const keep = partial ? liveRooms(f, partial).filter((uid) => f.rooms.some((r) => r.uid === uid && r.type === "playroom")) : [];
  if (partial) return { kind: "assign", text: WHAT[role].open, label: `Add it to ${partial.name}'s rooms`, staffId: partial.id, role, rooms: [...keep, room.uid] };
  const free = hired.find((x) => !x.role);
  if (free) return { kind: "assign", text: WHAT[role].open, label: `Make ${free.name} your ${ROLE_NAME[role].toLowerCase()}`, staffId: free.id, role };
  if (!canHire(f)) return { kind: "none", text: `${WHAT[role].open} Your team is full — change someone's role in Team.` };
  const cost = hireCostFor(f);
  return { kind: "hire", text: WHAT[role].open, label: `Hire a ${ROLE_NAME[role].toLowerCase()} · ${cost.toLocaleString("en-US")}`, role, cost, wage: WAGES[f.wage] };
}

/** Carries out a plan from staffPlanFor (refused, with nothing changed, if it no longer fits). */
export function applyStaffPlan(s: TycoonState, plan: StaffPlan): TResult {
  if (plan.kind === "hire") return hire(s, plan.role);
  if (plan.kind !== "assign") return { ok: false, error: "Nothing to do here." };
  return plan.rooms ? setRooms(s, plan.staffId, plan.rooms) : setRole(s, plan.staffId, plan.role);
}

/** What the room does for families, with how much of it ("2 tubs — …", "3 spots for Small & Gentle pups"). */
export function roomServes(f: Facility, room: Room): string {
  const c = caps(f);
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  switch (room.type) {
    case "bath": {
      const tubs = c.tubs.filter((t) => t.room === room.uid).length;
      return tubs ? `${n(tubs, "tub", "tubs")} — families who book a bath or an exit bath get one here.` : "Add a bath tub so families can book baths.";
    }
    case "playroom": {
      const spots = c.playrooms.find((p) => p.room.uid === room.uid)?.spots ?? 0;
      return room.group ? `${n(spots, "spot", "spots")} for ${groupName(room.group)} pups — check one in and it's offered here.` : "Pick which pups play here.";
    }
    case "boarding": {
      const beds = c.beds.filter((b) => b.room === room.uid).length;
      return beds ? `${n(beds, "overnight bed", "overnight beds")} — families who book boarding can stay the night.` : "Add a boarding bed so families can book overnight stays.";
    }
    case "lobby":
      return `Where families arrive — ${n(c.waiting, "pup", "pups")} can wait here.`;
    case "calm":
      return "Where an overwhelmed pup settles down (always free).";
    case "staff":
      return "Where your team rests, so they're back at work sooner.";
    default:
      return `${roomName(f, room.uid)}: pick what it's for.`;
  }
}
