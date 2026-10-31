// Pure game rules for PAWtastic Tycoon. No browser APIs here so it can be tested.

export const SAVE_VERSION = 4;

// ---------- Game clock (game-only schedule; not real PAWtastic hours) ----------
export const GAME_MIN_PER_SEC = 2; // 1 real second = 2 game minutes
export const DAY_OPEN = 7 * 60; // 7:00
export const DAY_CLOSE = 18 * 60; // 18:00 -> next game day
export const BREAK_START = 12 * 60; // lobby closed 12:00–14:00
export const BREAK_END = 14 * 60;
export const ARRIVAL_CHANCE_PER_MIN = 0.04;
export const SCUFFLE_CHANCE_PER_SEC = 0.03;
export const REP_MIN = 40;

export type LobbyStatus = { open: boolean; label: string; minutesToChange: number };
export function lobbyStatus(min: number): LobbyStatus {
  if (min < BREAK_START) return { open: true, label: "Lobby OPEN", minutesToChange: BREAK_START - min };
  if (min < BREAK_END) return { open: false, label: "Lobby CLOSED · midday break 12:00–14:00", minutesToChange: BREAK_END - min };
  return { open: true, label: "Lobby OPEN", minutesToChange: DAY_CLOSE - min };
}
export const fmtClock = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(Math.floor(min) % 60).padStart(2, "0")}`;
export const fmtDur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${Math.floor(m % 60)}m` : `${Math.ceil(m)}m`);

export const START_COINS = 500;
export const LOBBY_CAP = 4; // waiting spots per site
export const BASE_ROOM_CAP = 2; // per playroom
export const SUITES_PER_SITE = 3;

// ---------- Operating layout: lobby -> playrooms by size + temperament; boarding = individual suites ----------
// Game abstraction only — not an actual floor plan or facility rule.
export type Size = "small" | "large";
export type Temper = "gentle" | "active";
export type SiteId = "hawthorne" | "hillsdale";
export type GroupId = `${Size}-${Temper}`;
export type Place = { kind: "lobby" } | { kind: "room"; group: GroupId } | { kind: "suite"; index: number } | { kind: "recovery" };

export const SITES: { id: SiteId; name: string }[] = [
  { id: "hawthorne", name: "Hawthorne" },
  { id: "hillsdale", name: "Hillsdale" },
];
export const GROUPS: { id: GroupId; size: Size; temper: Temper; name: string; emoji: string }[] = [
  { id: "small-gentle", size: "small", temper: "gentle", name: "Small & Gentle", emoji: "🧸" },
  { id: "small-active", size: "small", temper: "active", name: "Small & Active", emoji: "⚡" },
  { id: "large-gentle", size: "large", temper: "gentle", name: "Large & Gentle", emoji: "🌿" },
  { id: "large-active", size: "large", temper: "active", name: "Large & Active", emoji: "🏃" },
];
export const groupOf = (d: { size: Size; temper: Temper }): GroupId => `${d.size}-${d.temper}`;
export const groupName = (g: GroupId) => GROUPS.find((x) => x.id === g)!.name;
export const traitLabel = (d: { size: Size; temper: Temper }) => `${d.size === "small" ? "Small" : "Large"} · ${d.temper === "gentle" ? "Gentle" : "Active"}`;

export const MAX_OFFLINE_REWARD = 150;

export type Breed = { name: string; coat: string; ear: string; size: Size };
export const BREEDS: Breed[] = [
  { name: "Golden", size: "large", coat: "oklch(0.8 0.12 75)", ear: "oklch(0.68 0.13 60)" },
  { name: "Beagle", size: "small", coat: "oklch(0.88 0.04 70)", ear: "oklch(0.55 0.1 50)" },
  { name: "Lab", size: "large", coat: "oklch(0.3 0.02 50)", ear: "oklch(0.22 0.02 50)" },
  { name: "Husky", size: "large", coat: "oklch(0.85 0.01 250)", ear: "oklch(0.45 0.02 250)" },
  { name: "Corgi", size: "small", coat: "oklch(0.72 0.14 55)", ear: "oklch(0.62 0.15 45)" },
  { name: "Poodle", size: "small", coat: "oklch(0.96 0.01 80)", ear: "oklch(0.88 0.02 80)" },
];
const NAMES = ["Biscuit", "Luna", "Milo", "Pepper", "Bear", "Daisy", "Rocky", "Nala", "Ziggy", "Maple", "Otis", "Willow", "Scout", "Hazel", "Duke", "Pip"];

export type Dog = {
  id: string;
  name: string;
  breed: number;
  happiness: number; // 0..100
  clean: number; // 0..100
  boarding: boolean;
  played: number;
  bathed: boolean;
  x: number; // 0..1 position (cosmetic wander)
  y: number;
  size: Size;
  temper: Temper;
  site: SiteId;
  place: Place;
  /** false = customer just dropped off; staff must check in before rooms, play or baths. Admission fee is paid once at check-in. */
  checkedIn: boolean;
};

export type Staff = { id: string; name: string; energy: number };

export type Upgrade = { id: string; name: string; desc: string; cost: number; requires?: string };
export const UPGRADES: Upgrade[] = [
  { id: "yard1", name: "Bigger Play Yard", desc: "+1 spot in every playroom", cost: 300 },
  { id: "splash", name: "Splash Bath Station", desc: "Baths & exit baths earn +10", cost: 400 },
  { id: "yard2", name: "Indoor Agility Wing", desc: "+2 spots in every playroom", cost: 900, requires: "yard1" },
  { id: "boarding", name: "Boarding Suites", desc: "3 private boarding suites per location", cost: 800 },
  { id: "hillsdale", name: "Second Location: Hillsdale", desc: "A second lobby, 4 playrooms & suites · +25% revenue", cost: 2500, requires: "boarding" },
];

