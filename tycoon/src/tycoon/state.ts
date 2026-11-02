import { parseDeliveryLog } from "@/lib/purchases/delivery";
// PAWtastic Daycare Tycoon — new game and safe save loading (spec §4.8).
import { BREEDS, GUESTBOOK_MAX, emptyStats, type GroupId, type Regular, type Staff, type Stats } from "@/game/engine";
import { ENTRANCE, FLOORS, MAX_DOORS, MAX_ROOMS, PARCELS, PRICE_DEFAULTS, PRICE_RANGES, START_COINS, WALL_COLORS } from "./catalog";
import { roomContaining, validRoomAt, validThingAt } from "./build";
import { thingTiles } from "./grid";
import { WEEKLY_GOALS, WEEKLY_STATS } from "./weekly";
import type { TWeekly, WeeklyStat } from "./types";
import type { CampaignId, DayLedger, Door, Facility, ParcelId, Placed, Prices, Room, RoomType, TDog, TPlace, TycoonState } from "./types";

export const SAVE_VERSION = 1 as const;
export const DAY_OPEN_MIN = 7 * 60;

export const entrance = (): Placed => ({ uid: "entrance", kind: "path", c: ENTRANCE.c, r: ENTRANCE.r, rot: 0, level: 1, spent: 0, room: null, closed: false });

export function newFacility(name: string): Facility {
  return {
    name,
    land: ["starter"],
    rooms: [],
    items: [entrance()],
    dogs: [],
    staff: [{ id: "s0", name: "Phil", energy: 100 }],
    clockMin: DAY_OPEN_MIN,
    day: 1,
    reputation: 80,
    cleanliness: 100,
    stats: emptyStats(),
    guestBook: [],
    open: false,
    prices: { ...PRICE_DEFAULTS },
    wage: "standard",
    supplies: "basic",
    campaign: null,
    ledger: [],
    scuffles: [],
    report: null,
    rush: { day: 1, peak: 0, since: null, awarded: false },
  };
}

export function newTycoon(now: number): TycoonState {
  return {
    v: SAVE_VERSION,
    coins: START_COINS,
    xp: 0,
    seq: 1,
    lastSeen: now,
    guide: { done: false, skipped: false, painted: false },
    active: "f1",
    facilities: { f1: newFacility("My Daycare") },
    trophies: [],
    bestProfit: 0,
    pendingLevel: null,
    weekly: null,
    deliveries: { applied: [], done: [] },
  };
}

export const fac = (s: TycoonState): Facility => s.facilities[s.active]!;
export const withFac = (s: TycoonState, f: Facility): TycoonState => ({ ...s, facilities: { ...s.facilities, [s.active]: f } });

// ---------- validation ----------
type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => !!x && typeof x === "object" && !Array.isArray(x);
const num = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) ? x : d);
const int = (x: unknown, d: number) => (typeof x === "number" && Number.isInteger(x) ? x : d);
const str = (x: unknown, d: string) => (typeof x === "string" && x.length <= 200 ? x : d);
const bool = (x: unknown, d: boolean) => (typeof x === "boolean" ? x : d);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const ROOM_TYPES: RoomType[] = ["lobby", "playroom", "calm", "bath", "boarding", "staff"];
const GROUP_IDS: GroupId[] = ["small-gentle", "small-active", "large-gentle", "large-active"];
const SIDES = ["N", "E", "S", "W"] as const;
const PARCEL_IDS = PARCELS.map((p) => p.id);

