// PAWtastic Daycare Tycoon — the daily care loop in player-built rooms, ported from src/game/engine.ts (spec §4.5).
// Same decay and gain numbers as today's game. Playtime pays no coins: it raises happiness, which raises checkout pay.
import { openMoments } from "./moments";
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
  mulberry,
  seedFrom,
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
import { arrivalMultiplier, decayMultiplier, funAppeal, playGain } from "./effects";
import { XP, gainXp } from "./progress";
import { fac, withFac } from "./state";
import { tourHolds } from "./tour";
import { LAST_DROPOFF, fmtTime, logVisit, newVisit, visitOf } from "./visit";
import { assessVisit } from "./assess";
import { runStaff, supervised } from "./team";
import { DESK_GIVES_UP } from "./waiting";
import { BATH_MIN, bathQueue, freeTub, roomCleanOf, roomOfDog, setRoomClean } from "./rooms";
import { adjustRep, referralBoost, repDeltaFor, reviewFactor, reviewFor } from "./reputation";
import type { Facility, Mood, Outcome, Room, TDog, TPlace, TRegular, TResult, TycoonState } from "./types";

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
  // the first day the daycare opens is its introductory day (families who wait too long are kindly rescheduled)
  const introDay = open && (f.introDay === null || f.introDay === undefined) ? f.day : f.introDay;
  return { ok: true, state: withFac(s, { ...f, open, ...(introDay !== undefined ? { introDay } : {}) }), msg: open ? "We're open! Customers will start dropping pups off." : "Closed — no new drop-offs, and the day clock pauses." };
}

// ---------- arrivals and check-in ----------

/** A customer drops a pup off in the lobby. No coins yet; staff must check them in. */
export function createArrival(s: TycoonState, rand: () => number, boarding = false): TResult {
  const f = fac(s);
  if (!f.open) return { ok: false, error: "Open the daycare first." };
  if (!lobbyStatus(f.clockMin).open) return { ok: false, error: "Lobby closed for the midday break — drop-offs resume at 14:00 (game clock)." };
  if (!boarding && f.clockMin >= LAST_DROPOFF) return { ok: false, error: "Daycare drop-offs end at 15:30 — boarders are still welcome." };
  const c = caps(f);
  if (!c.lobby) return { ok: false, error: "Build a working Lobby first." };
  if (lobbyDogs(f).length >= c.waiting) return { ok: false, error: "The lobby is full — move waiting pups to a playroom or bed first." };
  if (boarding && c.beds.length - f.dogs.filter((d) => d.boarding).length <= 0) return { ok: false, error: "No free boarding bed." };
  // regulars come back — not a family that left upset with nothing fixed (for 3 days); one owed a credit is likelier
  const away = f.guestBook.filter((g) => !f.dogs.some((d) => d.name === g.name && d.breed === g.breed) && !((g.lostUntil ?? 0) > f.day));
  const owed = away.filter((g) => (g.credit ?? 0) > 0);
  const regChance = owed.length ? Math.min(0.9, REGULAR_CHANCE * 1.5) : REGULAR_CHANCE;
  const pool = owed.length && rand() < 0.5 ? owed : away;
  const reg = away.length && rand() < regChance ? pool[Math.floor(rand() * pool.length)]! : null;
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
  dog.visit = newVisit(f, dog, rand, !!c.bath);
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
  const v = visitOf(f, dog);
  // A prepaid package is paid now, once (pickup never charges it again; a refund is a remedy if it isn't done).
  const prepaidBath = v.prepaid.includes("bath") ? bathPay(f) : 0;
  const waitedLobby = v.arrivedDay === f.day ? Math.max(0, Math.floor(f.clockMin - v.arrived)) : v.waitedLobby;
  const visit = logVisit({ ...v, checkedInAt: Math.floor(f.clockMin), paid: v.paid + prepaidBath, waitedLobby }, `Checked in ${fmtTime(f.clockMin)}${prepaidBath ? ` — bath prepaid (${prepaidBath})` : ""}`);
  let nf = setDog(f, dogId, (d) => ({ ...d, checkedIn: true, happiness: clamp(d.happiness + extra), visit }));
  nf = bump(bump(nf, "admitted"), "boarders", dog.boarding ? 1 : 0);
  let st = gainXp(countToday(withFac(s, nf), "checkIns"), XP.checkIn);
  if (prepaidBath) st = earn(st, { baths: prepaidBath });
  return { ok: true, state: st, msg: `${dog.name} is checked in!${prepaidBath ? ` ${v.owner} prepaid the bath (+${prepaidBath}).` : ""}`, ...(prepaidBath ? { earned: prepaidBath } : {}) };
}