export type Decor = { id: string; name: string; cost: number; emoji: string };
export const DECOR: Decor[] = [
  { id: "plant", name: "Leafy Plant", cost: 60, emoji: "🪴" },
  { id: "balls", name: "Tennis Ball Bin", cost: 90, emoji: "🎾" },
  { id: "bone", name: "Giant Bone Couch", cost: 150, emoji: "🦴" },
  { id: "pool", name: "Splash Pool", cost: 220, emoji: "💦" },
];

export const STAFF_NAMES = ["Phil", "Maya", "Jordan", "Priya", "Sam", "Alex"];
export const MAX_STAFF = 6;
export function hireCost(count: number) {
  return 250 * count; // 2nd staff 250, 3rd 500, ...
}

export type Stats = { admitted: number; baths: number; plays: number; earned: number; checkouts: number; cleans: number; boarders: number; shares: number; runs: number };

export type GameState = {
  v: number;
  coins: number;
  dogs: Dog[];
  staff: Staff[];
  cleanliness: number;
  upgrades: string[];
  decor: string[];
  tutorial: number; // -1 = done
  stats: Stats;
  achievements: string[];
  missionDay: string;
  missionBase: Stats; // stats snapshot at start of mission day
  missionsClaimed: string[];
  recessBest: number;
  /** New York date of the last rewarded Recess Rush run, and coins earned from runs that day (daily cap). */
  recessDay: string;
  recessCoinsToday: number;
  cosmetics: string[]; // free earned cosmetics
  equipped: string | null;
  lastSeen: number;
  seq: number;
  site: SiteId; // location currently being viewed
  clockMin: number; // game minutes since midnight
  gameDay: number;
  reputation: number; // REP_MIN..100
  scuffles: { site: SiteId; group: GroupId }[];
};

export const emptyStats = (): Stats => ({ admitted: 0, baths: 0, plays: 0, earned: 0, checkouts: 0, cleans: 0, boarders: 0, shares: 0, runs: 0 });

export function newGame(now: number, day: string): GameState {
  return {
    v: SAVE_VERSION,
    coins: START_COINS,
    dogs: [],
    staff: [{ id: "s0", name: "Phil", energy: 100 }],
    cleanliness: 100,
    upgrades: [],
    decor: [],
    tutorial: 0,
    stats: emptyStats(),
    achievements: [],
    missionDay: day,
    missionBase: emptyStats(),
    missionsClaimed: [],
    recessBest: 0,
    recessDay: day,
    recessCoinsToday: 0,
    cosmetics: [],
    equipped: null,
    lastSeen: now,
    seq: 1,
    site: "hawthorne",
    clockMin: DAY_OPEN,
    gameDay: 1,
    reputation: 80,
    scuffles: [],
  };
}

export function sites(s: GameState): SiteId[] {
  return s.upgrades.includes("hillsdale") ? ["hawthorne", "hillsdale"] : ["hawthorne"];
}
export function roomCapacity(s: GameState) {
  return BASE_ROOM_CAP + (s.upgrades.includes("yard1") ? 1 : 0) + (s.upgrades.includes("yard2") ? 2 : 0);
}
export function suiteCount(s: GameState) {
  return s.upgrades.includes("boarding") ? SUITES_PER_SITE : 0;
}
/** Total playroom spots across unlocked locations. */
export function capacity(s: GameState) {
  return roomCapacity(s) * GROUPS.length * sites(s).length;
}
/** Staff-only calm-down space, separate from the public lobby: unlimited, always available, no staff energy needed. */
export const recoveryDogs = (s: GameState, site: SiteId) => s.dogs.filter((d) => d.site === site && d.place.kind === "recovery");
export const lobbyDogs = (s: GameState, site: SiteId) => s.dogs.filter((d) => d.site === site && d.place.kind === "lobby");
export const roomDogs = (s: GameState, site: SiteId, g: GroupId) => s.dogs.filter((d) => d.site === site && d.place.kind === "room" && d.place.group === g);
export const suiteDog = (s: GameState, site: SiteId, index: number) => s.dogs.find((d) => d.site === site && d.place.kind === "suite" && d.place.index === index);

/** Why a dog can't join a playroom, or null if it fits. */
export function roomBlockReason(s: GameState, dog: Dog, g: GroupId): string | null {
  const grp = GROUPS.find((x) => x.id === g)!;
  if (!dog.checkedIn) return `${dog.name} just arrived — check them in at the lobby desk first.`;
  if (dog.boarding) return `${dog.name} is an overnight guest — settle them into a boarding suite.`;
  if (dog.place.kind === "room" && dog.place.group === g) return `${dog.name} is already in this playroom.`;
  if (roomDogs(s, dog.site, g).length >= roomCapacity(s)) return `The ${grp.name} room is full (${roomCapacity(s)}/${roomCapacity(s)}). Check a pup out or expand playrooms.`;
  return mismatchWarning(dog, g);
}

/** Hard blocks only (boarder, same room, full). Mismatches are warnings the player may override. */
export function roomHardBlock(s: GameState, dog: Dog, g: GroupId): string | null {
  const grp = GROUPS.find((x) => x.id === g)!;
  if (!dog.checkedIn) return `${dog.name} just arrived — check them in at the lobby desk first.`;
  if (dog.boarding) return `${dog.name} is an overnight guest — settle them into a boarding suite.`;
  if (dog.place.kind === "room" && dog.place.group === g) return `${dog.name} is already in this playroom.`;
  if (roomDogs(s, dog.site, g).length >= roomCapacity(s)) return `The ${grp.name} room is full (${roomCapacity(s)}/${roomCapacity(s)}). Check a pup out or expand playrooms.`;
  return null;
}

export function mismatchWarning(dog: { name: string; size: Size; temper: Temper }, g: GroupId): string | null {
  const grp = GROUPS.find((x) => x.id === g)!;
  if (grp.size !== dog.size) return `${dog.name} is ${dog.size} — the ${grp.name} room is grouped for ${grp.size} pups.`;
  if (grp.temper !== dog.temper) return `${dog.name} plays ${dog.temper === "gentle" ? "gently" : "rough & fast"} — the ${grp.name} room suits ${grp.temper} players.`;
  return null;
}