function parseRoom(x: unknown): Room | null {
  if (!isObj(x) || typeof x["uid"] !== "string") return null;
  const type = ROOM_TYPES.includes(x["type"] as RoomType) ? (x["type"] as RoomType) : null;
  const doors: Door[] = [];
  for (const d of Array.isArray(x["doors"]) ? x["doors"] : []) {
    if (isObj(d) && SIDES.includes(d["side"] as (typeof SIDES)[number]) && Number.isInteger(d["i"])) doors.push({ side: d["side"] as Door["side"], i: d["i"] as number });
  }
  return {
    uid: x["uid"],
    c: int(x["c"], -1),
    r: int(x["r"], -1),
    w: int(x["w"], 0),
    d: int(x["d"], 0),
    type,
    group: type === "playroom" && GROUP_IDS.includes(x["group"] as GroupId) ? (x["group"] as GroupId) : null,
    doors,
    floor: FLOORS.includes(x["floor"] as Room["floor"]) ? (x["floor"] as Room["floor"]) : "wood",
    wall: WALL_COLORS.includes(x["wall"] as string) ? (x["wall"] as string) : WALL_COLORS[0]!,
    spent: Math.max(0, num(x["spent"], 0)),
    closed: bool(x["closed"], false),
  };
}

function parsePlaced(x: unknown): Placed | null {
  if (!isObj(x) || typeof x["uid"] !== "string" || typeof x["kind"] !== "string") return null;
  const level = [1, 2, 3].includes(x["level"] as number) ? (x["level"] as 1 | 2 | 3) : 1;
  return {
    uid: x["uid"],
    kind: x["kind"] as Placed["kind"],
    c: int(x["c"], -1),
    r: int(x["r"], -1),
    rot: [0, 1, 2, 3].includes(x["rot"] as number) ? (x["rot"] as Placed["rot"]) : 0,
    level,
    spent: Math.max(0, num(x["spent"], 0)),
    room: typeof x["room"] === "string" ? x["room"] : null,
    closed: bool(x["closed"], false),
  };
}

/** Keeps a room's doors that are valid, dropping the rest (corner, off-wall, duplicates, past 4). */
function cleanDoors(f: Facility, room: Room): Room {
  const kept: Door[] = [];
  for (const d of room.doors) {
    if (kept.length >= MAX_DOORS) break;
    const trial = { ...room, doors: [...kept, d] };
    if (validRoomAt(f, trial) === null) kept.push(d);
  }
  return { ...room, doors: kept };
}

function parseDog(x: unknown, f: Facility): TDog | null {
  if (!isObj(x) || typeof x["id"] !== "string" || typeof x["name"] !== "string") return null;
  const breed = int(x["breed"], -1);
  if (breed < 0 || breed >= BREEDS.length) return null;
  const size = x["size"] === "small" || x["size"] === "large" ? x["size"] : null;
  const temper = x["temper"] === "gentle" || x["temper"] === "active" ? x["temper"] : null;
  if (!size || !temper) return null;
  const p = isObj(x["place"]) ? x["place"] : {};
  const roomOk = (id: unknown) => typeof id === "string" && f.rooms.some((r) => r.uid === id);
  let place: TPlace = { kind: "lobby" };
  if ((p["kind"] === "room" || p["kind"] === "calm") && roomOk(p["room"])) place = { kind: p["kind"], room: p["room"] as string };
  if (p["kind"] === "bed" && roomOk(p["room"]) && f.items.some((i) => i.uid === p["bed"])) place = { kind: "bed", room: p["room"] as string, bed: p["bed"] as string };
  return {
    id: x["id"],
    name: str(x["name"], "Pup"),
    breed,
    size,
    temper,
    visits: Math.max(1, int(x["visits"], 1)),
    place,
    checkedIn: bool(x["checkedIn"], false),
    happiness: clamp(num(x["happiness"], 60), 0, 100),
    clean: clamp(num(x["clean"], 60), 0, 100),
    boarding: bool(x["boarding"], false),
    played: Math.max(0, int(x["played"], 0)),
    bathed: bool(x["bathed"], false),
  };
}

const parseStats = (x: unknown): Stats => {
  const base = emptyStats();
  if (!isObj(x)) return base;
  for (const k of Object.keys(base) as (keyof Stats)[]) base[k] = Math.max(0, int(x[k], 0));
  return base;
};

