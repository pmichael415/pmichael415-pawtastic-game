// PAWtastic Daycare Tycoon — the team: hiring, roles and priorities, and staff doing real work in the simulation
// (staff design §2). Staff reuse the player's own actions (check-in, placement, play, baths, checkout, mopping), so
// billing and rules stay identical. They never make the consequential calls: mismatched placements, complaints,
// refusals, exit baths, scuffles and prices stay with the player. Pure; `tick` calls runStaff.
import { ENTRANCE } from "./catalog";
import { DAY_CLOSE, groupOf, hireCost, MAX_STAFF } from "@/game/engine";
import { WAGES } from "./business";
import { caps } from "./connect";
import { pickupView } from "./pickup";
import { XP, gainXp } from "./progress";
import { FOCI, ROLE_NAME } from "./roles";
import { BATH_MIN, bathQueue, roomCleanOf, roomName, roomOfDog, setRoomClean, tubName, tubsInUse } from "./rooms";
import { applyPlay, assignBed, assignRoom, bathBlock, checkIn, checkout, hireStaff, inActiveScuffle, offerAnotherDay, startBath, turnAway } from "./run";
import { DESK_UPSET, waitStage } from "./waiting";
import { fac, withFac } from "./state";
import { tourHolds } from "./tour";
import type { Facility, Focus, Job, JobKind, Role, TDog, TResult, TStaff, Tile, TycoonState } from "./types";

/** Game minutes of work per job (a bath is the bath itself). Walking is 1 tile a game minute, at least 1. */
export const WORK_MIN: Record<JobKind, number> = { checkin: 4, pickup: 4, decline: 2, play: 10, bath: BATH_MIN, clean: 12 };
export const JOB_ENERGY: Record<JobKind, number> = { checkin: 4, pickup: 4, decline: 2, play: 10, bath: 15, clean: 10 };
export const REST_UNTIL = 40;
export const ATTEND_BELOW = 70;
export const CLEAN_BELOW = 80;

const done = (state: TycoonState, msg: string): TResult => ({ ok: true, state, msg });
const no = (error: string): TResult => ({ ok: false, error });
const staffOf = (f: Facility, id: string) => f.staff.find((x) => x.id === id) ?? null;
const setStaff = (f: Facility, id: string, change: (x: TStaff) => TStaff): Facility => ({ ...f, staff: f.staff.map((x) => (x.id === id ? change(x) : x)) });

// ---------- management ----------

export const teamWages = (f: Facility) => WAGES[f.wage] * f.staff.length;

/** Hires one person straight into a role: the sign-on fee now, the daily wage at closing. */
export function hire(s: TycoonState, role: Role): TResult {
  const r = hireStaff(s);
  if (!r.ok) return r;
  const f = fac(r.state);
  const id = f.staff.at(-1)!.id;
  const nf = setStaff(f, id, (x) => ({ ...x, role, rooms: [], focus: FOCI[role][0], job: null, at: null, note: null, resting: false }));
  const who = f.staff.at(-1)!.name;
  return done(withFac(r.state, nf), `${who} joined as your ${ROLE_NAME[role].toLowerCase()} — ${WAGES[f.wage]} coins a day.`);
}

export function setRole(s: TycoonState, id: string, role: Role | null): TResult {
  const f = fac(s);
  const st = staffOf(f, id);
  if (!st) return no("That person isn't on the team.");
  if (st.founder) return no(`${st.name} is your partner — he helps when you tap. Hire someone to take on a role.`);
  if (st.role === role) return no(`${st.name} already has that role.`);
  const nf = setStaff(f, id, (x) => {
    const { focus: _old, ...rest } = x;
    return { ...rest, role, rooms: [], ...(role ? { focus: FOCI[role][0] } : {}), job: null, note: null };
  });
  return done(withFac(s, nf), role ? `${st.name} is now your ${ROLE_NAME[role].toLowerCase()}.` : `${st.name} now helps when you tap.`);
}