function revenueMult(s: GameState) {
  return s.upgrades.includes("hillsdale") ? 1.25 : 1;
}

export type Result = { ok: true; state: GameState; msg?: string; earned?: number } | { ok: false; error: string };

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

function earn(s: GameState, base: number): [GameState, number] {
  const amt = Math.round(base * revenueMult(s));
  return [{ ...s, coins: s.coins + amt, stats: { ...s.stats, earned: s.stats.earned + amt } }, amt];
}

function pickStaff(s: GameState, cost: number): number {
  let best = -1;
  s.staff.forEach((st, i) => {
    if (st.energy >= cost && (best < 0 || st.energy > s.staff[best]!.energy)) best = i;
  });
  return best;
}

function useStaff(s: GameState, cost: number): GameState | null {
  const i = pickStaff(s, cost);
  if (i < 0) return null;
  return { ...s, staff: s.staff.map((st, j) => (j === i ? { ...st, energy: st.energy - cost } : st)) };
}

/** A customer drops a pup off in the lobby. No coins or stats yet — staff must check them in. */
export function createArrival(s: GameState, rand: () => number, boarding = false, site: SiteId = s.site): Result {
  if (!sites(s).includes(site)) return { ok: false, error: "That location isn't open yet." };
  if (!lobbyStatus(s.clockMin).open) return { ok: false, error: `Lobby closed for the midday break — drop-offs resume at 14:00 (game clock).` };
  if (lobbyDogs(s, site).length >= LOBBY_CAP) return { ok: false, error: "The lobby is full — move waiting pups to a playroom or suite first." };
  if (boarding && !s.upgrades.includes("boarding")) return { ok: false, error: "Unlock Boarding Suites first." };
  const breed = Math.floor(rand() * BREEDS.length);
  const dog: Dog = {
    id: "d" + s.seq,
    name: NAMES[Math.floor(rand() * NAMES.length)]!,
    breed,
    size: BREEDS[breed]!.size,
    temper: rand() < 0.5 ? "gentle" : "active",
    site,
    place: { kind: "lobby" },
    checkedIn: false,
    happiness: 60 + Math.floor(rand() * 20),
    clean: 55 + Math.floor(rand() * 30),
    boarding,
    played: 0,
    bathed: false,
    x: 0.2 + rand() * 0.6,
    y: 0.25 + rand() * 0.5,
  };
  return { ok: true, state: { ...s, seq: s.seq + 1, dogs: [...s.dogs, dog] }, msg: `${dog.name} was dropped off — check them in at the lobby desk.` };
}

/**
 * Staff check-in: credits the admission fee exactly once.
 * The 12:00–14:00 closure stops NEW customer drop-offs (createArrival/admitDog); pups already inside the
 * building can still be checked in, so nobody is left stuck at the desk through the break.
 */
export function checkIn(s: GameState, dogId: string): Result {
  const dog = s.dogs.find((d) => d.id === dogId);
  if (!dog) return { ok: false, error: "That pup already went home." };
  if (dog.checkedIn) return { ok: false, error: `${dog.name} is already checked in.` };
  const next = {
    ...s,
    dogs: s.dogs.map((d) => (d.id === dogId ? { ...d, checkedIn: true } : d)),
    stats: { ...s.stats, admitted: s.stats.admitted + 1, boarders: s.stats.boarders + (dog.boarding ? 1 : 0) },
  };
  const [st, amt] = earn(next, dog.boarding ? 40 : 20);
  return { ok: true, state: st, earned: amt, msg: `${dog.name} is checked in!` };
}

/** Walk-in: drop-off and immediate staff check-in. */
export function admitDog(s: GameState, rand: () => number, boarding = false, site: SiteId = s.site): Result {
  const r = createArrival(s, rand, boarding, site);
  if (!r.ok) return r;
  const id = "d" + s.seq;
  const c = checkIn(r.state, id);
  if (!c.ok) return c;
  const name = c.state.dogs.find((d) => d.id === id)!.name;
  return { ...c, msg: `${name} is checked in and waiting in the ${site === "hillsdale" ? "Hillsdale" : "Hawthorne"} lobby.` };
}

/** Mismatched placement needs explicit confirmation and adds scuffle risk to that room. */
export function assignRoom(s: GameState, dogId: string, g: GroupId, confirmMismatch = false): Result {
  const dog = s.dogs.find((d) => d.id === dogId);
  if (!dog) return { ok: false, error: "That pup already went home." };
  const hard = roomHardBlock(s, dog, g);
  if (hard) return { ok: false, error: hard };
  const warn = mismatchWarning(dog, g);
  if (warn && !confirmMismatch) return { ok: false, error: warn + " Confirm to place anyway (scuffle risk)." };
  return { ok: true, state: { ...s, dogs: s.dogs.map((d) => (d.id === dogId ? { ...d, place: { kind: "room", group: g } } : d)) }, msg: warn ? `${dog.name} placed in ${groupName(g)} — keep an eye on them ⚠️` : `${dog.name} joined ${groupName(g)}!` };
}

/** A room is at risk when it holds 2+ pups and at least one doesn't match its group. Matching rooms are safe. */
export function roomAtRisk(s: GameState, site: SiteId, g: GroupId) {
  const dogs = roomDogs(s, site, g);
  return dogs.length >= 2 && dogs.some((d) => groupOf(d) !== g);
}
export const hasScuffle = (s: GameState, site: SiteId, g: GroupId) => s.scuffles.some((x) => x.site === site && x.group === g);

