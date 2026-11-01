// PAWtastic Daycare Tycoon (new engine) — state types. Everything here is plain data: saves are JSON.
import type { Dog, GroupId, Regular, Staff, Stats } from "@/game/engine";

export type RoomType = "lobby" | "playroom" | "calm" | "bath" | "boarding" | "staff";
export type Side = "N" | "E" | "S" | "W";
/** A door on one side of a room; `i` counts along that side from the room's top-left corner. */
export type Door = { side: Side; i: number };
export type FloorStyle = "wood" | "tile" | "rubber" | "carpet";
export type ParcelId = "starter" | "west" | "east" | "north" | "northwest" | "northeast";
export type Rot = 0 | 1 | 2 | 3;

export type FurnitureId =
  | "front_counter"
  | "bench"
  | "dog_bed"
  | "play_mat"
  | "water_bowl"
  | "rug"
  | "plant"
  | "toy_bin"
  | "bath_tub"
  | "boarding_bed"
  | "couch"
  | "hurdles"
  | "deluxe_bed"
  | "staff_couch"
  | "deluxe_tub";
export type OutdoorId =
  | "play_yard"
  | "ball_pit"
  | "splash_pool"
  | "agility"
  | "water"
  | "shade_tree"
  | "nap_cabana"
  | "park_bench"
  | "flowers"
  | "lights"
  | "fountain"
  | "fence"
  | "path"
  | "sign";
export type ThingKind = FurnitureId | OutdoorId;

export type Room = {
  uid: string;
  c: number;
  r: number;
  w: number;
  d: number;
  type: RoomType | null;
  group: GroupId | null;
  doors: Door[];
  floor: FloorStyle;
  wall: string;
  spent: number;
  closed: boolean;
};

export type Placed = {
  uid: string;
  kind: ThingKind;
  c: number;
  r: number;
  rot: Rot;
  level: 1 | 2 | 3;
  spent: number;
  /** The room a piece of furniture sits in; null for outdoor items and paths. */
  room: string | null;
  closed: boolean;
};

// ---- running state (spec §4.5–§4.8) ----

export type TPlace =
  | { kind: "lobby" }
  | { kind: "room"; room: string }
  | { kind: "calm"; room: string }
  | { kind: "bed"; room: string; bed: string };

export type TDog = Omit<Dog, "site" | "place" | "x" | "y"> & { place: TPlace };

export type Prices = { daycare: number; boarding: number; bath: number; exitBath: number };
export type Wage = "lean" | "standard" | "generous";
export type Supplies = "basic" | "premium";
export type CampaignId = "flyers" | "online" | "openhouse";
export type IncomeKey = "daycare" | "boarding" | "baths" | "exitBaths" | "tips" | "bonus";
export type ExpenseKey = "wages" | "upkeep" | "supplies" | "marketing" | "building";

export type DayLedger = { day: number; income: Record<IncomeKey, number>; expenses: Record<ExpenseKey, number>; checkIns: number; checkouts: number };
export type TReport = {
  day: number;
  income: number;
  expenses: number;
  profit: number;
  record: boolean;
  tip: string;
  admitted: number;
  checkouts: number;
  avgHappy: number;
};

export type Facility = {
  name: string;
  land: ParcelId[];
  rooms: Room[];
  items: Placed[];
  dogs: TDog[];
  staff: Staff[];
  clockMin: number;
  day: number;
  reputation: number;
  cleanliness: number;
  stats: Stats;
  guestBook: Regular[];
  open: boolean;
  prices: Prices;
  wage: Wage;
  supplies: Supplies;
  campaign: { id: CampaignId; untilDay: number } | null;
  ledger: DayLedger[];
  scuffles: { room: string }[];
  report: TReport | null;
  rush: { day: number; peak: number; since: number | null; awarded: boolean };
};

export type TycoonState = {
  v: 1;
  coins: number;
  xp: number;
  seq: number;
  lastSeen: number;
  guide: { done: boolean; skipped: boolean; painted: boolean };
  active: string;
  facilities: Record<string, Facility>;
  trophies: string[];
  bestProfit: number;
  pendingLevel: number | null;
};

export type TResult = { ok: true; state: TycoonState; msg?: string; earned?: number } | { ok: false; error: string };