export function setFocus(s: TycoonState, id: string, focus: Focus): TResult {
  const f = fac(s);
  const st = staffOf(f, id);
  if (!st || !st.role) return no("Give them a role first.");
  if (!FOCI[st.role].includes(focus)) return no("That priority isn't part of their role.");
  return done(withFac(s, setStaff(f, id, (x) => ({ ...x, focus }))), `${st.name}'s priority changed.`);
}

/** Attendants look after particular playrooms; cleaners any rooms. Empty means all. */
export function setRooms(s: TycoonState, id: string, rooms: string[]): TResult {
  const f = fac(s);
  const st = staffOf(f, id);
  if (!st) return no("That person isn't on the team.");
  if (st.role !== "attendant" && st.role !== "cleaner") return no("Only attendants and cleaners look after particular rooms.");
  const valid = rooms.every((uid) => {
    const room = f.rooms.find((r) => r.uid === uid);
    return !!room && (st.role === "cleaner" || room.type === "playroom");
  });
  if (!valid) return no(st.role === "attendant" ? "Attendants look after playrooms." : "Pick rooms in this daycare.");
  return done(withFac(s, setStaff(f, id, (x) => ({ ...x, rooms: [...new Set(rooms)], job: null }))), rooms.length ? `${st.name} looks after ${rooms.map((r) => roomName(f, r)).join(", ")}.` : `${st.name} looks after every room.`);
}

export function letGo(s: TycoonState, id: string): TResult {
  const f = fac(s);
  const st = staffOf(f, id);
  if (!st) return no("That person isn't on the team.");
  if (st.founder) return no(`${st.name} is your founding partner and stays.`);
  return done(withFac(s, { ...f, staff: f.staff.filter((x) => x.id !== id) }), `${st.name} has moved on. Their wage stops from tonight.`);
}

/** The role that would help most right now. */
export function recommendRole(f: Facility): Role {
  const has = (r: Role) => f.staff.some((x) => x.role === r);
  if (!has("bath") && bathQueue(f).length >= 2) return "bath";
  if (!has("reception")) return "reception";
  if (!has("attendant")) return "attendant";
  if (!has("cleaner") && f.cleanliness < 70) return "cleaner";
  if (!has("bath") && caps(f).tubs.length) return "bath";
  return "attendant";
}

export const canHire = (f: Facility) => f.staff.length < MAX_STAFF;
/** The next hire's sign-on fee. */
export const hireCostFor = (f: Facility) => hireCost(f.staff.length);

// ---------- where things are ----------

const roomCenter = (f: Facility, uid: string): Tile => {
  const r = f.rooms.find((x) => x.uid === uid);
  return r ? { c: r.c + Math.floor(r.w / 2), r: r.r + Math.floor(r.d / 2) } : { c: ENTRANCE.c, r: ENTRANCE.r - 1 };
};
export function deskTile(f: Facility): Tile {
  const counter = f.items.find((i) => i.kind === "front_counter");
  if (counter) return { c: counter.c, r: counter.r };
  const lobby = f.rooms.find((r) => r.type === "lobby");
  return lobby ? roomCenter(f, lobby.uid) : { c: ENTRANCE.c, r: ENTRANCE.r - 1 };
}
const itemTile = (f: Facility, uid: string): Tile => {
  const i = f.items.find((x) => x.uid === uid);
  return i ? { c: i.c, r: i.r } : deskTile(f);
};
function dogTile(f: Facility, d: TDog): Tile {
  if (d.place.kind === "bed") return itemTile(f, d.place.bed);
  if (d.place.kind === "lobby") return deskTile(f);
  return roomCenter(f, d.place.room);
}
const walkMin = (from: Tile, to: Tile) => Math.max(1, Math.abs(from.c - to.c) + Math.abs(from.r - to.r));

// ---------- choosing work ----------