/** Staff step in: mismatched pups go to the internal recovery space — works even if the lobby is closed/full, staff are tired, or other rooms are full. Never pays coins. */
export function separateDogs(s: GameState, site: SiteId, g: GroupId): Result {
  if (!hasScuffle(s, site, g) && !roomAtRisk(s, site, g)) return { ok: false, error: "Everyone in this room is getting along." };
  const movers = roomDogs(s, site, g).filter((d) => groupOf(d) !== g).map((d) => d.id);
  const inRoom = roomDogs(s, site, g).map((d) => d.id);
  const scuffled = hasScuffle(s, site, g);
  const dogs = s.dogs.map((d) => {
    if (movers.includes(d.id)) return { ...d, place: { kind: "recovery" } as Place, happiness: clamp(d.happiness - (scuffled ? 10 : 0)) };
    if (inRoom.includes(d.id) && scuffled) return { ...d, happiness: clamp(d.happiness - 5) };
    return d;
  });
  return {
    ok: true,
    state: { ...s, dogs, scuffles: s.scuffles.filter((x) => !(x.site === site && x.group === g)) },
    msg: scuffled ? "Pups separated and calming down. Tip: match size + temperament to keep rooms safe." : "Moved the mismatched pup to the recovery space — nice prevention!",
  };
}

/** Is this dog in a room with an unresolved scuffle? */
export const inActiveScuffle = (s: GameState, d: Dog) => d.place.kind === "room" && hasScuffle(s, d.site, d.place.group);

/** Move any single pup to the staff-only recovery space. Always succeeds (no lobby, capacity or staff-energy requirement). Never pays coins. */
export function separateDog(s: GameState, dogId: string): Result {
  const dog = s.dogs.find((d) => d.id === dogId);
  if (!dog) return { ok: false, error: "That pup already went home." };
  if (dog.place.kind === "recovery") return { ok: false, error: `${dog.name} is already in the recovery space.` };
  const scuffled = inActiveScuffle(s, dog);
  const from = dog.place;
  let out: GameState = { ...s, dogs: s.dogs.map((d) => (d.id === dogId ? { ...d, place: { kind: "recovery" } as Place, happiness: clamp(d.happiness - (scuffled ? 10 : 0)) } : d)) };
  if (from.kind === "room" && !roomAtRisk(out, dog.site, from.group)) out = { ...out, scuffles: out.scuffles.filter((x) => !(x.site === dog.site && x.group === from.group)) };
  return { ok: true, state: out, msg: scuffled ? `${dog.name} is calming down in recovery.` : `${dog.name} moved to the recovery space — nice prevention!` };
}

export function suiteBlockReason(s: GameState, dog: Dog, index: number): string | null {
  if (!dog.checkedIn) return `${dog.name} just arrived — check them in at the lobby desk first.`;
  if (!dog.boarding) return `${dog.name} is a daycare guest — suites are for overnight boarders.`;
  if (index < 0 || index >= suiteCount(s)) return "That suite isn't built yet.";
  const occ = suiteDog(s, dog.site, index);
  if (occ && occ.id !== dog.id) return `Suite ${index + 1} is occupied by ${occ.name}. Each boarder gets their own room.`;
  if (occ) return `${dog.name} is already in Suite ${index + 1}.`;
  return null;
}

export function assignSuite(s: GameState, dogId: string, index: number): Result {
  const dog = s.dogs.find((d) => d.id === dogId);
  if (!dog) return { ok: false, error: "That pup already went home." };
  const why = suiteBlockReason(s, dog, index);
  if (why) return { ok: false, error: why };
  return { ok: true, state: { ...s, dogs: s.dogs.map((d) => (d.id === dogId ? { ...d, place: { kind: "suite", index } } : d)) }, msg: `${dog.name} settled into Suite ${index + 1}.` };
}

export function playtime(s: GameState, dogId: string): Result {
  const dog = s.dogs.find((d) => d.id === dogId);
  if (!dog) return { ok: false, error: "That pup already went home." };
  if (dog.place.kind === "recovery") return { ok: false, error: `${dog.name} is calming down in recovery — move them to a matching playroom first.` };
  if (inActiveScuffle(s, dog)) return { ok: false, error: `Separate the scuffle in ${dog.name}'s room first.` };
  if (dog.place.kind === "lobby") return { ok: false, error: `${dog.name} is still in the lobby — assign a playroom${dog.boarding ? " or suite" : ""} first.` };
  const st = useStaff(s, 10);
  if (!st) return { ok: false, error: "Staff are tired — let them rest a moment." };
  const dogs = st.dogs.map((d) => (d.id === dogId ? { ...d, happiness: clamp(d.happiness + 25), clean: clamp(d.clean - 10), played: d.played + 1 } : d));
  const [out, amt] = earn({ ...st, dogs, cleanliness: clamp(st.cleanliness - 4), stats: { ...st.stats, plays: st.stats.plays + 1 } }, 15);
  return { ok: true, state: out, earned: amt, msg: `${dog.name} had a blast!` };
}

export function bath(s: GameState, dogId: string): Result {
  const dog = s.dogs.find((d) => d.id === dogId);
  if (!dog) return { ok: false, error: "That pup already went home." };
  if (!dog.checkedIn) return { ok: false, error: `Check ${dog.name} in first.` };
  if (inActiveScuffle(s, dog)) return { ok: false, error: `Separate the scuffle in ${dog.name}'s room first.` };
  const st = useStaff(s, 15);
  if (!st) return { ok: false, error: "Staff are tired — let them rest a moment." };
  const dogs = st.dogs.map((d) => (d.id === dogId ? { ...d, clean: 100, happiness: clamp(d.happiness + 5), bathed: true } : d));
  const bonus = s.upgrades.includes("splash") ? 10 : 0;
  const [out, amt] = earn({ ...st, dogs, stats: { ...st.stats, baths: st.stats.baths + 1 } }, 25 + bonus);
  return { ok: true, state: out, earned: amt, msg: `${dog.name} is squeaky clean!` };
}

export function cleanRoom(s: GameState): Result {
  if (s.cleanliness >= 100) return { ok: false, error: "Already sparkling!" };
  const st = useStaff(s, 10);
  if (!st) return { ok: false, error: "Staff are tired — let them rest a moment." };
  return { ok: true, state: { ...st, cleanliness: clamp(st.cleanliness + 35), stats: { ...st.stats, cleans: st.stats.cleans + 1 } }, msg: "Floors mopped!" };
}