/**
 * Politely turning a pup away before check-in (no room for their group, lobby crowded): the family takes them home,
 * no charge, nothing held against the daycare. Once checked in, the visit is a promise — use checkout.
 */
export function turnAway(s: TycoonState, dogId: string): TResult {
  const f = fac(s);
  const dog = findDog(f, dogId);
  if (!dog) return gone;
  if (dog.checkedIn) return { ok: false, error: `${dog.name} is already checked in — check them out instead.` };
  const v = visitOf(f, dog);
  return { ok: true, state: withFac(s, { ...f, dogs: f.dogs.filter((d) => d.id !== dogId) }), msg: `${v.owner} took ${dog.name} home — we couldn't take them today. No charge.` };
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
  let nf = setDog(f, dogId, (d) => ({ ...d, place: calmPlace(f), happiness: clamp(d.happiness - (scuffled ? 10 : 0)), visit: logVisit({ ...visitOf(f, d), safeMove: true }, `Calm-down room ${fmtTime(f.clockMin)}`) }));
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
    if (movers.has(d.id)) return { ...d, place: calm, happiness: clamp(d.happiness - (scuffled ? 10 : 0)), visit: logVisit({ ...visitOf(f, d), safeMove: true }, `Separated to calm down ${fmtTime(f.clockMin)}`) };
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
  if (dog.bathing) return { ok: false, error: `${dog.name} is in the bath — playtime after.` };
  const st = spendStaff(f, 10);
  if (!st) return tired;
  const fav = personalityOf(dog).favorite;
  const loves = fav === "fetch" || fav === "tug" || fav === "zoomies" || fav === "cuddles";
  const { f: nf, g } = applyPlay(st, dogId);
  // Credit the top item with its own share only (what its card promised); with no item, the daycare's general fun.
  const helped = g.topItem && g.topShare > 0 ? ` (+${g.topShare} from your ${g.topItem})` : g.fromFun > 0 ? ` (+${g.fromFun} from your daycare's fun)` : "";
  const said = loves ? `${dog.name} loved it — ${FAVORITE_LABEL[fav]} is their favorite!` : `${dog.name} had a blast!`;
  return { ok: true, state: gainXp(withFac(s, nf), XP.playtime), msg: said + helped };
}

/** The play itself (a tap or an attendant): happiness from the daycare's fun and toys, a little dirt, one more play. */
export function applyPlay(f: Facility, dogId: string): { f: Facility; g: ReturnType<typeof playGain> } {
  const dog = findDog(f, dogId)!;
  const g = playGain(f, dog);
  const nf = setDog(f, dogId, (d) => ({ ...d, happiness: clamp(d.happiness + g.total), clean: clamp(d.clean - 10), played: d.played + 1 }));
  const playRoom = roomOfDog(nf, dog);
  return { f: bump(setRoomClean(nf, (v, r) => (r.uid === playRoom ? v - 4 : v)), "plays"), g };
}

/** Why a bath or exit bath can't happen right now (null if it can). */
export function bathBlock(f: Facility, which: "bath" | "exitBath"): string | null {
  if (!caps(f).bath) return "Build a Bath Room with a tub first.";
  if (refuses(which, f)) return `Too pricey — owners won't pay ${f.prices[which]} coins for ${which === "bath" ? "a bath" : "an exit bath"}.`;
  return null;
}

export { BATH_MIN } from "./rooms";