type Claims = { dogs: Set<string>; tubs: Set<string>; rooms: Set<string>; beds: Set<string>; spots: Map<string, number> };
function claimsOf(f: Facility): Claims {
  const c: Claims = { dogs: new Set(), tubs: new Set(), rooms: new Set(), beds: new Set(), spots: new Map() };
  for (const st of f.staff) {
    const j = st.job;
    if (!j) continue;
    if (j.dog) c.dogs.add(j.dog);
    if (j.tub) c.tubs.add(j.tub);
    if (j.kind === "clean" && j.room) c.rooms.add(j.room);
    if (j.kind === "checkin" && j.bed) c.beds.add(j.bed);
    if (j.kind === "checkin" && j.room) c.spots.set(j.room, (c.spots.get(j.room) ?? 0) + 1);
  }
  return c;
}

/** Where a waiting pup could go without a mismatch: a free spot in a playroom for its group, or a free boarding bed. */
export function spotFor(f: Facility, d: TDog, claims: Claims = claimsOf(f)): { room: string; bed: string | null } | null {
  const c = caps(f);
  if (d.boarding) {
    const bed = c.beds.find((b) => !claims.beds.has(b.bed) && !f.dogs.some((x) => x.place.kind === "bed" && x.place.bed === b.bed));
    return bed ? { room: bed.room, bed: bed.bed } : null;
  }
  const g = groupOf(d);
  const room = c.playrooms.find((p) => p.group === g && f.dogs.filter((x) => x.place.kind === "room" && x.place.room === p.room.uid).length + (claims.spots.get(p.room.uid) ?? 0) < p.spots);
  return room ? { room: room.room.uid, bed: null } : null;
}
const groupWords = (d: TDog) => `${d.size === "small" ? "Small" : "Large"} & ${d.temper === "gentle" ? "Gentle" : "Active"}`;

const routinePickup = (s: TycoonState, d: TDog) => pickupView(s, d.id, false).assessment.complaints.length === 0;
const pickupReady = (d: TDog) => d.checkedIn && d.visit?.ownerHere != null && !d.bathing && !d.visit.finishing;
/** The rooms someone looks after that still exist (none: all rooms). */
export const liveRooms = (f: Facility, st: TStaff) => (st.rooms ?? []).filter((uid) => f.rooms.some((r) => r.uid === uid));
const inRooms = (f: Facility, st: TStaff, room: string | null) => {
  const live = liveRooms(f, st);
  return !live.length || (room !== null && live.includes(room));
};

type Pick = { job: Omit<Job, "phase" | "left" | "total">; note?: undefined } | { job: null; note: string | null };

function pickReception(s: TycoonState, st: TStaff, claims: Claims): Pick {
  const f = fac(s);
  let note: string | null = null;
  const pickups = f.dogs
    .filter((d) => pickupReady(d) && !claims.dogs.has(d.id))
    .sort((a, b) => (a.visit!.ownerHere ?? 0) - (b.visit!.ownerHere ?? 0))
    .filter((d) => {
      if (routinePickup(s, d)) return true;
      note ??= `${d.visit!.owner} has a concern about ${d.name} — needs you`;
      return false;
    });
  const arrivals = f.dogs
    .filter((d) => !d.checkedIn && d.place.kind === "lobby" && !claims.dogs.has(d.id))
    .sort((a, b) => (a.visit?.arrived ?? 0) - (b.visit?.arrived ?? 0))
    .filter((d) => {
      if (spotFor(f, d, claims)) return true;
      note ??= d.boarding ? `No free boarding bed for ${d.name} — needs you` : `No free ${groupWords(d)} spot for ${d.name} — needs you`;
      return false;
    });
  // A family with no matching spot is the player's call — until they're upset: then a kind, free reschedule.
  const upset = f.dogs.find((d) => !d.checkedIn && d.place.kind === "lobby" && !claims.dogs.has(d.id) && !spotFor(f, d, claims) && (waitStage(f, d)?.minutes ?? 0) >= DESK_UPSET);
  if (upset) return { job: { kind: "decline", dog: upset.id, room: null, tub: null, to: deskTile(f) } };
  const order = st.focus === "arrivals" ? [arrivals, pickups] : [pickups, arrivals];
  for (const list of order) {
    const d = list[0];
    if (!d) continue;
    if (!d.checkedIn) {
      const spot = spotFor(f, d, claims)!;
      return { job: { kind: "checkin", dog: d.id, room: spot.room, tub: null, bed: spot.bed, to: deskTile(f) } };
    }
    return { job: { kind: "pickup", dog: d.id, room: null, tub: null, to: deskTile(f) } };
  }
  return { job: null, note };
}