/** Checkout pays based on happiness; an exit bath option adds a fee if dog isn't fresh. */
export function checkout(s: GameState, dogId: string, exitBath: boolean): Result {
  const dog = s.dogs.find((d) => d.id === dogId);
  if (!dog) return { ok: false, error: "That pup already went home." };
  if (!dog.checkedIn) return { ok: false, error: `${dog.name} hasn't been checked in yet.` };
  if (inActiveScuffle(s, dog)) return { ok: false, error: `Separate the scuffle in ${dog.name}'s room first.` };
  if (dog.boarding && dog.place.kind !== "suite") return { ok: false, error: `${dog.name} is booked overnight — settle them into a suite before checkout.` };
  let st: GameState = s;
  let base = Math.round(10 + dog.happiness * 0.4) + (dog.boarding ? 60 : 0);
  if (exitBath) {
    const used = useStaff(s, 15);
    if (!used) return { ok: false, error: "Staff are tired — let them rest a moment." };
    st = { ...used, stats: { ...used.stats, baths: used.stats.baths + 1 } };
    base += 30 + (s.upgrades.includes("splash") ? 10 : 0);
  }
  st = { ...st, dogs: st.dogs.filter((d) => d.id !== dogId), stats: { ...st.stats, checkouts: st.stats.checkouts + 1 } };
  const [out, amt] = earn(st, base);
  return { ok: true, state: out, earned: amt, msg: `${dog.name} went home happy!` };
}

export function buyUpgrade(s: GameState, id: string): Result {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u) return { ok: false, error: "Unknown upgrade" };
  if (s.upgrades.includes(id)) return { ok: false, error: "Already owned" };
  if (u.requires && !s.upgrades.includes(u.requires)) return { ok: false, error: "Locked — buy the previous upgrade first." };
  if (s.coins < u.cost) return { ok: false, error: `Need ${u.cost - s.coins} more coins.` };
  return { ok: true, state: { ...s, coins: s.coins - u.cost, upgrades: [...s.upgrades, id] }, msg: `${u.name} unlocked!` };
}

export function buyDecor(s: GameState, id: string): Result {
  const d = DECOR.find((x) => x.id === id);
  if (!d) return { ok: false, error: "Unknown decor" };
  if (s.decor.includes(id)) return { ok: false, error: "Already owned" };
  if (s.coins < d.cost) return { ok: false, error: `Need ${d.cost - s.coins} more coins.` };
  return { ok: true, state: { ...s, coins: s.coins - d.cost, decor: [...s.decor, id] }, msg: `${d.name} placed!` };
}

export function hireStaff(s: GameState): Result {
  if (s.staff.length >= MAX_STAFF) return { ok: false, error: "Team is fully staffed." };
  const cost = hireCost(s.staff.length);
  if (s.coins < cost) return { ok: false, error: `Need ${cost - s.coins} more coins.` };
  const name = STAFF_NAMES[s.staff.length] ?? "Pal";
  return { ok: true, state: { ...s, coins: s.coins - cost, staff: [...s.staff, { id: "s" + s.seq, name, energy: 100 }], seq: s.seq + 1 }, msg: `${name} joined the team!` };
}

/** Advance live time. Never takes coins. `rand` drives arrivals & scuffles (inject for tests). */
export function tick(s: GameState, seconds: number, rand: () => number = Math.random): GameState {
  const decorSlow = 1 - Math.min(0.4, s.decor.length * 0.1);
  const dirtFactor = s.cleanliness < 40 ? 1.6 : 1;
  // scuffles: only rooms with a mismatched pup can start one
  let scuffles = [...(s.scuffles ?? [])];
  for (const site of sites(s)) for (const g of GROUPS) {
    if (roomAtRisk(s, site, g.id) && !hasScuffle({ ...s, scuffles }, site, g.id) && rand() < SCUFFLE_CHANCE_PER_SEC * seconds) scuffles.push({ site, group: g.id });
  }
  scuffles = scuffles.filter((x) => roomAtRisk(s, x.site, x.group)); // resolves once the mismatch leaves
  const inScuffle = (d: Dog) => d.place.kind === "room" && scuffles.some((x) => x.site === d.site && x.group === (d.place as { group: GroupId }).group);
  const dogs = s.dogs.map((d) => ({
    ...d,
    happiness: clamp(d.happiness - (0.5 + (inScuffle(d) ? 1.5 : 0)) * seconds * decorSlow * dirtFactor),
    clean: clamp(d.clean - 0.25 * seconds),
  }));
  const reputation = Math.max(REP_MIN, Math.min(100, (s.reputation ?? 80) - scuffles.length * 0.3 * seconds + (scuffles.length ? 0 : 0.02 * seconds)));
  let out: GameState = {
    ...s,
    dogs,
    scuffles,
    reputation,
    cleanliness: clamp(s.cleanliness - 0.08 * s.dogs.length * seconds),
    staff: s.staff.map((st) => ({ ...st, energy: clamp(st.energy + 2 * seconds) })),
  };
  // clock + random customer drop-offs during open lobby hours
  // Fractional seconds accumulate; arrival rolls happen once per whole game minute crossed.
  let remaining = Math.max(0, seconds) * GAME_MIN_PER_SEC;
  while (remaining > 1e-9) {
    const toNext = Math.floor(out.clockMin + 1e-9) + 1 - out.clockMin;
    const step = Math.min(remaining, toNext);
    remaining -= step;
    let clock = out.clockMin + step;
    const whole = Math.abs(clock - Math.round(clock)) < 1e-9;
    if (whole) clock = Math.round(clock);
    let day = out.gameDay;
    if (clock >= DAY_CLOSE) { clock = DAY_OPEN; day += 1; }
    out = { ...out, clockMin: clock, gameDay: day };
    if (!whole) continue;
    if (lobbyStatus(clock).open && rand() < ARRIVAL_CHANCE_PER_MIN * (out.reputation / 80)) {
      const site = sites(out)[Math.floor(rand() * sites(out).length)]!;
      const boarding = suiteCount(out) > 0 && rand() < 0.25;
      const r = createArrival(out, rand, boarding, site);
      if (r.ok) out = r.state; // lobby full -> customer politely rebooks, no penalty
    }
  }
  return out;
}