/** Starts a bath: staff time now, the pup comes out clean after BATH_MIN game minutes. Never paid here. */
export function bath(s: TycoonState, dogId: string): TResult {
  const f = fac(s);
  const dog = findDog(f, dogId);
  if (!dog) return gone;
  if (!dog.checkedIn) return { ok: false, error: `Check ${dog.name} in first.` };
  if (dog.place.kind !== "room" && dog.place.kind !== "bed") return { ok: false, error: `Settle ${dog.name} into a playroom or boarding bed first.` };
  if (dog.bathing) return { ok: false, error: `${dog.name} is already in the bath.` };
  if (dog.bathed) return { ok: false, error: `${dog.name} already had a bath today.` };
  if (inActiveScuffle(f, dog)) return { ok: false, error: `Separate the scuffle in ${dog.name}'s room first.` };
  const why = bathBlock(f, "bath");
  if (why) return { ok: false, error: why };
  const tub = freeTub(f);
  if (!tub) {
    const next = bathQueue(f).find((d) => d.id !== dogId);
    return { ok: false, error: `Every bath station is busy${next ? ` — ${next.name} is next in the queue` : ""}. A tub frees up when its bath is done.` };
  }
  const st = spendStaff(f, 15);
  if (!st) return tired;
  return { ok: true, state: gainXp(withFac(s, startBath(st, dogId, tub)), XP.bath), msg: `${dog.name} is in the bath — ready in about ${BATH_MIN} minutes (game time).` };
}

/** The bath itself: the pup stands in `tub` for BATH_MIN game minutes. Never paid here (the receipt charges it). */
export function startBath(f: Facility, dogId: string, tub: string): Facility {
  return setDog(f, dogId, (d) => ({ ...d, bathing: BATH_MIN, bathTub: tub, visit: logVisit(visitOf(f, d), `Bath started ${fmtTime(f.clockMin)}`) }));
}

/** Baths running for `gameMin` more minutes; a finished one leaves the pup clean, happier and counted (not paid). */
function runBaths(s: TycoonState, f: Facility, gameMin: number): Facility {
  if (!f.dogs.some((d) => d.bathing)) return f;
  let baths = 0;
  const dogs = f.dogs.map((d) => {
    if (!d.bathing) return d;
    const left = d.bathing - gameMin;
    if (left > 0) return { ...d, bathing: left };
    baths++;
    const splashFan = personalityOf(d).favorite === "splash";
    const extra = f.supplies === "premium" ? PREMIUM_HAPPY : 0;
    return { ...d, bathing: null, bathTub: null, bathed: true, clean: 100, happiness: clamp(d.happiness + (splashFan ? 15 : 5) + extra), visit: logVisit(visitOf(f, d), `Bath finished ${fmtTime(f.clockMin)}`) };
  });
  return baths ? { ...f, dogs, stats: { ...f.stats, baths: f.stats.baths + baths } } : { ...f, dogs };
}

export function clean(s: TycoonState): TResult {
  const f = fac(s);
  if (f.rooms.every((r) => roomCleanOf(f, r.uid) >= 100)) return { ok: false, error: "Already sparkling!" };
  const st = spendStaff(f, 10);
  if (!st) return tired;
  const nf = bump(setRoomClean(st, (v) => v + 35), "cleans");
  return { ok: true, state: gainXp(withFac(s, nf), XP.clean), msg: "Floors mopped!" };
}

export const OWNER_GIVES_UP = 60; // game minutes an owner waits at pickup before taking the pup home
export const CREDIT_SHARE = 0.5; // a future credit is worth half a daycare day

const MOOD_LINE: Record<Mood, (owner: string, dog: string, why: string) => string> = {
  delighted: (o, d) => `${o} is delighted — ${d} had a great day!`,
  content: (o, d) => `${o} picked up ${d} — a good day.`,
  disappointed: (o, d, why) => `${o} is disappointed: ${why}`,
  upset: (o, d, why) => `${o} is upset: ${why}`,
};

/**
 * The end of a visit, exactly once: the itemized bill from assessVisit (with the player's remedies), the family's
 * reaction, loyalty and the record of how it went. `how`: the player checked them out, the owner gave up waiting,
 * the day ended, or a service was finished while they waited. A pup already gone can't be settled again.
 */
