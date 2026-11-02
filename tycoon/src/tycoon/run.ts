// PAWtastic Daycare Tycoon — the daily care loop in player-built rooms, ported from src/game/engine.ts (spec §4.5).
// Same decay and gain numbers as today's game. Playtime pays no coins: it raises happiness, which raises checkout pay.
import {
  ARRIVAL_CHANCE_PER_MIN,
  BREEDS,
  DAY_CLOSE,
  DAY_OPEN,
  FAVORITE_LABEL,
  GAME_MIN_PER_SEC,
  GUESTBOOK_MAX,
  MAX_OFFLINE_REWARD,
  MAX_STAFF,
  NAMES,
  REGULAR_CHANCE,
  REP_MIN,
  SCUFFLE_CHANCE_PER_SEC,
  STAFF_NAMES,
  friendshipLevel,
  groupName,
  groupOf,
  hireCost,
  lobbyStatus,
  mismatchWarning,
  personalityOf,
} from "@/game/engine";
import type { Regular, Stats } from "@/game/engine";
import { bathPay, campaignBoost, checkoutPay, closeDay, countToday, demand, earn, fairPrice, refuses, spend, wageRecovery } from "./business";
import { canOpen, caps, roomStatus } from "./connect";
import { arrivalMultiplier, decayMultiplier, funAppeal, playBonus } from "./effects";
import { XP, gainXp } from "./progress";
import { fac, withFac } from "./state";
import type { Facility, Room, TDog, TPlace, TResult, TycoonState } from "./types";

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const gone = { ok: false as const, error: "That pup already went home." };
const tired = { ok: false as const, error: "Staff are tired — let them rest a moment." };
export const RUSH_MIN_WAITING = 3;
export const RUSH_WINDOW_MIN = 30;
export const PREMIUM_HAPPY = 5;

// ---------- helpers ----------

const findDog = (f: Facility, id: string) => f.dogs.find((d) => d.id === id) ?? null;
const setDog = (f: Facility, id: string, change: (d: TDog) => TDog): Facility => ({ ...f, dogs: f.dogs.map((d) => (d.id === id ? change(d) : d)) });
const bump = (f: Facility, key: keyof Stats, n = 1): Facility => ({ ...f, stats: { ...f.stats, [key]: (f.stats[key] ?? 0) + n } });
export const lobbyDogs = (f: Facility) => f.dogs.filter((d) => d.place.kind === "lobby");
export const roomDogs = (f: Facility, roomUid: string) => f.dogs.filter((d) => d.place.kind === "room" && d.place.room === roomUid);
const roomOf = (f: Facility, uid: string) => f.rooms.find((r) => r.uid === uid) ?? null;

/** A playroom is at risk when it holds 2+ pups and one doesn't match its group. Matching rooms never scuffle. */
export function roomAtRisk(f: Facility, room: Room): boolean {
  const dogs = roomDogs(f, room.uid);
  return dogs.length >= 2 && dogs.some((d) => groupOf(d) !== room.group);
}
export const hasScuffle = (f: Facility, roomUid: string) => f.scuffles.some((x) => x.room === roomUid);
export const inActiveScuffle = (f: Facility, d: TDog) => d.place.kind === "room" && hasScuffle(f, d.place.room);

/** The staff member with the most energy who can afford `cost`, spent. */
function spendStaff(f: Facility, cost: number): Facility | null {
  let best = -1;
  f.staff.forEach((st, i) => {
    if (st.energy >= cost && (best < 0 || st.energy > f.staff[best]!.energy)) best = i;
  });
  if (best < 0) return null;
  return { ...f, staff: f.staff.map((st, j) => (j === best ? { ...st, energy: st.energy - cost } : st)) };
}

/** Where a pup goes to calm down: a working Calm-Down Room, else any Calm-Down Room, else the lobby desk. Always works. */
function calmPlace(f: Facility): TPlace {
  const working = caps(f).calm[0];
  const any = working ?? f.rooms.find((r) => r.type === "calm");
  return any ? { kind: "calm", room: any.uid } : { kind: "lobby" };
}