/** Returning after time away: no decay, staff fully rested, small capped welcome bonus. */
export function welcomeBack(s: GameState, now: number): { state: GameState; bonus: number } {
  const away = Math.max(0, (now - s.lastSeen) / 1000);
  const bonus = away > 300 ? Math.min(MAX_OFFLINE_REWARD, Math.floor(away / 60) * 2) : 0;
  return {
    state: { ...s, lastSeen: now, coins: s.coins + bonus, staff: s.staff.map((st) => ({ ...st, energy: 100 })) },
    bonus,
  };
}

// ---------- Missions & achievements ----------
export type Mission = { id: string; label: string; stat: keyof Stats; target: number; reward: number };
const MISSION_POOL: Omit<Mission, "id">[] = [
  { label: "Admit 5 pups", stat: "admitted", target: 5, reward: 80 },
  { label: "Give 4 baths", stat: "baths", target: 4, reward: 90 },
  { label: "Host 8 playtimes", stat: "plays", target: 8, reward: 80 },
  { label: "Earn 400 coins", stat: "earned", target: 400, reward: 100 },
  { label: "Send 4 pups home happy", stat: "checkouts", target: 4, reward: 90 },
  { label: "Mop the floors 3 times", stat: "cleans", target: 3, reward: 60 },
  { label: "Play a Recess Rush run", stat: "runs", target: 1, reward: 70 },
];