export function settle(s: TycoonState, dogId: string, how: Outcome["how"], exitBath = false): TResult {
  const f = fac(s);
  const dog = findDog(f, dogId);
  if (!dog) return { ok: false, error: "That pup already went home — the bill was settled." };
  const v = visitOf(f, dog);
  if (how === "checkout") {
    if (!dog.checkedIn) return { ok: false, error: `${dog.name} hasn't been checked in yet — turn them away politely instead.` };
    if (v.finishing) return { ok: false, error: `${v.owner} is waiting while ${dog.name} finishes the bath.` };
    if (inActiveScuffle(f, dog)) return { ok: false, error: `Separate the scuffle in ${dog.name}'s room first.` };
  }
  let st: Facility = f;
  const doExit = exitBath && how === "checkout" && (dog.place.kind === "room" || dog.place.kind === "bed");
  if (doExit) {
    const why = bathBlock(f, "exitBath");
    if (why) return { ok: false, error: why };
    const used = spendStaff(f, 15);
    if (!used) return tired;
    st = bump(used, "baths");
  }
  const prev = st.guestBook.find((g) => g.name === dog.name && g.breed === dog.breed) ?? null;
  // collected without the player (gave up, closing time, a finish that ran out): a prepaid bath not done is refunded
  const autoRefund = how !== "checkout" && v.prepaid.includes("bath") && !dog.bathed && !v.remedies.billing;
  const billed = autoRefund ? { ...dog, visit: { ...v, remedies: { ...v.remedies, billing: "refund" as const } } } : dog;
  const a = assessVisit(st, billed, { exitBath: doExit, credit: prev?.credit ?? 0 });
  const unresolved = a.complaints.filter((c) => !c.resolved);

  // loyalty: friendship grows with how the visit felt; a credit is owed; an upset family with nothing fixed stays away
  let guestBook = st.guestBook;
  let bonus = 0;
  let milestone: ReturnType<typeof friendshipLevel> | null = null;
  const servedVisit = dog.checkedIn && a.lines.some((l) => l.key === "daycare");
  if (dog.checkedIn) {
    const gain = servedVisit ? Math.round(a.satisfaction / 10) + (dog.bathed || doExit ? 2 : 0) + (dog.played > 0 ? 2 : 0) : 0;
    const friendship = Math.min(100, (prev?.friendship ?? 0) + gain);
    const credit = v.remedies && Object.values(v.remedies).includes("credit") ? Math.round(f.prices.daycare * CREDIT_SHARE) : 0;
    const entry: TRegular = {
      name: dog.name,
      breed: dog.breed,
      size: dog.size,
      temper: dog.temper,
      visits: Math.max(dog.visits ?? 1, (prev?.visits ?? 0) + 1),
      friendship,
      lastDay: f.day,
      sat: a.satisfaction,
      ...(credit ? { credit } : {}),
      ...(a.mood === "upset" && unresolved.length ? { lostUntil: f.day + 3 } : {}),
    };
    guestBook = [entry, ...st.guestBook.filter((g) => !(g.name === dog.name && g.breed === dog.breed))].slice(0, GUESTBOOK_MAX);
    const before = friendshipLevel(prev?.friendship ?? 0);
    const after = friendshipLevel(friendship);
    milestone = after.min > before.min ? after : null;
    bonus = milestone?.bonus ?? 0;
  }
  // reputation follows how the family felt (and whether their problem was put right), with the reason recorded
  const firstIssue = unresolved[0]?.text ?? a.complaints[0]?.text ?? "";
  const reason = unresolved.length
    ? `${v.owner} was ${a.mood}: ${firstIssue.replace(/\.$/, "")} (not put right)`
    : a.mood === "delighted" ? `${v.owner} was delighted with ${dog.name}'s day`
    : a.mood === "content" ? `${v.owner} was happy with ${dog.name}'s day`
    : `${v.owner} was ${a.mood}${firstIssue ? `: ${firstIssue.replace(/\.$/, "")}` : ""}`;
  const repBefore = st.reputation;
  st = adjustRep(st, repDeltaFor(a.satisfaction) - (unresolved.length ? 1 : 0), reason);
  const fixed = a.complaints.some((c) => c.remedy === "finish" || c.remedy === "refund");
  const review = reviewFor(st, { name: dog.name, owner: v.owner }, a.satisfaction, fixed, mulberry(seedFrom(`${dog.id}|${f.day}|${Math.floor(f.clockMin)}|review`)));
  if (review) st = { ...st, reviews: [...(st.reviews ?? []), review].slice(-30), ...(review.stars === 5 ? { referralUntil: f.day } : {}) };
  const outcome: Outcome = {
    dog: dog.name,
    owner: v.owner,
    day: f.day,
    min: Math.floor(f.clockMin),
    how,
    mood: a.mood,
    satisfaction: a.satisfaction,
    total: a.total,
    lines: a.lines.map((l) => ({ label: l.label, amount: l.amount })),
    complaints: a.complaints.map((c) => ({ kind: c.kind, text: c.text, remedy: c.remedy, resolved: c.resolved })),
    repDelta: Math.round((st.reputation - repBefore) * 10) / 10,
    review,
  };
  // a served visit (a playroom or bed) counts as a checkout and earns XP; a pup sent home unserved doesn't
  const served = dog.checkedIn && a.lines.some((l) => l.key === "daycare");
  st = { ...st, dogs: st.dogs.filter((d) => d.id !== dogId), guestBook, outcomes: [...(st.outcomes ?? []), outcome].slice(-30) };
  if (served) st = bump(bump(st, "checkouts"), "earned", Math.max(0, a.total) + bonus);
  let out = withFac(s, st);
  if (served) out = countToday(out, "checkouts");
  const parts = bonus ? { ...a.parts, bonus: (a.parts.bonus ?? 0) + bonus } : a.parts;
  out = earn(out, parts);
  if (a.total < 0) out = payRefund(out, -a.total);
  if (served) out = gainXp(out, XP.checkout + (a.mood === "delighted" ? XP.happyCheckout : 0));
  const why = unresolved[0]?.text ?? a.complaints[0]?.text ?? "it wasn't the day they hoped for.";
  const said = MOOD_LINE[a.mood](v.owner, dog.name, why);
  const paid = a.total > 0 ? ` Paid ${a.total}.` : a.total === 0 ? " There's no charge." : ` Refunded ${-a.total}.`;
  const r = done(out, milestone ? `${said}${paid} You're now ${milestone.label}s! 💙 +${bonus} bonus` : `${said}${paid}`);
  return r.ok ? { ...r, earned: Math.max(0, a.total) + bonus + (r.earned ?? 0) } : r;
}

