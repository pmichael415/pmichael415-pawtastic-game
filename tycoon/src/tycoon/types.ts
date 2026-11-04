import type { DeliveryLog } from "@/lib/purchases/delivery";
// PAWtastic Daycare Tycoon (new engine) — state types. Everything here is plain data: saves are JSON.
import type { Dog, Favorite, GroupId, Regular, Staff, Stats } from "@/game/engine";

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
  | "deluxe_tub"
  | "cloud_bed"
  | "lighthouse_fort";
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

/** What a customer books. Exit baths are offered at pickup, not booked. */
export type Service = "daycare" | "bath" | "boarding";
/** One visit: the customer, what they booked, when they come back, and what happened (service design, "The visit"). */
export type Visit = {
  owner: string;
  requests: Service[];
  /** Paid at check-in (a prepaid package); never charged again at pickup. */
  prepaid: Service[];
  arrivedDay: number;
  arrived: number;
  pickupDay: number;
  pickup: number;
  /** Game minute the owner arrived for pickup (null while they're away). */
  ownerHere: number | null;
  /** Game minutes the pup waited at the desk before check-in. */
  waitedLobby: number;
  checkedInAt: number | null;
  history: string[];
  scuffle: boolean;
  /** Moved to calm down to keep everyone safe (never held against the visit). */
  safeMove: boolean;
  /** The owner agreed to wait while this service is finished. */
  finishing: "bath" | null;
  /** How the player answered each complaint (one answer per complaint). */
  remedies: Partial<Record<ComplaintKind, RemedyKind>>;
  /** Coins already paid at check-in for prepaid services (what a refund gives back). */
  paid: number;
  /** Minutes the owner had waited when they agreed to wait for a service (still counted, still owed any remedy). */
  waitBefore: number;
  /** A personal moment: the pup asked for you (its favourite game); open, answered (done) or faded (missed). */
  moment?: { kind: Favorite; at: number; day: number; state: "open" | "done" | "missed" } | null;
};
export type ComplaintKind = "wait" | "bath" | "billing" | "attention" | "dirty";
/** No credit for next time (audit finding 6): game-coin refunds, finishing the service, or an explanation. */
export type RemedyKind = "finish" | "refund" | "explain";
export type Mood = "delighted" | "content" | "disappointed" | "upset";
/** How a visit ended: what was billed, how the family felt, what went wrong and how it was answered. */
export type Outcome = {
  dog: string;
  owner: string;
  day: number;
  min: number;
  how: "checkout" | "left" | "dayend" | "finished";
  mood: Mood;
  satisfaction: number;
  total: number;
  lines: { label: string; amount: number }[];
  /** A game reward that came with this visit (a loyalty milestone): shown apart from the bill, recorded as bonus income. */
  reward?: { label: string; amount: number } | null;
  complaints: { kind: ComplaintKind; text: string; remedy: RemedyKind | null; resolved: boolean }[];
  repDelta: number;
  review: Review | null;
};
export type TDog = Omit<Dog, "site" | "place" | "x" | "y"> & {
  place: TPlace;
  /** Missing only on pups made before visits existed; visitOf() fills it in. */
  visit?: Visit;
  /** Game minutes left in a bath that's running (null or missing when none). */
  bathing?: number | null;
  /** The tub (bath station) a running bath is using. */
  bathTub?: string | null;
};

// ---- staff (staff design §2) ----
export type Role = "reception" | "attendant" | "bath" | "cleaner";
/** Each role's two priorities; the first is the default. */
export type Focus = "pickups" | "arrivals" | "neediest" | "newest" | "soonest" | "booked" | "dirtiest" | "busiest";
export type JobKind = "checkin" | "pickup" | "decline" | "play" | "bath" | "clean";
export type Tile = { c: number; r: number };
/** One job: walking to `to`, then working there. `left` is game minutes left in the current phase. */
export type Job = { kind: JobKind; dog: string | null; room: string | null; tub: string | null; bed?: string | null; phase: "walk" | "work"; left: number; total: number; to: Tile; /** the pup's name when the job began (for notes after it leaves) */ who?: string };
/** A team member. Phil (the founder) helps when you tap; hired staff take a role and do it on their own. */
export type TStaff = Staff & {
  founder?: boolean;
  role?: Role | null;
  /** Rooms an attendant or cleaner looks after (empty: all). */
  rooms?: string[];
  focus?: Focus;
  job?: Job | null;
  /** Where they last worked (walking starts here). */
  at?: Tile | null;
  /** Why they skipped work only the player can do, or what happened to their last job. */
  note?: string | null;
  /** On a break until their energy is back. */
  resting?: boolean;
};
/** Why reputation moved, for the Reputation panel. */
export type RepEntry = { day: number; min: number; delta: number; reason: string };
export type Review = { day: number; stars: 1 | 2 | 3 | 4 | 5; owner: string; dog: string; text: string };
/** A guest-book entry: the pup, plus how the family felt last time, and if they've stopped coming. */
export type TRegular = Regular & { sat?: number; lostUntil?: number };