const playable = (f: Facility, d: TDog) => d.checkedIn && (d.place.kind === "room" || d.place.kind === "bed") && !d.bathing && !inActiveScuffle(f, d) && !(d.visit?.ownerHere != null);
function pickAttendant(s: TycoonState, st: TStaff, claims: Claims): Pick {
  const f = fac(s);
  const pups = f.dogs.filter((d) => playable(f, d) && !claims.dogs.has(d.id) && inRooms(f, st, roomOfDog(f, d)) && (d.played === 0 || d.happiness < ATTEND_BELOW));
  pups.sort((a, b) => (st.focus === "newest" ? Number(a.played > 0) - Number(b.played > 0) : 0) || a.happiness - b.happiness);
  const d = pups[0];
  return d ? { job: { kind: "play", dog: d.id, room: roomOfDog(f, d), tub: null, to: dogTile(f, d) } } : { job: null, note: null };
}

function pickBath(s: TycoonState, st: TStaff, claims: Claims): Pick {
  const f = fac(s);
  const used = tubsInUse(f);
  const tub = caps(f).tubs.find((t) => !used.has(t.uid) && !claims.tubs.has(t.uid));
  // a family already here, or a bath that can't finish before closing, is the player's call (finish, refund)
  let note: string | null = null;
  const queue = bathQueue(f).filter((d) => {
    if (claims.dogs.has(d.id) || inActiveScuffle(f, d)) return false;
    if (d.visit?.ownerHere != null) {
      note ??= `${d.visit.owner} is here and ${d.name}'s booked bath isn't done — needs you`;
      return false;
    }
    return d.boarding || f.clockMin + BATH_MIN + 2 <= DAY_CLOSE;
  });
  if (st.focus !== "booked") queue.sort((a, b) => (a.visit!.pickupDay - b.visit!.pickupDay) * 1440 + (a.visit!.pickup - b.visit!.pickup));
  const d = queue[0];
  if (!d) return { job: null, note };
  const refused = bathBlock(f, "bath");
  if (refused) return { job: null, note: `${refused.replace(/\.$/, "")} — the bath price is yours to change; needs you` };
  if (!tub) return { job: null, note: caps(f).tubs.length ? null : "No working bath station — needs you" };
  return { job: { kind: "bath", dog: d.id, room: roomOfDog(f, d), tub: tub.uid, to: itemTile(f, tub.uid) } };
}

function pickCleaner(s: TycoonState, st: TStaff, claims: Claims): Pick {
  const f = fac(s);
  const busy = (uid: string) => f.dogs.filter((d) => roomOfDog(f, d) === uid).length;
  const rooms = f.rooms.filter((r) => inRooms(f, st, r.uid) && !claims.rooms.has(r.uid) && roomCleanOf(f, r.uid) < CLEAN_BELOW);
  rooms.sort((a, b) => (st.focus === "busiest" ? busy(b.uid) - busy(a.uid) : 0) || roomCleanOf(f, a.uid) - roomCleanOf(f, b.uid));
  const r = rooms[0];
  return r ? { job: { kind: "clean", dog: null, room: r.uid, tub: null, to: roomCenter(f, r.uid) } } : { job: null, note: null };
}

const PICK: Record<Role, (s: TycoonState, st: TStaff, c: Claims) => Pick> = { reception: pickReception, attendant: pickAttendant, bath: pickBath, cleaner: pickCleaner };

// ---------- doing work ----------

export const canWork = (s: TycoonState) => fac(s).open && !tourHolds(s);