const MOOD_FACE: Record<Mood, string> = { delighted: "😊", content: "🙂", disappointed: "😕", upset: "😠" };
/** What the family said at pickup, for the receipt and toasts. */
export function outcomeLine(o: Outcome): string {
  const why = o.complaints.find((c) => !c.resolved)?.text ?? o.complaints[0]?.text ?? "it wasn't the day they hoped for.";
  const left = o.how === "left" ? " (they gave up waiting and took them home)" : o.how === "dayend" ? " (collected at closing)" : "";
  return `${MOOD_FACE[o.mood]} ${MOOD_LINE[o.mood](o.owner, o.dog, why)}${left}`;
}

/** A refund larger than the day's bill: paid back to the family (it can take coins below zero, like any bill). */
function payRefund(s: TycoonState, amount: number): TycoonState {
  const f = fac(s);
  const ledger = f.ledger.length ? f.ledger.map((d, i) => (i === f.ledger.length - 1 ? { ...d, expenses: { ...d.expenses, refunds: d.expenses.refunds + amount } } : d)) : f.ledger;
  return withFac({ ...s, coins: s.coins - amount }, { ...f, ledger });
}

/** The player checks a pup out at the desk (see settle). */
export function checkout(s: TycoonState, dogId: string, exitBath: boolean): TResult {
  return settle(s, dogId, "checkout", exitBath);
}

/**
 * Owners come back at pickup time (and wait), give up after OWNER_GIVES_UP minutes, and a pup whose bath the owner
 * waited for goes home as soon as it's done. Called every game minute while open.
 */
function pickups(s: TycoonState): TycoonState {
  let out = s;
  const f = fac(s);
  for (const d of f.dogs) {
    const v = visitOf(f, d);
    const g = fac(out);
    if (!d.checkedIn && d.place.kind === "lobby" && v.arrivedDay === g.day && g.clockMin - v.arrived >= DESK_GIVES_UP) {
      // ignored at the desk for an hour: on the introductory day they're kindly rescheduled (a lesson, not a penalty);
      // after it, they take their pup home upset
      if (g.introDay === g.day) out = courtesy(out, d.id, "intro");
      else {
        const r = settle(out, d.id, "left");
        if (r.ok) out = r.state;
      }
      continue;
    }
    if (v.finishing && d.bathed) {
      const r = settle(out, d.id, "finished");
      if (r.ok) out = r.state;
      continue;
    }
    const due = v.pickupDay < g.day || (v.pickupDay === g.day && g.clockMin >= v.pickup);
    if (!due || v.finishing) continue;
    if (v.ownerHere === null) {
      out = withFac(out, { ...g, dogs: g.dogs.map((x) => (x.id === d.id ? { ...x, visit: logVisit({ ...v, ownerHere: Math.floor(g.clockMin) }, `${v.owner} arrived for pickup ${fmtTime(g.clockMin)}`) } : x)) });
    } else if (g.clockMin - v.ownerHere >= OWNER_GIVES_UP) {
      const r = settle(out, d.id, "left");
      if (r.ok) out = r.state;
    }
  }
  return out;
}