/**
 * Rush hour: once the lobby has had 3+ waiting, clearing it to 0 within 30 game minutes pays a once-a-day bonus of
 * round(0.1 × daycare price × peak) to "bonus" income.
 */
function trackRush(s: TycoonState): { state: TycoonState; bonus: number } {
  let f = fac(s);
  let rush = f.rush.day === f.day ? f.rush : { day: f.day, peak: 0, since: null, awarded: false };
  const waiting = lobbyDogs(f).length;
  if (waiting >= RUSH_MIN_WAITING) {
    rush = { ...rush, since: rush.since ?? f.clockMin, peak: Math.max(rush.peak, waiting) };
  } else if (waiting === 0 && rush.since !== null) {
    const inTime = f.clockMin - rush.since <= RUSH_WINDOW_MIN;
    if (inTime && !rush.awarded) {
      const bonus = Math.round(0.1 * f.prices.daycare * rush.peak);
      f = { ...f, rush: { ...rush, since: null, peak: 0, awarded: true } };
      return { state: earn(withFac(s, f), { bonus }), bonus };
    }
    rush = { ...rush, since: null, peak: 0 };
  }
  return { state: withFac(s, { ...f, rush }), bonus: 0 };
}
/** Finishes an action that may have emptied the lobby. */
function done(s: TycoonState, msg: string): TResult {
  const r = trackRush(s);
  return { ok: true, state: r.state, msg: r.bonus ? `${msg} Smooth operator! +${r.bonus}` : msg, ...(r.bonus ? { earned: r.bonus } : {}) };
}

// ---------- opening ----------

export function setOpen(s: TycoonState, open: boolean): TResult {
  const f = fac(s);
  if (open) {
    const c = canOpen(f);
    if (!c.ok) return { ok: false, error: `Before you can open: ${c.missing.join(", ")}.` };
  }
  return { ok: true, state: withFac(s, { ...f, open }), msg: open ? "We're open! Customers will start dropping pups off." : "Closed — no new drop-offs, and the day clock pauses." };
}

// ---------- arrivals and check-in ----------

/** A customer drops a pup off in the lobby. No coins yet; staff must check them in. */
export function createArrival(s: TycoonState, rand: () => number, boarding = false): TResult {
  const f = fac(s);
  if (!f.open) return { ok: false, error: "Open the daycare first." };
  if (!lobbyStatus(f.clockMin).open) return { ok: false, error: "Lobby closed for the midday break — drop-offs resume at 14:00 (game clock)." };
  const c = caps(f);
  if (!c.lobby) return { ok: false, error: "Build a working Lobby first." };
  if (lobbyDogs(f).length >= c.waiting) return { ok: false, error: "The lobby is full — move waiting pups to a playroom or bed first." };
  if (boarding && c.beds.length - f.dogs.filter((d) => d.boarding).length <= 0) return { ok: false, error: "No free boarding bed." };
  const away = f.guestBook.filter((g) => !f.dogs.some((d) => d.name === g.name && d.breed === g.breed));
  const reg = away.length && rand() < REGULAR_CHANCE ? away[Math.floor(rand() * away.length)]! : null;
  const breed = reg ? reg.breed : Math.floor(rand() * BREEDS.length);
  const dog: TDog = {
    id: "d" + s.seq,
    name: reg ? reg.name : NAMES[Math.floor(rand() * NAMES.length)]!,
    breed,
    size: reg ? reg.size : BREEDS[breed]!.size,
    temper: reg ? reg.temper : rand() < 0.5 ? "gentle" : "active",
    visits: reg ? reg.visits + 1 : 1,
    place: { kind: "lobby" },
    checkedIn: false,
    happiness: 60 + Math.floor(rand() * 20),
    clean: 55 + Math.floor(rand() * 30),
    boarding,
    played: 0,
    bathed: false,
  };
  const hello = reg ? `${dog.name} is back for visit #${dog.visits} (${friendshipLevel(reg.friendship).label})! Check them in at the desk.` : `${dog.name} was dropped off — check them in at the front desk.`;
  const next = withFac({ ...s, seq: s.seq + 1 }, { ...f, dogs: [...f.dogs, dog] });
  return { ok: true, state: trackRush(next).state, msg: hello };
}