/** Why a job can't go on (null if it can). Checked every step, so a job the player overtook ends cleanly. */
function invalid(s: TycoonState, j: Job): string | null {
  const f = fac(s);
  const d = j.dog ? f.dogs.find((x) => x.id === j.dog) ?? null : null;
  if (j.dog && !d) return `${nameOf(s, j)} went home — job cancelled`;
  switch (j.kind) {
    case "checkin":
    case "decline":
      if (d!.checkedIn || d!.place.kind !== "lobby") return `${d!.name} was checked in already`;
      return null;
    case "pickup":
      return pickupReady(d!) ? null : `${d!.name}'s pickup changed — job cancelled`;
    case "play":
      return playable(f, d!) ? null : `${d!.name} isn't free to play now — job cancelled`;
    case "bath":
      if (j.phase === "work") return null;
      if (d!.bathing || d!.bathed) return `${d!.name}'s bath was started by someone else`;
      if (d!.visit?.ownerHere != null) return `${d!.visit.owner} arrived before ${d!.name}'s bath started — needs you`;
      if (inActiveScuffle(f, d!)) return `${d!.name}'s room has a scuffle — needs you`;
      if (bathBlock(f, "bath")) return `${bathBlock(f, "bath")!.replace(/\.$/, "")} — needs you`;
      if (!caps(f).tubs.some((t) => t.uid === j.tub) || tubsInUse(f).has(j.tub!)) return `${tubName(f, j.tub!)} is busy — waiting for a free tub`;
      return d!.place.kind === "room" || d!.place.kind === "bed" ? null : `${d!.name} isn't settled — job cancelled`;
    case "clean":
      return f.rooms.some((r) => r.uid === j.room) ? null : "That room is gone — job cancelled";
  }
}
const nameOf = (s: TycoonState, j: Job) => fac(s).dogs.find((d) => d.id === j.dog)?.name ?? j.who ?? "The pup";

/** Drops jobs that can't go on; a bath whose bath is over is simply done. */
function validate(s: TycoonState): TycoonState {
  const f = fac(s);
  let changed = false;
  const staff = f.staff.map((st) => {
    const j = st.job;
    if (!j) return st;
    if (j.kind === "bath" && j.phase === "work") {
      const d = f.dogs.find((x) => x.id === j.dog);
      if (d && d.bathing) return st;
      changed = true;
      return { ...st, job: null, at: j.to, note: null };
    }
    const why = invalid(s, j);
    if (!why) return st;
    changed = true;
    return { ...st, job: null, note: why };
  });
  return changed ? withFac(s, { ...f, staff }) : s;
}

/** Gives free staff their next job (or a break, or a "needs you" note). */
function plan(s: TycoonState): TycoonState {
  if (!canWork(s)) return s;
  let out = s;
  for (const st0 of fac(s).staff) {
    if (!st0.role || st0.job) continue;
    const f = fac(out);
    const st = staffOf(f, st0.id)!;
    if (st.resting) {
      if (st.energy < REST_UNTIL) continue;
      out = withFac(out, setStaff(f, st.id, (x) => ({ ...x, resting: false })));
    }
    const pick = PICK[st.role!](out, staffOf(fac(out), st.id)!, claimsOf(fac(out)));
    const g = fac(out);
    if (!pick.job) {
      // a "needs you" note is replaced or cleared as things change; a "job cancelled" note stays until the next job
      const cur = g.staff.find((x) => x.id === st.id)!.note ?? null;
      const next = pick.note ?? (cur && /needs you/.test(cur) ? null : cur);
      if (cur !== next) out = withFac(out, setStaff(g, st.id, (x) => ({ ...x, note: next })));
      continue;
    }
    const cost = JOB_ENERGY[pick.job.kind];
    if (st.energy < cost) {
      out = withFac(out, setStaff(g, st.id, (x) => ({ ...x, resting: true })));
      continue;
    }
    const from = st.at ?? deskTile(g);
    const walk = walkMin(from, pick.job.to);
    const who = pick.job.dog ? g.dogs.find((d) => d.id === pick.job!.dog)?.name : undefined;
    const job: Job = { ...pick.job, ...(who ? { who } : {}), phase: "walk", left: walk, total: walk };
    out = withFac(out, setStaff(g, st.id, (x) => ({ ...x, energy: x.energy - cost, job, note: null })));
  }
  return out;
}