/** A family is kindly rescheduled: no visit judged, no charge, no reputation change — and a short notice for the player. */
function courtesy(s: TycoonState, dogId: string, why: "intro" | "closing"): TycoonState {
  const name = fac(s).dogs.find((d) => d.id === dogId)?.name;
  const r = turnAway(s, dogId);
  if (!r.ok || !name) return s;
  const f = fac(r.state);
  const prev = f.courtesy && f.courtesy.day === f.day && f.courtesy.why === why ? f.courtesy.names : [];
  return withFac(r.state, { ...f, courtesy: { day: f.day, min: Math.floor(f.clockMin), why, names: [...prev, name].slice(-10) } });
}

/**
 * 18:00: families still waiting at the desk (never checked in, boarders too) are kindly rescheduled, once; every
 * family that hasn't collected their daycare pup does now; checked-in boarders stay for their morning pickup.
 */
function dayEndPickups(s: TycoonState): TycoonState {
  let out = s;
  for (const d of fac(s).dogs) if (!d.checkedIn && d.place.kind === "lobby") out = courtesy(out, d.id, "closing");
  for (const d of fac(out).dogs) {
    if (d.boarding) continue;
    const r = settle(out, d.id, "dayend");
    if (r.ok) out = r.state;
  }
  return out;
}

export function hireStaff(s: TycoonState): TResult {
  const f = fac(s);
  if (f.staff.length >= MAX_STAFF) return { ok: false, error: "Team is fully staffed." };
  const cost = hireCost(f.staff.length);
  const paid = spend(s, cost, "wages");
  if (!paid.ok) return paid;
  // a name nobody on the team has (names are labels; ids identify people)
  const taken = new Set(f.staff.map((x) => x.name));
  const name = STAFF_NAMES.find((n) => !taken.has(n)) ?? [2, 3, 4, 5, 6, 7].map((k) => `${STAFF_NAMES[f.staff.length % STAFF_NAMES.length]} ${k}`).find((n) => !taken.has(n)) ?? `Pal ${s.seq}`;
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
  // A long step runs as one-second steps — exactly what play does (the store never steps more than a second) — so
  // warnings, staff work, billing and the day change can never be skipped by a big jump.
  if (seconds > 1) {
    let out = s;
    for (let left = seconds; left > 1e-9; left -= 1) out = tickStep(out, Math.min(1, left), rand);
    return out;
  }
  return tickStep(s, seconds, rand);
}