function parseLedger(x: unknown): DayLedger[] {
  if (!Array.isArray(x)) return [];
  const out: DayLedger[] = [];
  for (const e of x.slice(-14)) {
    if (!isObj(e) || !isObj(e["income"]) || !isObj(e["expenses"])) continue;
    const inc = e["income"];
    const exp = e["expenses"];
    out.push({
      day: int(e["day"], 0),
      income: { daycare: num(inc["daycare"], 0), boarding: num(inc["boarding"], 0), baths: num(inc["baths"], 0), exitBaths: num(inc["exitBaths"], 0), tips: num(inc["tips"], 0), bonus: num(inc["bonus"], 0) },
      expenses: { wages: num(exp["wages"], 0), upkeep: num(exp["upkeep"], 0), supplies: num(exp["supplies"], 0), marketing: num(exp["marketing"], 0), building: num(exp["building"], 0) },
      checkIns: Math.max(0, int(e["checkIns"], 0)),
      checkouts: Math.max(0, int(e["checkouts"], 0)),
    });
  }
  return out;
}

/** A guest-book entry with everything an arrival needs, or null. */
function parseRegular(x: unknown): Regular | null {
  if (!isObj(x) || typeof x["name"] !== "string") return null;
  const breed = int(x["breed"], -1);
  const size = x["size"] === "small" || x["size"] === "large" ? x["size"] : null;
  const temper = x["temper"] === "gentle" || x["temper"] === "active" ? x["temper"] : null;
  if (breed < 0 || breed >= BREEDS.length || !size || !temper) return null;
  return {
    name: x["name"].trim().slice(0, 24) || "Pup",
    breed,
    size,
    temper,
    visits: Math.max(1, int(x["visits"], 1)),
    friendship: clamp(num(x["friendship"], 0), 0, 100),
    lastDay: Math.max(0, int(x["lastDay"], 0)),
  };
}

/**
 * Puts every pup somewhere valid: unchecked pups wait in the lobby; boarders sleep only in a free boarding bed of that
 * room; daycare pups only in a playroom with a free spot (extras calm down, or wait in the lobby). Nobody is dropped.
 */
function normalisePlaces(f: Facility, dogs: TDog[]): TDog[] {
  const roomOf = (uid: string) => f.rooms.find((r) => r.uid === uid) ?? null;
  const calm = f.rooms.find((r) => r.type === "calm") ?? null;
  const spotKinds = ["dog_bed", "play_mat", "deluxe_bed", "cloud_bed"];
  const left = new Map<string, number>();
  for (const r of f.rooms)
    if (r.type === "playroom")
      left.set(r.uid, Math.min(Math.floor((r.w * r.d) / 2), f.items.filter((i) => i.room === r.uid && spotKinds.includes(i.kind)).length));
  const takenBeds = new Set<string>();
  const lobby: TPlace = { kind: "lobby" };
  return dogs.map((d) => {
    const p = d.place;
    if (p.kind === "lobby") return d;
    if (!d.checkedIn) return { ...d, place: lobby };
    if (p.kind === "bed") {
      const bed = f.items.find((i) => i.uid === p.bed);
      if (!d.boarding || !bed || bed.kind !== "boarding_bed" || bed.room !== p.room || takenBeds.has(bed.uid)) return { ...d, place: lobby };
      takenBeds.add(bed.uid);
      return d;
    }
    const room = roomOf(p.room);
    if (p.kind === "calm") return room?.type === "calm" ? d : { ...d, place: lobby };
    if (d.boarding || room?.type !== "playroom") return { ...d, place: lobby };
    const free = left.get(room.uid) ?? 0;
    if (free <= 0) return { ...d, place: calm ? { kind: "calm", room: calm.uid } : lobby };
    left.set(room.uid, free - 1);
    return d;
  });
}