/** Staff check-in. Pays nothing (pay comes at checkout), earns XP and uses one day's supplies. */
export function checkIn(s: TycoonState, dogId: string): TResult {
  const f = fac(s);
  const dog = findDog(f, dogId);
  if (!dog) return gone;
  if (dog.checkedIn) return { ok: false, error: `${dog.name} is already checked in.` };
  const extra = f.supplies === "premium" ? PREMIUM_HAPPY : 0;
  let nf = setDog(f, dogId, (d) => ({ ...d, checkedIn: true, happiness: clamp(d.happiness + extra) }));
  nf = bump(bump(nf, "admitted"), "boarders", dog.boarding ? 1 : 0);
  const st = gainXp(countToday(withFac(s, nf), "checkIns"), XP.checkIn);
  return { ok: true, state: st, msg: `${dog.name} is checked in!` };
}

// ---------- placing pups ----------

function notWorking(f: Facility, room: Room): string | null {
  const st = roomStatus(f, room);
  if (st.working) return null;
  if (st.reason === "Closed") return "That room is closed.";
  if (st.reason === "Not connected") return "Not connected — link this room to the entrance with doors and paths.";
  return st.reason;
}

/** Mismatched placement needs explicit confirmation and adds scuffle risk to that room. */
export function assignRoom(s: TycoonState, dogId: string, roomUid: string, confirmMismatch = false): TResult {
  const f = fac(s);
  const dog = findDog(f, dogId);
  if (!dog) return gone;
  const room = roomOf(f, roomUid);
  if (!room || room.type !== "playroom" || !room.group) return { ok: false, error: "Pick a playroom." };
  if (!dog.checkedIn) return { ok: false, error: `${dog.name} just arrived — check them in at the front desk first.` };
  if (dog.boarding) return { ok: false, error: `${dog.name} is an overnight guest — settle them into a boarding bed.` };
  if (dog.place.kind === "room" && dog.place.room === roomUid) return { ok: false, error: `${dog.name} is already in this playroom.` };
  const why = notWorking(f, room);
  if (why) return { ok: false, error: why };
  const spots = caps(f).playrooms.find((p) => p.room.uid === roomUid)?.spots ?? 0;
  if (roomDogs(f, roomUid).length >= spots) return { ok: false, error: "That playroom is full." };
  const warn = mismatchWarning(dog, room.group);
  if (warn && !confirmMismatch) return { ok: false, error: warn + " Confirm to place anyway (scuffle risk)." };
  const nf = setDog(f, dogId, (d) => ({ ...d, place: { kind: "room", room: roomUid } }));
  return done(withFac(s, nf), warn ? `${dog.name} placed in ${groupName(room.group)} — keep an eye on them ⚠️` : `${dog.name} joined ${groupName(room.group)}!`);
}

/** Boarders each get their own connected Boarding Bed. */
export function assignBed(s: TycoonState, dogId: string, bedUid: string): TResult {
  const f = fac(s);
  const dog = findDog(f, dogId);
  if (!dog) return gone;
  if (!dog.checkedIn) return { ok: false, error: `${dog.name} just arrived — check them in at the front desk first.` };
  if (!dog.boarding) return { ok: false, error: `${dog.name} is a daycare guest — boarding beds are for overnight boarders.` };
  const bed = f.items.find((i) => i.uid === bedUid && i.kind === "boarding_bed");
  if (!bed || !bed.room) return { ok: false, error: "That bed isn't built yet." };
  const why = notWorking(f, roomOf(f, bed.room)!);
  if (why) return { ok: false, error: why };
  if (bed.closed) return { ok: false, error: "That bed is closed." };
  const occ = f.dogs.find((d) => d.place.kind === "bed" && d.place.bed === bedUid);
  if (occ && occ.id === dogId) return { ok: false, error: `${dog.name} is already in that bed.` };
  if (occ) return { ok: false, error: `That bed is taken by ${occ.name}. Each boarder gets their own bed.` };
  const nf = setDog(f, dogId, (d) => ({ ...d, place: { kind: "bed", room: bed.room!, bed: bedUid } }));
  return done(withFac(s, nf), `${dog.name} settled into a boarding bed.`);
}