export function seedFrom(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
export function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dailyMissions(day: string): Mission[] {
  const r = mulberry(seedFrom("missions-" + day));
  const pool = [...MISSION_POOL];
  const out: Mission[] = [];
  while (out.length < 3) {
    const m = pool.splice(Math.floor(r() * pool.length), 1)[0]!;
    out.push({ ...m, id: `${day}-${m.stat}` });
  }
  return out;
}

export function rollMissionDay(s: GameState, day: string): GameState {
  if (s.missionDay === day) return s;
  return { ...s, missionDay: day, missionBase: { ...s.stats }, missionsClaimed: [] };
}

export function missionProgress(s: GameState, m: Mission) {
  return Math.min(m.target, s.stats[m.stat] - (s.missionBase[m.stat] ?? 0));
}

export function claimMission(s: GameState, m: Mission): Result {
  if (s.missionsClaimed.includes(m.id)) return { ok: false, error: "Already claimed" };
  if (missionProgress(s, m) < m.target) return { ok: false, error: "Not finished yet" };
  return { ok: true, state: { ...s, coins: s.coins + m.reward, missionsClaimed: [...s.missionsClaimed, m.id] }, msg: `+${m.reward} coins!` };
}

export type Achievement = { id: string; label: string; test: (s: GameState) => boolean };
export const ACHIEVEMENTS: Achievement[] = [
  { id: "first", label: "First Wag — admit your first pup", test: (s) => s.stats.admitted >= 1 },
  { id: "bubbles", label: "Bubble Boss — 10 baths", test: (s) => s.stats.baths >= 10 },
  { id: "full", label: "Full House — fill a playroom", test: (s) => sites(s).some((site) => GROUPS.some((g) => roomDogs(s, site, g.id).length >= roomCapacity(s))) },
  { id: "team", label: "Pack Leader — 3 staff", test: (s) => s.staff.length >= 3 },
  { id: "board", label: "Sweet Dreams — host a boarder", test: (s) => s.stats.boarders >= 1 },
  { id: "hills", label: "Two Towns — open Hillsdale", test: (s) => s.upgrades.includes("hillsdale") },
  { id: "rich", label: "Top Dog — earn 5,000 coins", test: (s) => s.stats.earned >= 5000 },
  { id: "share", label: "Proud Parent — share your card", test: (s) => s.stats.shares >= 1 },
  { id: "runner", label: "Zoomies — score 500 in Recess Rush", test: (s) => s.recessBest >= 500 },
];

export function checkAchievements(s: GameState): { state: GameState; unlocked: Achievement[] } {
  const unlocked = ACHIEVEMENTS.filter((a) => !s.achievements.includes(a.id) && a.test(s));
  if (!unlocked.length) return { state: s, unlocked };
  return { state: { ...s, achievements: [...s.achievements, ...unlocked.map((a) => a.id)] }, unlocked };
}

// ---------- Free cosmetics shared with Recess Rush ----------
export type Cosmetic = { id: string; name: string; color: string; unlockScore: number };
export const FREE_COSMETICS: Cosmetic[] = [
  { id: "bandana-red", name: "Ruby Bandana", color: "oklch(0.6 0.2 25)", unlockScore: 150 },
  { id: "bandana-green", name: "Clover Bandana", color: "oklch(0.65 0.17 145)", unlockScore: 400 },
  { id: "bandana-gold", name: "Golden Bandana", color: "oklch(0.82 0.16 85)", unlockScore: 800 },
];

// ---------- Recess Rush course + reward rules (shared by the game and its reward validation) ----------
export const RECESS_DURATION = 60;
export const RECESS_RUN_COIN_CAP = 120;
export const RECESS_DAILY_COIN_CAP = 300;
export const RECESS_TREAT_POINTS = 10;
export const RECESS_TIME_POINTS_PER_SEC = 2;
/** Seconds between items at time t (gets busier as the run goes on). */
export const recessSpawnInterval = (t: number) => Math.max(0.32, 0.75 - t * 0.006);
/** Item kind for a spawn roll: 60% treat, 33% puddle, 7% shield ball. */
export const recessItemKind = (r: number): "treat" | "puddle" | "shield" => (r < 0.6 ? "treat" : r < 0.93 ? "puddle" : "shield");

/**
 * Highest score a perfect run on this seeded course could reach: every treat collected plus the time bonus,
 * with a little slack for frame timing. Scores above this are impossible and are not rewarded.
 */
export function recessMaxScore(seed: string): number {
  const rand = mulberry(seedFrom("recess-" + seed));
  let t = 0;
  let treats = 0;
  while (t < RECESS_DURATION) {
    const kind = recessItemKind(rand());
    rand(); // lane
    if (kind === "treat") treats++;
    t += recessSpawnInterval(t);
  }
  return (treats + 3) * RECESS_TREAT_POINTS + RECESS_DURATION * RECESS_TIME_POINTS_PER_SEC + 5;
}

export function recessCoinsLeft(s: GameState, day: string): number {
  const used = s.recessDay === day ? s.recessCoinsToday : 0;
  return Math.max(0, RECESS_DAILY_COIN_CAP - used);
}

/**
 * Apply a finished Recess Rush run. Coins are capped per run and per New York day, and a score the course
 * can't produce earns nothing, so the arcade can't be used to mint unlimited daycare coins. (The score is still
 * reported by this device; paid items can never be earned with coins.)
 */
export function applyRun(s: GameState, score: number, opts: { seed?: string; day?: string } = {}): { state: GameState; coins: number; newCosmetics: Cosmetic[]; capped: boolean; rejected?: string } {
  const day = opts.day ?? s.recessDay ?? "";
  const safe = Math.max(0, Math.min(5000, Math.floor(Number.isFinite(score) ? score : 0)));
  if (opts.seed !== undefined && safe > recessMaxScore(opts.seed)) {
    return { state: { ...s, stats: { ...s.stats, runs: s.stats.runs + 1 } }, coins: 0, newCosmetics: [], capped: false, rejected: "That score is not possible on this course, so it wasn't counted." };
  }
  const left = recessCoinsLeft(s, day);
  const want = Math.min(RECESS_RUN_COIN_CAP, Math.floor(safe / 10));
  const coins = Math.min(want, left);
  const best = Math.max(s.recessBest, safe);
  const newCosmetics = FREE_COSMETICS.filter((c) => best >= c.unlockScore && !s.cosmetics.includes(c.id));
  const usedBefore = s.recessDay === day ? s.recessCoinsToday : 0;
  return {
    state: { ...s, coins: s.coins + coins, recessBest: best, recessDay: day, recessCoinsToday: usedBefore + coins, cosmetics: [...s.cosmetics, ...newCosmetics.map((c) => c.id)], stats: { ...s.stats, runs: s.stats.runs + 1 } },
    coins,
    newCosmetics,
    capped: coins < want,
  };
}

export function daycareScore(s: GameState) {
  const avgHappy = s.dogs.length ? s.dogs.reduce((a, d) => a + d.happiness, 0) / s.dogs.length : 70;
  return Math.round(s.stats.earned / 10 + s.upgrades.length * 50 + s.decor.length * 15 + s.achievements.length * 40 + avgHappy + s.staff.length * 20);
}

/** Validate + migrate a loaded save; returns null if corrupt. Never trusts paid entitlements (none are stored). */
type Loose = Record<string, unknown>;
const isObj = (x: unknown): x is Loose => !!x && typeof x === "object" && !Array.isArray(x);
const num = (x: unknown, d: number, lo = -Infinity, hi = Infinity) => (typeof x === "number" && Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d);
const strArr = (x: unknown, allowed?: string[]) => (Array.isArray(x) ? [...new Set(x.filter((v): v is string => typeof v === "string" && (!allowed || allowed.includes(v))))] : []);
const GROUP_IDS = GROUPS.map((g) => g.id) as string[];

/** New York calendar date (YYYY-MM-DD) for daily missions/challenges. */
export function nyDateKey(ms: number = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

/**
 * Validates and migrates v1–v4 saves. Unknown fields (including any paid-ownership claims) are dropped —
 * paid items come only from server-verified entitlements. Invalid placements and overcapacity move to recovery.
 */
export function parseSave(raw: unknown): GameState | null {
  if (!isObj(raw)) return null;
  const v = raw['v'];
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > SAVE_VERSION) return null;
  if (typeof raw['coins'] !== "number" || !Number.isFinite(raw['coins']) || raw['coins'] < 0) return null;
  const base = newGame(num(raw['lastSeen'], Date.now(), 0), typeof raw['missionDay'] === "string" ? raw['missionDay'] : nyDateKey());
  const upgrades = strArr(raw['upgrades'], UPGRADES.map((u) => u.id));
  const statsOf = (x: unknown): Stats => {
    const o = isObj(x) ? x : {};
    const e = emptyStats();
    for (const k of Object.keys(e) as (keyof Stats)[]) e[k] = Math.floor(num(o[k], 0, 0));
    return e;
  };
  const st: GameState = {
    ...base,
    v: SAVE_VERSION,
    coins: Math.floor(raw['coins']),
    upgrades,
    decor: strArr(raw['decor'], DECOR.map((d) => d['id'])),
    cleanliness: num(raw['cleanliness'], 100, 0, 100),
    tutorial: Math.floor(num(raw['tutorial'], 0, -1, 99)),
    stats: statsOf(raw['stats']),
    missionBase: statsOf(raw['missionBase']),
    achievements: strArr(raw['achievements']),
    missionsClaimed: strArr(raw['missionsClaimed']),
    recessBest: Math.floor(num(raw['recessBest'], 0, 0, 5000)),
    recessDay: typeof raw['recessDay'] === "string" ? raw['recessDay'].slice(0, 10) : base.recessDay,
    recessCoinsToday: Math.floor(num(raw['recessCoinsToday'], 0, 0, RECESS_DAILY_COIN_CAP)),
    // Whitelist: only free, earnable cosmetics live in saves. Paid items are gated by server entitlements.
    cosmetics: [...new Set(strArr(raw['cosmetics']).filter((c) => FREE_COSMETICS.some((f) => f.id === c)))],
    equipped: typeof raw['equipped'] === "string" ? raw['equipped'] : null,
    seq: Math.floor(num(raw['seq'], 1, 1)),
    site: raw['site'] === "hillsdale" && upgrades.includes("hillsdale") ? "hillsdale" : "hawthorne",
    clockMin: v >= 3 ? num(raw['clockMin'], DAY_OPEN, DAY_OPEN, DAY_CLOSE - 1) : DAY_OPEN,
    gameDay: v >= 3 ? Math.floor(num(raw['gameDay'], 1, 1)) : 1,
    reputation: v >= 3 ? num(raw['reputation'], 80, REP_MIN, 100) : 80,
  };
  if (st.equipped && !st.cosmetics.includes(st.equipped)) st.equipped = null;
  const staffRaw = Array.isArray(raw['staff']) ? raw['staff'].filter(isObj) : [];
  st.staff = staffRaw.slice(0, MAX_STAFF).map((x, i) => ({ id: typeof x['id'] === "string" ? x['id'] : `s_m${i}`, name: typeof x['name'] === "string" ? x['name'].slice(0, 24) : STAFF_NAMES[i] ?? "Pal", energy: num(x['energy'], 100, 0, 100) }));
  if (!st.staff.length) st.staff = base.staff;
  const open = sites(st);
  const seen = new Set<string>();
  const dogsRaw = Array.isArray(raw['dogs']) ? raw['dogs'].filter(isObj) : [];
  const taken = new Set<string>(dogsRaw.map((d) => d['id']).filter((x): x is string => typeof x === "string" && !!x));
  let fixN = 0;
  const freshId = () => { let id: string; do id = `d_fix${fixN++}`; while (taken.has(id) || seen.has(id)); return id; };
  const dogs: Dog[] = [];
  dogsRaw.forEach((d, i) => {
    let id = typeof d['id'] === "string" && d['id'] ? d['id'] : freshId();
    if (seen.has(id)) id = freshId();
    seen.add(id);
    const breed = typeof d['breed'] === "number" && Number.isInteger(d['breed']) && d['breed'] >= 0 && d['breed'] < BREEDS.length ? d['breed'] : 0;
    const size: Size = v >= 2 && (d['size'] === "small" || d['size'] === "large") ? d['size'] : BREEDS[breed]!.size;
    const temper: Temper = v >= 2 && (d['temper'] === "gentle" || d['temper'] === "active") ? d['temper'] : i % 2 ? "active" : "gentle";
    const site: SiteId = v >= 2 && (d["site"] === "hawthorne" || d["site"] === "hillsdale") && open.includes(d["site"]) ? d["site"] : "hawthorne";
    let place: Place = { kind: "lobby" };
    const p = d["place"];
    if (v >= 2 && isObj(p)) {
      if (p['kind'] === "room" && typeof p['group'] === "string" && GROUP_IDS.includes(p['group'])) place = { kind: "room", group: p['group'] as GroupId };
      else if (p['kind'] === "suite" && typeof p['index'] === "number" && Number.isInteger(p['index'])) place = { kind: "suite", index: p['index'] };
      else if (p['kind'] === "recovery") place = { kind: "recovery" };
    }
    dogs.push({
      id, site, size, temper, place, breed,
      name: typeof d['name'] === "string" && d['name'] ? d['name'].slice(0, 24) : NAMES[i % NAMES.length]!,
      happiness: num(d['happiness'], 70, 0, 100),
      clean: num(d['clean'], 70, 0, 100),
      boarding: d["boarding"] === true && upgrades.includes("boarding"),
      played: Math.floor(num(d['played'], 0, 0)),
      bathed: d['bathed'] === true,
      x: num(d['x'], 0.5, 0, 1),
      y: num(d['y'], 0.5, 0, 1),
      checkedIn: v >= 4 ? d["checkedIn"] !== false : true, // pre-v4 dogs were already admitted & paid
    });
  });
  // Normalize occupancy: invalid or overflowing placements go to recovery (never lose a dog).
  const used = new Set<string>();
  const roomCount: Record<string, number> = {};
  const lobbyCount: Record<string, number> = {};
  const cap = roomCapacity(st);
  for (const d of dogs) {
    const toRec = () => { d.place = { kind: "recovery" }; };
    if (!d.checkedIn && d.place.kind !== "lobby") d.place = { kind: "lobby" };
    if (d.place.kind === "suite") {
      const key = `${d.site}:${d.place.index}`;
      if (!d.boarding || d.place.index < 0 || d.place.index >= suiteCount(st) || used.has(key)) toRec(); else used.add(key);
    } else if (d.place.kind === "room") {
      const key = `${d.site}:${d.place.group}`;
      roomCount[key] = (roomCount[key] ?? 0) + 1;
      if (d.boarding || roomCount[key]! > cap) toRec();
    } else if (d.place.kind === "lobby") {
      lobbyCount[d.site] = (lobbyCount[d.site] ?? 0) + 1;
      if (lobbyCount[d.site]! > LOBBY_CAP) toRec(); // waiting pups keep checkedIn:false and can still be checked in
    }
  }
  st.dogs = dogs;
  let maxGen = 0;
  for (const x of [...dogs, ...st.staff]) { const m = /^[ds](\d+)$/.exec(x.id); if (m) maxGen = Math.max(maxGen, Number(m[1])); }
  st.seq = Math.max(st.seq, maxGen + 1, dogs.length + 1);
  const scRaw = v >= 3 && Array.isArray(raw['scuffles']) ? raw['scuffles'].filter(isObj) : [];
  st.scuffles = scRaw
    .filter((x) => (x['site'] === "hawthorne" || x['site'] === "hillsdale") && typeof x['group'] === "string" && GROUP_IDS.includes(x['group']))
    .map((x) => ({ site: x['site'] as SiteId, group: x['group'] as GroupId }))
    .filter((x) => roomAtRisk(st, x['site'], x['group']));
  return st;
}