function tickStep(s: TycoonState, seconds: number, rand: () => number): TycoonState {
  let f = fac(s);
  // The first day the daycare is open (however it was opened — the Open switch, Quick start, an old save) is its
  // introductory day.
  if (f.open && (f.introDay === null || f.introDay === undefined)) {
    f = { ...f, introDay: f.day };
    s = withFac(s, f);
  }
  if (tourHolds(s)) {
    // The guided tour holds drop-offs, the day clock and care decay so a new player can learn at their own pace.
    const regen = 2 * wageRecovery(f.wage) * (1 + caps(f).staffBoost) * seconds;
    return withFac(s, runBaths(s, { ...f, staff: f.staff.map((st) => ({ ...st, energy: clamp(st.energy + regen) })) }, seconds * GAME_MIN_PER_SEC));
  }
  const { fun, appeal } = funAppeal(f);
  const staffBoost = caps(f).staffBoost;
  const dirtFactor = (d: TDog) => (roomCleanOf(f, roomOfDog(f, d)) < 40 ? 1.6 : 1);

  // Scuffles: only playrooms holding a mismatched pup can start one; they end once the mismatch leaves.
  let scuffles = [...f.scuffles];
  let started = 0;
  const startedIn: Room[] = [];
  for (const room of f.rooms) {
    if (room.type !== "playroom" || !roomAtRisk(f, room) || scuffles.some((x) => x.room === room.uid)) continue;
    if (rand() < SCUFFLE_CHANCE_PER_SEC * seconds * (supervised(f, room.uid) ? 0.5 : 1)) {
      scuffles.push({ room: room.uid });
      startedIn.push(room);
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
    happiness: clamp(d.happiness - (0.5 + (inScuffle(d) ? 1.5 : 0)) * seconds * decay * dirtFactor(d)),
    clean: clamp(d.clean - 0.25 * seconds),
  }));
  // Reputation no longer drifts with time: a scuffle costs −3 when it starts (recorded), visits do the rest.
  const regen = 2 * wageRecovery(f.wage) * (1 + staffBoost) * seconds;
  f = {
    ...setRoomClean(f, (v, r) => v - 0.08 * f.dogs.filter((d) => roomOfDog(f, d) === r.uid).length * seconds),
    dogs,
    scuffles,
    staff: f.staff.map((st) => ({ ...st, energy: clamp(st.energy + regen) })),
    stats: started ? { ...f.stats, scuffles: (f.stats.scuffles ?? 0) + started } : f.stats,
  };
  for (const room of startedIn) {
    const who = new Set(f.dogs.filter((d) => d.place.kind === "room" && d.place.room === room.uid).map((d) => d.id));
    f = { ...f, dogs: f.dogs.map((d) => (who.has(d.id) ? { ...d, visit: logVisit({ ...visitOf(f, d), scuffle: true }, `Scuffle ${fmtTime(f.clockMin)}`) } : d)) };
    f = adjustRep(f, -3, `A scuffle in the ${room.group ? groupName(room.group) + " " : ""}playroom — match size and temperament to keep rooms safe`);
  }
  f = runBaths(s, f, seconds * GAME_MIN_PER_SEC);
  let out = withFac(s, f);
  // a bath the owner waited for is done: they go home now (open or not)
  for (const d of f.dogs) if (d.visit?.finishing && d.bathed) {
    const r = settle(out, d.id, "finished");
    if (r.ok) out = r.state;
  }
  f = fac(out);
  if (!f.open) return runStaff(out, seconds * GAME_MIN_PER_SEC);

  // The clock and drop-offs. Fractional seconds accumulate; arrivals roll once per whole game minute crossed.
  const baseChance = () => {
    const g = fac(out);
    return ARRIVAL_CHANCE_PER_MIN * (g.reputation / 80) * arrivalMultiplier(appeal) * demand(g) * campaignBoost(g) * reviewFactor(g) * referralBoost(g);
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
      // staff work up to closing first, then the day ends
      out = closeDay(dayEndPickups(runStaff(withFac(out, { ...g, clockMin: DAY_CLOSE }), step)));
      const h = fac(out);
      out = withFac(out, { ...h, clockMin: DAY_OPEN, rush: { day: h.day, peak: 0, since: null, awarded: false } });
      chance = baseChance();
      continue;
    }
    out = withFac(out, { ...g, clockMin: clock });
    // staff work through this stretch of time before the minute's deadlines are checked (same result at any step size)
    out = runStaff(out, step);
    if (whole) out = openMoments(pickups(out));
    if (!whole || !lobbyStatus(clock).open) continue;
    if (rand() < chance) {
      const c = caps(fac(out));
      const freeBeds = c.beds.length - fac(out).dogs.filter((d) => d.boarding).length;
      const boarding = freeBeds > 0 && rand() < boarderChance();
      const r = createArrival(out, rand, boarding);
      if (r.ok) {
        // families book what you offer: a pup with no playroom of its kind doesn't drop off — it's counted as asking
        const pup = fac(r.state).dogs.at(-1)!;
        const g = groupOf(pup);
        const h = fac(out);
        // (a playroom of that kind that's closed still counts: they come and wait, and the blockers say to reopen it)
        if (!pup.boarding && !h.rooms.some((x) => x.type === "playroom" && x.group === g)) {
          const asked = h.asked && h.asked.day === h.day ? h.asked.groups : {};
          out = withFac(out, { ...h, asked: { day: h.day, groups: { ...asked, [g]: (asked[g] ?? 0) + 1 } } });
        } else out = r.state;
      } // lobby full → the customer politely rebooks, no penalty
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