/** Moves one pup to calm down. Always works: no lobby, capacity or staff-energy requirement. Never pays coins. */
export function toCalm(s: TycoonState, dogId: string): TResult {
  const f = fac(s);
  const dog = findDog(f, dogId);
  if (!dog) return gone;
  if (dog.place.kind === "calm") return { ok: false, error: `${dog.name} is already calming down.` };
  const scuffled = inActiveScuffle(f, dog);
  const from = dog.place;
  let nf = setDog(f, dogId, (d) => ({ ...d, place: calmPlace(f), happiness: clamp(d.happiness - (scuffled ? 10 : 0)) }));
  if (from.kind === "room") {
    const room = roomOf(nf, from.room);
    if (room && !roomAtRisk(nf, room)) nf = { ...nf, scuffles: nf.scuffles.filter((x) => x.room !== from.room) };
  }
  return done(withFac(s, nf), scuffled ? `${dog.name} is calming down.` : `${dog.name} moved to calm down — nice prevention!`);
}

/** Staff step in: mismatched pups go to calm down. Works with the lobby closed or full and staff exhausted. */
export function separate(s: TycoonState, roomUid: string): TResult {
  const f = fac(s);
  const room = roomOf(f, roomUid);
  if (!room) return { ok: false, error: "That room is gone." };
  const scuffled = hasScuffle(f, roomUid);
  if (!scuffled && !roomAtRisk(f, room)) return { ok: false, error: "Everyone in this room is getting along." };
  const inRoom = roomDogs(f, roomUid);
  const movers = new Set(inRoom.filter((d) => groupOf(d) !== room.group).map((d) => d.id));
  const stay = new Set(inRoom.map((d) => d.id));
  const calm = calmPlace(f);
  const dogs = f.dogs.map((d) => {
    if (movers.has(d.id)) return { ...d, place: calm, happiness: clamp(d.happiness - (scuffled ? 10 : 0)) };
    if (stay.has(d.id) && scuffled) return { ...d, happiness: clamp(d.happiness - 5) };
    return d;
  });
  const nf = { ...f, dogs, scuffles: f.scuffles.filter((x) => x.room !== roomUid) };
  return done(withFac(s, nf), scuffled ? "Pups separated and calming down. Tip: match size + temperament to keep rooms safe." : "Moved the mismatched pup to calm down — nice prevention!");
}

// ---------- care ----------

export function playtime(s: TycoonState, dogId: string): TResult {
  const f = fac(s);
  const dog = findDog(f, dogId);
  if (!dog) return gone;
  if (dog.place.kind === "calm") return { ok: false, error: `${dog.name} is calming down — move them to a matching playroom first.` };
  if (inActiveScuffle(f, dog)) return { ok: false, error: `Separate the scuffle in ${dog.name}'s room first.` };
  if (dog.place.kind === "lobby") return { ok: false, error: `${dog.name} is still in the lobby — assign a playroom${dog.boarding ? " or boarding bed" : ""} first.` };
  const st = spendStaff(f, 10);
  if (!st) return tired;
  const fav = personalityOf(dog).favorite;
  const loves = fav === "fetch" || fav === "tug" || fav === "zoomies" || fav === "cuddles";
  const gain = (fav === "cuddles" ? 30 : loves ? 35 : 25) + playBonus(funAppeal(f).fun);
  let nf = setDog(st, dogId, (d) => ({ ...d, happiness: clamp(d.happiness + gain), clean: clamp(d.clean - 10), played: d.played + 1 }));
  nf = bump({ ...nf, cleanliness: clamp(nf.cleanliness - 4) }, "plays");
  return { ok: true, state: gainXp(withFac(s, nf), XP.playtime), msg: loves ? `${dog.name} loved it — ${FAVORITE_LABEL[fav]} is their favorite!` : `${dog.name} had a blast!` };
}