/** A job whose phase is over: walking turns into working, and finished work has its real effect. */
function complete(s: TycoonState): TycoonState {
  let out = s;
  for (const st0 of fac(s).staff) {
    const j = st0.job;
    if (!j || j.left > 1e-9 || (j.kind === "bath" && j.phase === "work")) continue;
    if (j.phase === "walk") {
      const f = fac(out);
      if (j.kind === "bath") {
        const why = invalid(out, j);
        if (why) {
          out = withFac(out, setStaff(f, st0.id, (x) => ({ ...x, job: null, at: j.to, note: why })));
          continue;
        }
        out = gainXp(withFac(out, startBath(f, j.dog!, j.tub!)), XP.bath);
      }
      const g = fac(out);
      out = withFac(out, setStaff(g, st0.id, (x) => ({ ...x, at: j.to, job: { ...j, phase: "work", left: WORK_MIN[j.kind], total: WORK_MIN[j.kind] } })));
      continue;
    }
    out = finish(out, st0.id, j);
  }
  return out;
}

function finish(s: TycoonState, id: string, j: Job): TycoonState {
  const free = (st: TycoonState, note: string | null) => withFac(st, setStaff(fac(st), id, (x) => ({ ...x, job: null, at: j.to, note })));
  switch (j.kind) {
    case "checkin": {
      const f = fac(s);
      const d = f.dogs.find((x) => x.id === j.dog);
      if (!d || d.checkedIn) return free(s, null);
      const others = claimsOf({ ...f, staff: f.staff.filter((x) => x.id !== id) });
      const spot = spotFor(f, d, others);
      if (!spot) return free(s, `No free ${d.boarding ? "boarding bed" : groupWords(d) + " spot"} for ${d.name} any more — needs you`);
      const a = checkIn(s, d.id);
      if (!a.ok) return free(s, a.error);
      const b = spot.bed ? assignBed(a.state, d.id, spot.bed) : assignRoom(a.state, d.id, spot.room);
      return free(b.ok ? b.state : a.state, b.ok ? null : b.error);
    }
    case "decline": {
      const f = fac(s);
      const d = f.dogs.find((x) => x.id === j.dog);
      if (!d || d.checkedIn) return free(s, null);
      if (spotFor(f, d, claimsOf({ ...f, staff: f.staff.filter((x) => x.id !== id) }))) return free(s, null); // a spot opened up: check-in instead
      const another = offerAnotherDay(s, d.id);
      const r = another.ok ? another : turnAway(s, d.id);
      return free(r.ok ? r.state : s, r.ok ? `${another.ok ? "Rescheduled" : "Couldn't take"} ${d.name} — no ${d.boarding ? "boarding bed" : groupWords(d) + " spot"} today` : r.error);
    }
    case "pickup": {
      const d = fac(s).dogs.find((x) => x.id === j.dog);
      if (!d) return free(s, null);
      if (!routinePickup(s, d)) return free(s, `${d.visit!.owner} has a concern about ${d.name} — needs you`);
      const r = checkout(s, d.id, false);
      return free(r.ok ? r.state : s, r.ok ? null : r.error);
    }
    case "play": {
      const f = fac(s);
      if (!f.dogs.some((x) => x.id === j.dog)) return free(s, null);
      return free(gainXp(withFac(s, applyPlay(f, j.dog!).f), XP.playtime), null);
    }
    case "clean": {
      const f = fac(s);
      const nf = setRoomClean(f, (v, r) => (r.uid === j.room ? 100 : v));
      return free(gainXp(withFac(s, { ...nf, stats: { ...nf.stats, cleans: (nf.stats.cleans ?? 0) + 1 } }), XP.clean), null);
    }
    case "bath":
      return free(s, null);
  }
}