function parseFacility(x: unknown): Facility | null {
  if (!isObj(x)) return null;
  const f = newFacility(str(x["name"], "My Daycare"));
  f.land = Array.isArray(x["land"]) ? [...new Set((x["land"] as unknown[]).filter((p): p is ParcelId => PARCEL_IDS.includes(p as ParcelId)))] : ["starter"];
  if (!f.land.includes("starter")) f.land.unshift("starter");
  // Rooms first (in order; first wins), then the entrance, then furniture, then outdoor items.
  f.items = [];
  for (const raw of Array.isArray(x["rooms"]) ? x["rooms"] : []) {
    const room = parseRoom(raw);
    if (!room || f.rooms.length >= MAX_ROOMS || f.rooms.some((r) => r.uid === room.uid)) continue;
    const doorless = { ...room, doors: [] };
    if (validRoomAt(f, doorless) !== null) continue;
    f.rooms.push(doorless);
    const withDoors = cleanDoors({ ...f, rooms: f.rooms.filter((r) => r.uid !== room.uid) }, room);
    f.rooms[f.rooms.length - 1] = withDoors;
  }
  f.items = [entrance()];
  const rawItems = (Array.isArray(x["items"]) ? x["items"] : []).map(parsePlaced).filter((p): p is Placed => !!p && p.uid !== "entrance");
  const ordered = [...rawItems.filter((p) => roomContaining(f, thingTiles(p))), ...rawItems.filter((p) => !roomContaining(f, thingTiles(p)))];
  for (const p of ordered) {
    if (f.items.some((i) => i.uid === p.uid)) continue;
    const room = roomContaining(f, thingTiles(p));
    const placed: Placed = { ...p, room: room && p.kind !== "path" ? room.uid : null };
    if (validThingAt(f, placed) === null) f.items.push(placed);
  }
  const seenDogs = new Set<string>();
  const dogs = (Array.isArray(x["dogs"]) ? x["dogs"] : [])
    .map((d) => parseDog(d, f))
    .filter((d): d is TDog => !!d && !seenDogs.has(d.id) && !!seenDogs.add(d.id))
    .slice(0, 200);
  f.dogs = normalisePlaces(f, dogs);
  const seenStaff = new Set<string>();
  const staff = (Array.isArray(x["staff"]) ? x["staff"] : []).filter(
    (s): s is Staff => isObj(s) && typeof s["id"] === "string" && SAFE_ID.test(s["id"]) && typeof s["name"] === "string" && typeof s["energy"] === "number" && !seenStaff.has(s["id"]) && !!seenStaff.add(s["id"]),
  );
  f.staff = staff.length ? staff.slice(0, 6).map((s) => ({ id: s.id, name: s.name.trim().slice(0, 24) || "Pal", energy: clamp(s.energy, 0, 100) })) : f.staff;
  f.clockMin = clamp(num(x["clockMin"], DAY_OPEN_MIN), 0, 24 * 60);
  f.day = Math.max(1, int(x["day"], 1));
  f.reputation = clamp(num(x["reputation"], 80), 40, 100);
  f.cleanliness = clamp(num(x["cleanliness"], 100), 0, 100);
  f.stats = parseStats(x["stats"]);
  f.guestBook = (Array.isArray(x["guestBook"]) ? x["guestBook"] : []).map(parseRegular).filter((g): g is Regular => !!g).slice(0, GUESTBOOK_MAX);
  f.open = bool(x["open"], false);
  const pr = isObj(x["prices"]) ? x["prices"] : {};
  const prices = { ...PRICE_DEFAULTS };
  for (const k of Object.keys(PRICE_DEFAULTS) as (keyof Prices)[]) {
    const [lo, hi] = PRICE_RANGES[k];
    prices[k] = typeof pr[k] === "number" && Number.isFinite(pr[k]) ? clamp(Math.round(pr[k] as number), lo, hi) : PRICE_DEFAULTS[k];
  }
  f.prices = prices;
  f.wage = x["wage"] === "lean" || x["wage"] === "generous" ? x["wage"] : "standard";
  f.supplies = x["supplies"] === "premium" ? "premium" : "basic";
  const camp = isObj(x["campaign"]) ? x["campaign"] : null;
  f.campaign = camp && ["flyers", "online", "openhouse"].includes(camp["id"] as string) ? { id: camp["id"] as CampaignId, untilDay: int(camp["untilDay"], 0) } : null;
  f.ledger = parseLedger(x["ledger"]);
  f.scuffles = (Array.isArray(x["scuffles"]) ? x["scuffles"] : []).filter((s): s is { room: string } => isObj(s) && f.rooms.some((r) => r.uid === s["room"]));
  f.report = null;
  const rush = isObj(x["rush"]) ? x["rush"] : {};
  f.rush = { day: int(rush["day"], f.day), peak: Math.max(0, int(rush["peak"], 0)), since: typeof rush["since"] === "number" ? rush["since"] : null, awarded: bool(rush["awarded"], false) };
  return f;
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,24}$/;
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype", "hasOwnProperty", "toString", "valueOf"]);
/** One past the highest numbered id in the save (r12, t40, d7, s3…), so new things never reuse an id. */
function nextSeq(facilities: Record<string, Facility>): number {
  let max = 0;
  const see = (uid: string) => {
    const m = /^[a-z](\d+)$/.exec(uid);
    if (m) max = Math.max(max, Number(m[1]));
  };
  for (const f of Object.values(facilities)) {
    f.rooms.forEach((r) => see(r.uid));
    f.items.forEach((i) => see(i.uid));
    f.dogs.forEach((d) => see(d.id));
    f.staff.forEach((st) => see(st.id));
  }
  return max + 1;
}