/** Why a bath or exit bath can't happen right now (null if it can). */
function bathBlock(f: Facility, which: "bath" | "exitBath"): string | null {
  if (!caps(f).bath) return "Build a Bath Room with a tub first.";
  if (refuses(which, f)) return `Too pricey — owners won't pay ${f.prices[which]} coins for ${which === "bath" ? "a bath" : "an exit bath"}.`;
  return null;
}

export function bath(s: TycoonState, dogId: string): TResult {
  const f = fac(s);
  const dog = findDog(f, dogId);
  if (!dog) return gone;
  if (!dog.checkedIn) return { ok: false, error: `Check ${dog.name} in first.` };
  if (dog.place.kind !== "room" && dog.place.kind !== "bed") return { ok: false, error: `Settle ${dog.name} into a playroom or boarding bed first.` };
  if (dog.bathed) return { ok: false, error: `${dog.name} already had a bath today.` };
  if (inActiveScuffle(f, dog)) return { ok: false, error: `Separate the scuffle in ${dog.name}'s room first.` };
  const why = bathBlock(f, "bath");
  if (why) return { ok: false, error: why };
  const st = spendStaff(f, 15);
  if (!st) return tired;
  const splashFan = personalityOf(dog).favorite === "splash";
  const extra = f.supplies === "premium" ? PREMIUM_HAPPY : 0;
  let nf = setDog(st, dogId, (d) => ({ ...d, clean: 100, happiness: clamp(d.happiness + (splashFan ? 15 : 5) + extra), bathed: true }));
  const pay = bathPay(f);
  nf = bump(bump(nf, "baths"), "earned", pay);
  const out = gainXp(earn(withFac(s, nf), { baths: pay }), XP.bath);
  return { ok: true, state: out, earned: pay, msg: splashFan ? `${dog.name} adores bath time — splashy and happy! 🫧` : `${dog.name} is squeaky clean!` };
}

export function clean(s: TycoonState): TResult {
  const f = fac(s);
  if (f.cleanliness >= 100) return { ok: false, error: "Already sparkling!" };
  const st = spendStaff(f, 10);
  if (!st) return tired;
  const nf = bump({ ...st, cleanliness: clamp(st.cleanliness + 35) }, "cleans");
  return { ok: true, state: gainXp(withFac(s, nf), XP.clean), msg: "Floors mopped!" };
}

/**
 * Checkout from a playroom or boarding bed pays the daycare price by happiness (plus tip, boarding and exit bath) and
 * builds friendship. From the lobby or calm-down room the pup goes home free of charge, so dog spots stay what earns.
 */