export type Prices = { daycare: number; boarding: number; bath: number; exitBath: number };
export type Wage = "lean" | "standard" | "generous";
export type Supplies = "basic" | "premium";
export type CampaignId = "flyers" | "online" | "openhouse";
export type IncomeKey = "daycare" | "boarding" | "baths" | "exitBaths" | "tips" | "bonus";
export type ExpenseKey = "wages" | "upkeep" | "supplies" | "marketing" | "building" | "refunds";

/**
 * One game day's books. `sales` is what selling rooms, doors and things paid back (75%): money in, but not revenue
 * from serving families. Coins always equal opening coins + Σ income + sales − Σ expenses (audit finding 2).
 */
export type DayLedger = { day: number; income: Record<IncomeKey, number>; expenses: Record<ExpenseKey, number>; sales: number; checkIns: number; checkouts: number };
export type TReport = {
  day: number;
  income: number;
  /** Every expense, building included. */
  expenses: number;
  /** income + sale proceeds − expenses: the change in coins from the day. */
  profit: number;
  /**
   * Operating profit: revenue from serving families (daycare, boarding, baths, exit baths, tips) − operating costs
   * (wages, upkeep, supplies, marketing, refunds). Bonuses and sales are left out, so a reward can't make service look
   * profitable (audit finding 5).
   */
  running: number;
  /** Coins put into building that day (an investment, not a running cost). */
  invested: number;
  /** Game rewards that day (level-ups, trophies, the guide, loyalty milestones, rush hour, welcome back). */
  bonuses: number;
  /** What selling rooms, doors and things paid back. */
  sales: number;
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
  staff: TStaff[];
  clockMin: number;
  day: number;
  reputation: number;
  cleanliness: number;
  /** Each room's cleanliness (missing: the daycare-wide value). */
  roomClean?: Record<string, number>;
  stats: Stats;
  guestBook: TRegular[];
  open: boolean;
  prices: Prices;
  wage: Wage;
  supplies: Supplies;
  campaign: { id: CampaignId; untilDay: number } | null;
  ledger: DayLedger[];
  scuffles: { room: string }[];
  report: TReport | null;
  rush: { day: number; peak: number; since: number | null; awarded: boolean };
  /** The latest reputation changes and why (newest last). */
  repLog: RepEntry[];
  /** Public reviews (newest last). */
  reviews: Review[];
  /** A 5★ review's referrals: more drop-offs until this day ends (null when none). */
  referralUntil: number | null;
  /** The latest pickups and how they went (newest last). */
  outcomes: Outcome[];
  /** The introductory day: the first day the daycare opened (0: already past; null/missing: not opened yet). */
  introDay?: number | null;
  /** Families kindly rescheduled (the introductory day's grace, or still at the desk at closing), for a short notice. */
  courtesy?: { day: number; min: number; why: "intro" | "closing"; names: string[] } | null;
  /** Families who asked today for a kind of pup with no playroom here (they booked elsewhere — no charge, no tap). */
  asked?: { day: number; groups: Partial<Record<GroupId, number>> } | null;
};

export type WeeklyStat = "checkouts" | "plays" | "admitted" | "baths" | "boarders";
/** This week's challenge: the goal, stats when the week started, and whether its reward was claimed. */
export type TWeekly = { week: string; goal: string; base: Record<WeeklyStat, number>; baseDay: number; claimed: boolean };

// ---- the guided tour (Stage A, docs/superpowers/specs/2026-11-02-tycoon-replayability-design.md §3.2) ----
export type TourBeat = "meet" | "checkin" | "place" | "play" | "checkout" | "upgrade" | "benefit" | "decision" | "goals";
export type TourUpgrade = "toy_bin" | "play_yard";
export type Tour = { mode: "quick" | "scratch"; beat: TourBeat; startedAt: number; upgrade: TourUpgrade | null; done: boolean; skipped: boolean };

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
  /** Set on the load that settled credits from an older save as refunds (audit finding 6), to tell the player once. */
  settledCredits?: number;
  pendingLevel: number | null;
  weekly: TWeekly | null;
  /** Purchases added to this save (ids) — see src/lib/purchases/delivery.ts. */
  deliveries: DeliveryLog;
  /** The guided tour; null when it hasn't started (or the save predates it). */
  tour: Tour | null;
};

export type TResult = { ok: true; state: TycoonState; msg?: string; earned?: number } | { ok: false; error: string };