/** Validates and repairs a loaded save; null if it isn't a save at all. Never trusts paid ownership (none is stored). */
export function parseTycoon(raw: unknown): TycoonState | null {
  if (!isObj(raw) || raw["v"] !== SAVE_VERSION) return null;
  const facs = isObj(raw["facilities"]) ? raw["facilities"] : {};
  const facilities: Record<string, Facility> = {};
  for (const [id, f] of Object.entries(facs)) {
    if (!SAFE_ID.test(id) || UNSAFE_KEYS.has(id)) continue;
    const parsed = parseFacility(f);
    if (parsed) facilities[id] = parsed;
  }
  const own = (id: unknown): id is string => typeof id === "string" && Object.hasOwn(facilities, id);
  const active = own(raw["active"]) ? raw["active"] : Object.keys(facilities)[0] ?? "f1";
  if (!Object.hasOwn(facilities, active)) facilities[active] = newFacility("My Daycare");
  const g = isObj(raw["guide"]) ? raw["guide"] : {};
  return {
    v: SAVE_VERSION,
    coins: num(raw["coins"], START_COINS),
    xp: Math.max(0, int(raw["xp"], 0)),
    seq: Math.max(1, int(raw["seq"], 1), nextSeq(facilities)),
    lastSeen: num(raw["lastSeen"], Date.now()),
    guide: { done: bool(g["done"], false), skipped: bool(g["skipped"], false), painted: bool(g["painted"], false) },
    active,
    facilities,
    trophies: Array.isArray(raw["trophies"]) ? [...new Set((raw["trophies"] as unknown[]).filter((t): t is string => typeof t === "string"))] : [],
    bestProfit: num(raw["bestProfit"], 0),
    pendingLevel: typeof raw["pendingLevel"] === "number" ? raw["pendingLevel"] : null,
    weekly: parseWeekly(raw["weekly"]),
    deliveries: parseDeliveryLog(raw["deliveries"]),
  };
}

/** This week's challenge, or null (a fresh one starts) if anything about it looks wrong. */
function parseWeekly(x: unknown): TWeekly | null {
  if (!isObj(x) || typeof x["week"] !== "string" || !/^\d{4}-W\d{2}$/.test(x["week"])) return null;
  if (typeof x["goal"] !== "string" || !WEEKLY_GOALS.some((g) => g.id === x["goal"])) return null;
  const b = x["base"];
  if (!isObj(b)) return null;
  const base = {} as Record<WeeklyStat, number>;
  for (const k of WEEKLY_STATS) {
    const v = b[k];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) return null;
    base[k] = v;
  }
  const day = x["baseDay"];
  if (typeof day !== "number" || !Number.isInteger(day) || day < 1 || typeof x["claimed"] !== "boolean") return null;
  return { week: x["week"], goal: x["goal"], base, baseDay: day, claimed: x["claimed"] };
}