export function checkout(s: TycoonState, dogId: string, exitBath: boolean): TResult {
  const f = fac(s);
  const dog = findDog(f, dogId);
  if (!dog) return gone;
  if (!dog.checkedIn) return { ok: false, error: `${dog.name} hasn't been checked in yet.` };
  if (inActiveScuffle(f, dog)) return { ok: false, error: `Separate the scuffle in ${dog.name}'s room first.` };
  if (dog.place.kind === "lobby" || dog.place.kind === "calm") {
    // No playroom or bed today: the owner takes the pup home at no charge. No pay, no XP, no penalty.
    const nf = { ...f, dogs: f.dogs.filter((d) => d.id !== dogId) };
    return done(withFac(s, nf), `${dog.name} went home — no charge, since they didn't get a playroom${dog.boarding ? " or bed" : ""} today.`);
  }
  let st: Facility = f;
  if (exitBath) {
    const why = bathBlock(f, "exitBath");
    if (why) return { ok: false, error: why };
    const used = spendStaff(f, 15);
    if (!used) return tired;
    st = bump(used, "baths");
  }
  const pay = checkoutPay(f, dog, exitBath);
  // Guest book: happy, well-cared-for visits build friendship. Milestones pay a one-time bonus.
  const prev = f.guestBook.find((g) => g.name === dog.name && g.breed === dog.breed) ?? null;
  const gain = Math.round(dog.happiness / 10) + (dog.bathed || exitBath ? 2 : 0) + (dog.played > 0 ? 2 : 0);
  const friendship = Math.min(100, (prev?.friendship ?? 0) + gain);
  const entry: Regular = { name: dog.name, breed: dog.breed, size: dog.size, temper: dog.temper, visits: Math.max(dog.visits ?? 1, (prev?.visits ?? 0) + 1), friendship, lastDay: f.day };
  const guestBook = [entry, ...f.guestBook.filter((g) => !(g.name === dog.name && g.breed === dog.breed))].slice(0, GUESTBOOK_MAX);
  const before = friendshipLevel(prev?.friendship ?? 0);
  const after = friendshipLevel(friendship);
  const milestone = after.min > before.min ? after : null;
  const bonus = milestone?.bonus ?? 0;
  st = bump(bump({ ...st, dogs: st.dogs.filter((d) => d.id !== dogId), guestBook }, "checkouts"), "earned", pay.total + bonus);
  let out = earn(countToday(withFac(s, st), "checkouts"), bonus ? { ...pay.parts, bonus: (pay.parts.bonus ?? 0) + bonus } : pay.parts);
  out = gainXp(out, XP.checkout + (dog.happiness >= 80 ? XP.happyCheckout : 0));
  const r = done(out, milestone ? `${dog.name} went home happy — you're now ${milestone.label}s! 💙 +${bonus} bonus` : `${dog.name} went home happy! +${pay.total}`);
  return r.ok ? { ...r, earned: pay.total + bonus + (r.earned ?? 0) } : r;
}

export function hireStaff(s: TycoonState): TResult {
  const f = fac(s);
  if (f.staff.length >= MAX_STAFF) return { ok: false, error: "Team is fully staffed." };
  const cost = hireCost(f.staff.length);
  const paid = spend(s, cost, "wages");
  if (!paid.ok) return paid;
  const name = STAFF_NAMES[f.staff.length] ?? "Pal";
  const pf = fac(paid.state);
  return { ok: true, state: withFac({ ...paid.state, seq: s.seq + 1 }, { ...pf, staff: [...pf.staff, { id: "s" + s.seq, name, energy: 100 }] }), msg: `${name} joined the team!` };
}

// ---------- time ----------

/**
 * Advances live time. Care runs whenever the game is on screen; the day clock and drop-offs run only while open.
 * `rand` drives arrivals and scuffles (inject for tests). Day-end expenses are charged by closeDay at 18:00.
 */