/** Advances the team's work by `gameMin` game minutes. Jobs run in order of what finishes first. */
export function runStaff(s: TycoonState, gameMin: number): TycoonState {
  if (!fac(s).staff.some((x) => x.role)) return s;
  let out = plan(validate(s));
  let remaining = gameMin;
  for (let guard = 0; remaining > 1e-9 && guard < 80; guard++) {
    const f = fac(out);
    const timed = f.staff.filter((x) => x.job && !(x.job.kind === "bath" && x.job.phase === "work"));
    if (!timed.length) break;
    const step = Math.min(remaining, ...timed.map((x) => Math.max(0, x.job!.left)));
    out = withFac(out, { ...f, staff: f.staff.map((x) => (x.job && !(x.job.kind === "bath" && x.job.phase === "work") ? { ...x, job: { ...x.job, left: Math.max(0, x.job.left - step) } } : x)) });
    remaining -= step;
    out = plan(validate(complete(out)));
  }
  return out;
}

/** Whether an attendant looks after this playroom (halves scuffle risk there). */
export const supervised = (f: Facility, room: string) => f.staff.some((x) => x.role === "attendant" && inRooms(f, x, room));

// ---------- what people see ----------

export type StaffStatus = { text: string; tone: "busy" | "idle" | "rest" | "off" | "needs" | "helper" };
export function staffStatus(f: Facility, st: TStaff): StaffStatus {
  if (st.founder) return { text: `Helps when you tap`, tone: "helper" };
  if (!st.role) return { text: "No role yet — helps when you tap", tone: "helper" };
  const j = st.job;
  const dog = j?.dog ? f.dogs.find((d) => d.id === j.dog) ?? null : null;
  const who = dog?.name ?? "a pup";
  if (j && j.phase === "walk") {
    if (j.kind === "checkin" || j.kind === "pickup" || j.kind === "decline") return { text: "Walking to the front desk", tone: "busy" };
    if (j.kind === "bath") return { text: `Walking to ${tubName(f, j.tub!)} — ${who} is next`, tone: "busy" };
    if (j.kind === "play") return { text: `Walking to ${dog ? (roomOfDog(f, dog) ? roomName(f, roomOfDog(f, dog)!) : "the pup") : "the pup"}`, tone: "busy" };
    return { text: `Walking to ${roomName(f, j.room!)}`, tone: "busy" };
  }
  if (j) {
    if (j.kind === "checkin") return { text: `Checking in ${who}`, tone: "busy" };
    if (j.kind === "decline") return { text: `Kindly rescheduling ${who}'s family`, tone: "busy" };
    if (j.kind === "pickup") return { text: `Sending ${who} home with ${dog?.visit?.owner ?? "their family"}`, tone: "busy" };
    if (j.kind === "play") return { text: `Playing with ${who}`, tone: "busy" };
    if (j.kind === "bath") return { text: `Bathing ${who} — ${Math.ceil(dog?.bathing ?? 0)} min left`, tone: "busy" };
    return { text: `Cleaning ${roomName(f, j.room!)}`, tone: "busy" };
  }
  if (st.resting) return { text: "On a break", tone: "rest" };
  if (!f.open) return { text: "Off duty — the daycare is closed", tone: "off" };
  if (st.note && /needs you/.test(st.note)) return { text: `Available — ${st.note}`, tone: "needs" };
  return { text: "Available", tone: "idle" };
}

/** Who is looking after a pup right now: the staff member on a job for them, else their room's attendant, else you. */
export function responsibleFor(f: Facility, d: TDog): string {
  const onJob = f.staff.find((x) => x.job?.dog === d.id);
  if (onJob) return `${onJob.name} — ${staffStatus(f, onJob).text}`;
  const room = roomOfDog(f, d);
  const att = f.staff.find((x) => x.role === "attendant" && room && f.rooms.find((r) => r.uid === room)?.type === "playroom" && inRooms(f, x, room));
  return att ? `${att.name} (attendant)` : "You";
}