export function tick(s: TycoonState, seconds: number, rand: () => number = Math.random): TycoonState {
  if (!(seconds > 0)) return s;
  let f = fac(s);
  const { fun, appeal } = funAppeal(f);
  const staffBoost = caps(f).staffBoost;
  const dirtFactor = f.cleanliness < 40 ? 1.6 : 1;

  // Scuffles: only playrooms holding a mismatched pup can start one; they end once the mismatch leaves.
  let scuffles = [...f.scuffles];
  let started = 0;
  for (const room of f.rooms) {
    if (room.type !== "playroom" || !roomAtRisk(f, room) || scuffles.some((x) => x.room === room.uid)) continue;
    if (rand() < SCUFFLE_CHANCE_PER_SEC * seconds) {
      scuffles.push({ room: room.uid });
      started++;
    }
  }
  scuffles = scuffles.filter((x) => {
    const room = roomOf(f, x.room);
    return !!room && roomAtRisk(f, room);
  });
  const inScuffle = (d: TDog) => d.place.kind === "room" && scuffles.some((x) => x.room === (d.place as { room: string }).room);
  const decay = decayMultiplier(fun);
  const dogs = f.dogs.map((d) => ({
    ...d,
    happiness: clamp(d.happiness - (0.5 + (inScuffle(d) ? 1.5 : 0)) * seconds * decay * dirtFactor),
    clean: clamp(d.clean - 0.25 * seconds),
  }));
  const generous = f.wage === "generous" ? 0.01 * GAME_MIN_PER_SEC * seconds : 0;
  const reputation = Math.max(REP_MIN, Math.min(100, f.reputation - scuffles.length * 0.3 * seconds + (scuffles.length ? 0 : 0.02 * seconds) + generous));
  const regen = 2 * wageRecovery(f.wage) * (1 + staffBoost) * seconds;
  f = {
    ...f,
    dogs,
    scuffles,
    reputation,
    cleanliness: clamp(f.cleanliness - 0.08 * f.dogs.length * seconds),
    staff: f.staff.map((st) => ({ ...st, energy: clamp(st.energy + regen) })),
    stats: started ? { ...f.stats, scuffles: (f.stats.scuffles ?? 0) + started } : f.stats,
  };
  let out = withFac(s, f);
  if (!f.open) return out;

  // The clock and drop-offs. Fractional seconds accumulate; arrivals roll once per whole game minute crossed.
  const baseChance = () => {
    const g = fac(out);
    return ARRIVAL_CHANCE_PER_MIN * (g.reputation / 80) * arrivalMultiplier(appeal) * demand(g) * campaignBoost(g);
  };
  const boarderChance = () => {
    const g = fac(out);
    return 0.25 * Math.min(1.6, Math.pow(fairPrice("boarding", g.reputation, appeal) / Math.max(1, g.prices.boarding), 1.5));
  };
  let chance = baseChance();
  let remaining = seconds * GAME_MIN_PER_SEC;
  while (remaining > 1e-9) {
    const g = fac(out);
    const toNext = Math.floor(g.clockMin + 1e-9) + 1 - g.clockMin;
    const step = Math.min(remaining, toNext);
    remaining -= step;
    let clock = g.clockMin + step;
    const whole = Math.abs(clock - Math.round(clock)) < 1e-9;
    if (whole) clock = Math.round(clock);
    if (clock >= DAY_CLOSE) {
      out = closeDay(withFac(out, { ...g, clockMin: DAY_CLOSE }));
      const h = fac(out);
      out = withFac(out, { ...h, clockMin: DAY_OPEN, rush: { day: h.day, peak: 0, since: null, awarded: false } });
      chance = baseChance();
      continue;
    }
    out = withFac(out, { ...g, clockMin: clock });
    if (!whole || !lobbyStatus(clock).open) continue;
    if (rand() < chance) {
      const c = caps(fac(out));
      const freeBeds = c.beds.length - fac(out).dogs.filter((d) => d.boarding).length;
      const boarding = freeBeds > 0 && rand() < boarderChance();
      const r = createArrival(out, rand, boarding);
      if (r.ok) out = r.state; // lobby full → the customer politely rebooks, no penalty
    }
  }
  return out;
}

/** Returning after time away: no decay, no expenses, staff fully rested, a small capped welcome bonus. */
export function welcomeBack(s: TycoonState, now: number): { state: TycoonState; bonus: number } {
  const away = Math.max(0, (now - s.lastSeen) / 1000);
  const bonus = away > 300 ? Math.min(MAX_OFFLINE_REWARD, Math.floor(away / 60) * 2) : 0;
  const f = fac(s);
  const rested = withFac({ ...s, lastSeen: now }, { ...f, staff: f.staff.map((st) => ({ ...st, energy: 100 })) });
  return { state: bonus ? earn(rested, { bonus }) : rested, bonus };
}
