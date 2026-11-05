// PAWtastic Daycare Tycoon — ways to grow (staff design §5; combined-loop plan, task 4). Five real options — a
// playroom wing, a bath station, a boarding wing, a play yard and a staff room — each built with the ordinary build
// functions, priced by a dry run of that build, placed at one of up to three offered spots (next to an existing room
// with a door into it, or outside for the yard), and improved (not duplicated) the second time. Game coins only. Pure.
import { GROUPS, groupName, groupOf, type GroupId } from "@/game/engine";
import { addDoor, drawRoom, placeThing, setRoomType, upgradeThing } from "./build";
import { WAGES, facilityUpkeep, today } from "./business";
import { thingName } from "./catalog";
import { caps, connectedRooms, roomStatus } from "./connect";
import { funAppeal } from "./effects";
import { containsTile, doorOutside, rectTiles, type Tile } from "./grid";
import { level } from "./progress";
import { roomName } from "./rooms";
import { fac } from "./state";
import type { Door, Facility, Room, Side, TResult, TycoonState } from "./types";

export type ExpansionId = "playroom" | "bath" | "boarding" | "yard" | "staff";
export type ExpansionGroup = "families" | "services" | "comfort" | "team";
/** The level the first expansions open at (a playroom wing, a bath station, a play yard). */
export const EXPANSION_LEVEL = 2;
/** The level each way to grow opens at (boarding beds and staff couches unlock later in the catalog). */
export const EXPANSION_LEVELS: Record<ExpansionId, number> = { playroom: EXPANSION_LEVEL, bath: EXPANSION_LEVEL, yard: EXPANSION_LEVEL, boarding: 3, staff: 5 };
export const EXPANSION_GROUPS: { id: ExpansionGroup; label: string }[] = [
  { id: "families", label: "More families" },
  { id: "services", label: "New services" },
  { id: "comfort", label: "Comfort" },
  { id: "team", label: "Your team" },
];
const ORDER: ExpansionId[] = ["playroom", "bath", "boarding", "yard", "staff"];
const GROUP_OF: Record<ExpansionId, ExpansionGroup> = { playroom: "families", bath: "services", boarding: "services", yard: "comfort", staff: "team" };
export type ExpansionOption = {
  id: ExpansionId;
  group: ExpansionGroup;
  mode: "new" | "improve";
  title: string;
  cost: number;
  upkeep: number;
  capacity: string;
  staffing: string;
  unlocks: string;
  /** Why you might want it. */
  goodIf: string;
  available: boolean;
  why: string | null;
};
/** A place a new room (or the yard) can go: its rectangle, where that is in words, and its price there. */
export type ExpansionSpot = { c: number; r: number; w: number; d: number; near: string; cost: number };

type RoomPlan = { kind: "room"; c: number; r: number; w: number; d: number; door: Door; anchor: string; side: Side };
type YardPlan = { kind: "yard"; c: number; r: number; w: number; d: number; anchor: string };
type Plan = RoomPlan | YardPlan;

const RICH = 10_000_000;
const SIZE: Record<Exclude<ExpansionId, "yard">, [number, number]> = { playroom: [3, 3], bath: [4, 3], boarding: [3, 3], staff: [3, 2] };
const YARD: [number, number] = [3, 2];
const newest = (s: TycoonState) => fac(s).rooms.at(-1)!.uid;
const roomTilesOf = (f: Facility, uid: string): Tile[] => {
  const r = f.rooms.find((x) => x.uid === uid)!;
  return rectTiles(r.c, r.r, r.w, r.d);
};
/** Places `kind` on the first square of the room where it fits. */
function placeIn(s: TycoonState, uid: string, kind: "dog_bed" | "toy_bin" | "bath_tub" | "boarding_bed" | "staff_couch"): TycoonState | null {
  for (const t of roomTilesOf(fac(s), uid))
    for (const rot of [0, 1] as const) {
      const r = placeThing(s, kind, t.c, t.r, rot);
      if (r.ok) return r.state;
    }
  return null;
}
const overlaps = (a: { c: number; r: number; w: number; d: number }, b: { c: number; r: number; w: number; d: number }) => a.c < b.c + b.w && b.c < a.c + a.w && a.r < b.r + b.d && b.r < a.r + a.d;
const centre = (a: { c: number; r: number; w: number; d: number }) => ({ c: a.c + a.w / 2, r: a.r + a.d / 2 });
/** Up to `n` choices, as different as possible: a different room or side first, then anything that doesn't overlap. */
function spread<P extends Plan>(all: P[], n: number, distinct: (p: P, q: P) => boolean): P[] {
  const chosen: P[] = [];
  for (const pass of [0, 1])
    for (const p of all) {
      if (chosen.length >= n) break;
      if (chosen.includes(p) || chosen.some((q) => overlaps(p, q))) continue;
      if (pass === 0 && chosen.some((q) => !distinct(p, q))) continue;
      chosen.push(p);
    }
  return chosen;
}

/** Spots for a new w × d room touching an existing connected room, with a door into it (rooms near the lobby first). */
function roomPlans(s: TycoonState, w: number, d: number): RoomPlan[] {
  const rich = { ...s, coins: RICH };
  const f = fac(s);
  const connected = connectedRooms(f);
  const lobby = f.rooms.find((r) => r.type === "lobby");
  const anchors = f.rooms.filter((r) => connected.has(r.uid)).sort((a, b) => (lobby ? Math.abs(a.c - lobby.c) + Math.abs(a.r - lobby.r) - (Math.abs(b.c - lobby.c) + Math.abs(b.r - lobby.r)) : 0));
  const all: RoomPlan[] = [];
  for (const R of anchors) {
    const sides: [Side, Side][] = [["N", "S"], ["E", "W"], ["W", "E"], ["S", "N"]];
    for (const [side, doorSide] of sides) {
      const along = side === "N" || side === "S";
      const lo = along ? R.c - w + 2 : R.r - d + 2;
      const hi = along ? R.c + R.w - 2 : R.r + R.d - 2;
      for (let o = lo; o <= hi; o++) {
        const c = side === "E" ? R.c + R.w : side === "W" ? R.c - w : o;
        const r = side === "S" ? R.r + R.d : side === "N" ? R.r - d : o;
        const a = drawRoom(rich, c, r, w, d);
        if (!a.ok) continue;
        const uid = newest(a.state);
        const room = fac(a.state).rooms.find((x) => x.uid === uid)!;
        const len = along ? w : d;
        for (let i = 1; i < len - 1; i++) {
          const door: Door = { side: doorSide, i };
          if (!containsTile(R, doorOutside(room, door))) continue;
          if (addDoor(a.state, uid, door).ok) {
            all.push({ kind: "room", c, r, w, d, door, anchor: R.uid, side });
            break;
          }
        }
      }
      if (all.length >= 30) break;
    }
  }
  return spread(all, 3, (p, q) => p.anchor !== q.anchor || p.side !== q.side);
}

/** The yard's three pieces on a 3 × 2 patch: a 2 × 2 play yard, then a water station and a shade tree beside it. */
const YARD_PARTS = (c: number, r: number) =>
  [
    { kind: "play_yard", c, r },
    { kind: "water", c: c + 2, r },
    { kind: "shade_tree", c: c + 2, r: r + 1 },
  ] as const;
/** Spots outside for the yard: one square from the building (a walkway left free), never in front of a door. */
function yardPlans(s: TycoonState): YardPlan[] {
  const rich = { ...s, coins: RICH };
  const f = fac(s);
  if (!f.rooms.length) return [];
  const [w, d] = YARD;
  const doorFronts = f.rooms.flatMap((room) => room.doors.map((door) => doorOutside(room, door)));
  const gapTo = (p: { c: number; r: number }, room: Room) => Math.max(room.c - (p.c + w), p.c - (room.c + room.w), room.r - (p.r + d), p.r - (room.r + room.d));
  const lobby = f.rooms.find((r) => r.type === "lobby") ?? f.rooms[0]!;
  const all: (YardPlan & { rank: number })[] = [];
  for (let r = 0; r + d <= 28; r++)
    for (let c = 0; c + w <= 36; c++) {
      const rect = { c, r, w, d };
      const gaps = f.rooms.map((room) => ({ room, gap: gapTo(rect, room) }));
      const near = gaps.reduce((a, b) => (b.gap < a.gap ? b : a));
      if (near.gap < 1 || near.gap > 2) continue;
      // keep a square clear in front of every door
      if (doorFronts.some((t) => t.c >= c - 1 && t.c <= c + w && t.r >= r - 1 && t.r <= r + d)) continue;
      let st: TycoonState | null = rich;
      for (const part of YARD_PARTS(c, r)) {
        const placed: TResult = placeThing(st!, part.kind, part.c, part.r, 0);
        st = placed.ok ? placed.state : null;
        if (!st) break;
      }
      if (!st) continue;
      const lc = centre(lobby);
      all.push({ kind: "yard", c, r, w, d, anchor: near.room.uid, rank: near.gap * 100 + Math.abs(c + w / 2 - lc.c) + Math.abs(r + d / 2 - lc.r) });
    }
  all.sort((a, b) => a.rank - b.rank);
  const far = (p: YardPlan, q: YardPlan) => Math.abs(centre(p).c - centre(q).c) + Math.abs(centre(p).r - centre(q).r) >= 5;
  return spread(all, 3, far).map(({ rank: _rank, ...p }) => p);
}

/**
 * A new w × d room joined to the building: at the first offered spot next to a connected room, with a door into it
 * (the same spots the expansions offer). Null when there's no such spot. Used by the tour's one-tap playroom.
 */
export function attachedRoom(s: TycoonState, w: number, d: number): { state: TycoonState; uid: string } | null {
  const plan = roomPlans(s, w, d)[0];
  if (!plan) return null;
  const a = drawRoom(s, plan.c, plan.r, plan.w, plan.d);
  if (!a.ok) return null;
  const uid = newest(a.state);
  const b = addDoor(a.state, uid, plan.door);
  return b.ok ? { state: b.state, uid } : null;
}

const working = (s: TycoonState, uid: string) => {
  const f = fac(s);
  const room = f.rooms.find((r) => r.uid === uid);
  return !!room && roomStatus(f, room).working;
};

/** A playroom of this kind exists (working or not — a closed one is reopened, not built again). */
export const hasPlayroomFor = (f: Facility, g: GroupId) => f.rooms.some((r) => r.type === "playroom" && r.group === g);
/** Rooms that would count toward growing but are closed or not working right now. */
export function idleRooms(f: Facility): Room[] {
  const connected = connectedRooms(f);
  return f.rooms.filter((r) => (r.type === "playroom" || r.type === "bath" || r.type === "boarding" || r.type === "staff") && !roomStatus(f, r, connected).working);
}
/** Families who asked today for each kind of pup with no playroom here (most first). */
export function askedToday(f: Facility): { group: GroupId; n: number }[] {
  const groups = f.asked && f.asked.day === f.day ? f.asked.groups : {};
  return (Object.entries(groups) as [GroupId, number][]).filter(([g, n]) => n > 0 && !hasPlayroomFor(f, g)).map(([group, n]) => ({ group, n })).sort((a, b) => b.n - a.n);
}
/** A kind of pup families want a room for right now: one waiting at the desk with no room, else the most asked today. */
export function demandGroup(f: Facility): GroupId | null {
  const has = (g: GroupId) => hasPlayroomFor(f, g);
  const waiting = f.dogs.filter((d) => !d.checkedIn && d.place.kind === "lobby" && !d.boarding).map((d) => groupOf(d)).find((g) => !has(g));
  return waiting ?? askedToday(f)[0]?.group ?? null;
}
/** The group most in need of a playroom: one families want (waiting or asked today), else one with no room at all. */
export function neededGroup(f: Facility): GroupId {
  const c = caps(f);
  const has = (g: GroupId) => c.playrooms.some((p) => p.group === g);
  return demandGroup(f) ?? GROUPS.map((g) => g.id).find((g) => !has(g)) ?? c.playrooms[0]?.group ?? "small-gentle";
}

/** Where an improvement goes: a bed in the fullest playroom that can still take one, else a toy in the fullest one. */
function improveTarget(f: Facility): { room: string; kind: "dog_bed" | "toy_bin" } | null {
  const c = caps(f);
  const fill = (uid: string, spots: number) => f.dogs.filter((d) => d.place.kind === "room" && d.place.room === uid).length / Math.max(1, spots);
  const byFill = [...c.playrooms].sort((a, b) => fill(b.room.uid, b.spots) - fill(a.room.uid, a.spots));
  const bed = byFill.find((p) => p.spots < Math.floor((p.room.w * p.room.d) / 2));
  if (bed) return { room: bed.room.uid, kind: "dog_bed" };
  return byFill[0] ? { room: byFill[0].room.uid, kind: "toy_bin" } : null;
}
const yardItems = (f: Facility) => f.items.filter((i) => i.room === null && (i.kind === "play_yard" || i.kind === "water" || i.kind === "shade_tree"));
/** The next yard piece to raise a level: the play yard first, then the water station, then the shade tree. */
const yardUpgrade = (f: Facility) => ["play_yard", "water", "shade_tree"].map((k) => yardItems(f).find((i) => i.kind === k && i.level < 3)).find((i) => !!i) ?? null;

const modeOf = (f: Facility, id: ExpansionId): "new" | "improve" => {
  switch (id) {
    case "bath":
      return caps(f).bath ? "improve" : "new";
    case "playroom":
      // a new room when families want one for a kind of pup you can't take; otherwise the second one improves
      return demandGroup(f) || f.rooms.filter((r) => r.type === "playroom").length < 2 ? "new" : "improve";
    case "boarding":
      return f.rooms.some((r) => r.type === "boarding") ? "improve" : "new";
    case "staff":
      return f.rooms.some((r) => r.type === "staff") ? "improve" : "new";
    case "yard":
      return f.items.some((i) => i.room === null && i.kind === "play_yard") ? "improve" : "new";
  }
};

const NO_SPOT = "There's no free spot next to your rooms — buy more land or build by hand.";
/** Does the expansion on `s` (coins permitting) — the real build, step by step — at `plan` when it's a new room. */
function build(s: TycoonState, id: ExpansionId, plan: Plan | null): TycoonState | string {
  const f = fac(s);
  const mode = modeOf(f, id);
  if (mode === "improve") {
    switch (id) {
      case "bath":
        return placeIn(s, caps(f).bath!.room.uid, "bath_tub") ?? "The bath room is full — build a bigger one by hand to add a station.";
      case "playroom": {
        const target = improveTarget(f);
        if (!target) return "There's no playroom to improve.";
        return placeIn(s, target.room, target.kind) ?? (target.kind === "dog_bed" ? "That playroom has no room for another bed." : "That playroom is full of furniture already.");
      }
      case "boarding": {
        const room = f.rooms.find((r) => r.type === "boarding")!;
        return placeIn(s, room.uid, "boarding_bed") ?? "The boarding room is full — build a bigger one by hand for more beds.";
      }
      case "staff": {
        if (caps(f).staffBoost >= 1.5) return "Your staff room is as restful as it gets.";
        const room = f.rooms.find((r) => r.type === "staff")!;
        return placeIn(s, room.uid, "staff_couch") ?? "The staff room is full — build a bigger one by hand for another couch.";
      }
      case "yard": {
        const next = yardUpgrade(f);
        if (!next) return "Your play yard is fully improved.";
        const r = upgradeThing(s, next.uid);
        return r.ok ? r.state : r.error;
      }
    }
  }
  if (!plan) return NO_SPOT;
  if (plan.kind === "yard") {
    let st: TycoonState = s;
    for (const part of YARD_PARTS(plan.c, plan.r)) {
      const r = placeThing(st, part.kind, part.c, part.r, 0);
      if (!r.ok) return r.error;
      st = r.state;
    }
    return st;
  }
  const a = drawRoom(s, plan.c, plan.r, plan.w, plan.d);
  if (!a.ok) return a.error;
  const uid = newest(a.state);
  const b = addDoor(a.state, uid, plan.door);
  if (!b.ok) return b.error;
  const type = id === "yard" ? "playroom" : id;
  const typed = setRoomType(b.state, uid, type, type === "playroom" ? neededGroup(f) : undefined);
  if (!typed.ok) return typed.error;
  let out: TycoonState | null = typed.state;
  if (id === "playroom") for (let i = 0; i < 3 && out; i++) out = placeIn(out, uid, "dog_bed");
  if (id === "boarding") for (let i = 0; i < 3 && out; i++) out = placeIn(out, uid, "boarding_bed");
  if (id === "bath" && out) out = placeIn(out, uid, "bath_tub");
  if (id === "staff" && out) out = placeIn(out, uid, "staff_couch");
  return out && working(out, uid) ? out : `The new ${type === "staff" ? "staff room" : type === "boarding" ? "boarding room" : type === "bath" ? "bath room" : "playroom"} couldn't be set up there.`;
}

/**
 * Memos of spots and dry-run prices. Pure caches: the key holds everything the build depends on (layout, open/closed,
 * doors, items and their levels, land, level gate, mode, needed group), so two games with the same layout rightly
 * share an answer and a changed layout never reuses a stale one. Bounded; clearExpansionQuotes() empties them (tests).
 */
type Quote = { cost: number; upkeep: number; fun: number; appeal: number; boost: number };
const quotes = new Map<string, Quote | string>();
const plansMemo = new Map<string, Plan[]>();
export function clearExpansionQuotes() {
  quotes.clear();
  plansMemo.clear();
  fullQuotes.clear();
}
const layoutKey = (s: TycoonState, id: ExpansionId) => {
  const f = fac(s);
  return `${id}|${modeOf(f, id)}|${level(s) >= EXPANSION_LEVELS[id]}|${f.land.join()}|${f.rooms.map((r) => `${r.uid}${r.c},${r.r},${r.w},${r.d},${r.type},${r.group},${r.closed},${r.doors.map((d) => d.side + d.i).join("")}`).join(";")}|${f.items.map((i) => `${i.uid}${i.kind}${i.c},${i.r},${i.rot},${i.closed},${i.level}`).join(";")}|${neededGroup(f)}`;
};
function plans(s: TycoonState, id: ExpansionId): Plan[] {
  if (modeOf(fac(s), id) === "improve") return [];
  const key = layoutKey(s, id);
  const hit = plansMemo.get(key);
  if (hit) return hit;
  const out = id === "yard" ? yardPlans(s) : roomPlans(s, ...SIZE[id]);
  if (plansMemo.size > 100) plansMemo.clear();
  plansMemo.set(key, out);
  return out;
}
const planKey = (p: Plan | null) => (p ? `${p.c},${p.r}` : "-");
function quote(s: TycoonState, id: ExpansionId, plan: Plan | null): Quote | string {
  const key = `${layoutKey(s, id)}|${planKey(plan)}`;
  const hit = quotes.get(key);
  if (hit !== undefined) return hit;
  const f = fac(s);
  const after = build({ ...s, coins: RICH }, id, plan);
  let q: Quote | string;
  if (typeof after === "string") q = after;
  else {
    const g = fac(after);
    const fa0 = funAppeal(f);
    const fa1 = funAppeal(g);
    // the coins spent on building (a level-up reward earned by the build is not part of the price)
    q = { cost: today(g).expenses.building - today(f).expenses.building, upkeep: facilityUpkeep(g) - facilityUpkeep(f), fun: fa1.fun - fa0.fun, appeal: fa1.appeal - fa0.appeal, boost: caps(g).staffBoost - caps(f).staffBoost };
  }
  if (quotes.size > 300) quotes.clear();
  quotes.set(key, q);
  return q;
}

const SIDE_WORDS: Record<Side, string> = { N: "behind", S: "in front of", E: "to the right of", W: "to the left of" };
function nearWords(f: Facility, p: Plan): string {
  const anchor = f.rooms.find((r) => r.uid === p.anchor);
  const name = anchor ? `the ${roomName(f, anchor.uid)}` : "your rooms";
  if (p.kind === "room") return `${SIDE_WORDS[p.side]} ${name}`;
  if (!anchor) return "outside";
  const a = centre(anchor);
  const b = centre(p);
  const dc = b.c - a.c;
  const dr = b.r - a.r;
  return `outside, ${Math.abs(dc) > Math.abs(dr) ? (dc > 0 ? "to the right of" : "to the left of") : dr > 0 ? "in front of" : "behind"} ${name}`;
}

/** Where a new room (or the yard) can go: up to three spots, with their prices. Empty for an improvement or when locked. */
export function expansionSpots(s: TycoonState, id: ExpansionId): ExpansionSpot[] {
  if (level(s) < EXPANSION_LEVELS[id]) return [];
  const f = fac(s);
  return plans(s, id).flatMap((p) => {
    const q = quote(s, id, p);
    return typeof q === "string" ? [] : [{ c: p.c, r: p.r, w: p.w, d: p.d, near: nearWords(f, p), cost: q.cost }];
  });
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
function describe(f: Facility, id: ExpansionId, mode: "new" | "improve", q: Quote | null): Pick<ExpansionOption, "title" | "capacity" | "unlocks" | "staffing" | "goodIf"> {
  const wage = WAGES[f.wage];
  const group = groupName(neededGroup(f));
  const comfort = q ? `Fun +${q.fun}${q.appeal ? `, appeal +${q.appeal}` : ""}` : "More fun";
  switch (id) {
    case "playroom": {
      const staffing = `Pups here need play: tap Play yourself, or a daycare attendant (${wage} coins a day) can look after it.`;
      if (mode === "new") {
        const asked = askedToday(f).find((a) => a.group === neededGroup(f))?.n ?? 0;
        return { title: `Playroom wing for ${group} pups`, capacity: `+3 spots for ${group} pups`, unlocks: `Take ${group} families instead of sending them elsewhere — each spot can earn about ${f.prices.daycare} coins a day.`, staffing, goodIf: asked ? `${asked} ${group} ${asked === 1 ? "family" : "families"} asked today — you have no room for them yet.` : "Good if families wait at the desk with nowhere to go, or your playrooms are full." };
      }
      const target = improveTarget(f);
      const where = target ? roomName(f, target.room) : "a playroom";
      return target?.kind === "toy_bin"
        ? { title: `Improve ${where}`, capacity: `More fun in ${where} (it already has every bed it can hold)`, unlocks: "Pups there get more from each playtime.", staffing, goodIf: "Good if pups there get bored between playtimes." }
        : { title: `Improve ${where}`, capacity: `+1 spot in ${where}`, unlocks: "One more family a day in your busiest playroom.", staffing, goodIf: "Good if that playroom fills up every day." };
    }
    case "bath": {
      const staffing = `Each bath takes someone 40 minutes: tap Bath yourself, or a bath attendant (${wage} coins a day). Two baths at once need two bath attendants.`;
      return mode === "new"
        ? { title: "Bath station", capacity: "1 bath station (one 40-minute bath at a time)", unlocks: `Families can book baths (about 3 in 10 do, ${f.prices.bath} coins each), and exit baths at pickup.`, staffing, goodIf: "Good if you want more from each family that already comes." }
        : { title: "Second bath station", capacity: "+1 bath station — two baths at once", unlocks: "The bath queue moves twice as fast, so fewer families wait at pickup.", staffing, goodIf: "Good if families wait at pickup for a bath to finish." };
    }
    case "boarding": {
      const staffing = `Boarders need play like any pup: tap Play yourself, or a daycare attendant (${wage} coins a day) can look after them.`;
      return mode === "new"
        ? { title: "Boarding wing", capacity: "3 boarding beds — 3 overnight guests", unlocks: `Families can board their pup overnight (${f.prices.boarding} coins a stay) and pick up tomorrow — boarders keep arriving after daycare drop-offs end.`, staffing, goodIf: "Good if you want income that doesn't stop when daycare drop-offs do." }
        : { title: "Another boarding bed", capacity: "+1 overnight guest", unlocks: "One more family can board with you each night.", staffing, goodIf: "Good if your boarding beds are full." };
    }
    case "yard": {
      const staffing = "Nothing extra — it works on its own.";
      const next = mode === "improve" ? yardUpgrade(f) : null;
      return mode === "new"
        ? { title: "Play yard", capacity: "An outdoor play yard, a water station and a shade tree", unlocks: `${comfort}: pups' happiness falls more slowly, each playtime gives more, more families drop by and tips grow.`, staffing, goodIf: "Good if pups get unhappy between playtimes, or you want bigger tips." }
        : { title: "Improve the play yard", capacity: next ? `${next.kind === "play_yard" ? "Play yard" : next.kind === "water" ? "Water station" : "Shade tree"} to level ${next.level + 1}` : "Fully improved", unlocks: `${comfort}: happier pups for longer, and more families.`, staffing, goodIf: "Good if pups still get unhappy before their next playtime." };
    }
    case "staff": {
      const boost = q?.boost ?? 0.5;
      const staffing = "Nothing extra — it's for your team.";
      return mode === "new"
        ? { title: "Staff room", capacity: "A staff room with a staff couch", unlocks: `Your team gets their energy back ${pct(boost)} faster between jobs, so they keep going through rush hour.`, staffing, goodIf: "Good if your team runs low on energy when it's busy." }
        : { title: "Another staff couch", capacity: `+${pct(boost)} faster energy recovery`, unlocks: "Your team rests up even faster between jobs.", staffing, goodIf: "Good if your team still runs low on energy." };
    }
  }
}

export function expansionOptions(s: TycoonState): ExpansionOption[] {
  const f = fac(s);
  return ORDER.map((id) => {
    const lvl = level(s) >= EXPANSION_LEVELS[id];
    const mode = modeOf(f, id);
    const first = mode === "new" ? (plans(s, id)[0] ?? null) : null;
    const q = !lvl ? null : mode === "new" && !first ? NO_SPOT : quote(s, id, first);
    const cost = q && typeof q !== "string" ? q.cost : 0;
    const upkeep = q && typeof q !== "string" ? q.upkeep : 0;
    // a room of this kind you already have, closed or not working: open it again (free) rather than build another
    const idle = id !== "playroom" && id !== "yard" && mode === "new" ? idleRooms(f).find((r) => r.type === id) : undefined;
    const why = !lvl ? `Unlocks at level ${EXPANSION_LEVELS[id]}.` : idle ? `Your ${roomName(f, idle.uid)} is closed or not working — open it again from its panel first (free).` : typeof q === "string" ? q : s.coins < cost ? `${(cost - s.coins).toLocaleString("en-US")} more coins needed.` : null;
    return { id, group: GROUP_OF[id], mode, ...describe(f, id, mode, q && typeof q !== "string" ? q : null), cost, upkeep, available: why === null, why };
  });
}

/**
 * Buys the expansion for game coins (refused, with nothing changed, if it isn't possible or affordable). A new room
 * goes at `spot` — one of the offered spots — or the first offered spot when none is given.
 */
/**
 * Exactly what an expansion will build (audit gap E): every new room (type, pup group, footprint, doors), every thing
 * placed or raised a level (kind, square, turn, level), and the total. Shown to the player and passed back with the
 * confirmation, so what's built is what was shown — or nothing.
 */
export type ExpansionQuote = {
  id: ExpansionId;
  rooms: { type: Room["type"]; group: GroupId | null; c: number; r: number; w: number; d: number; doors: Door[] }[];
  things: { kind: string; c: number; r: number; rot: number; level: number }[];
  cost: number;
};
/** The plan for this expansion at `spot` (the first offered spot when none is given), or why there is none. */
function planAt(s: TycoonState, id: ExpansionId, spot?: { c: number; r: number }): { plan: Plan | null } | string {
  const offered = plans(s, id);
  const plan = spot ? (offered.find((p) => p.c === spot.c && p.r === spot.r) ?? null) : (offered[0] ?? null);
  if (spot && !plan && modeOf(fac(s), id) === "new") return "That spot isn't one of the offered spots — pick one of them.";
  return { plan };
}
/** What changed between two states: the rooms and things a build added or raised, in a stable order. */
export function changeOf(before: TycoonState, after: TycoonState): Omit<ExpansionQuote, "id" | "cost"> {
  const b = fac(before);
  const a = fac(after);
  const had = new Set(b.rooms.map((r) => r.uid));
  const level = new Map(b.items.map((i) => [i.uid, i.level]));
  const rooms = a.rooms.filter((r) => !had.has(r.uid)).map((r) => ({ type: r.type, group: r.group ?? null, c: r.c, r: r.r, w: r.w, d: r.d, doors: [...r.doors] }));
  const things = a.items.filter((i) => level.get(i.uid) !== i.level).map((i) => ({ kind: i.kind, c: i.c, r: i.r, rot: i.rot, level: i.level }));
  const key = (x: { c: number; r: number }) => x.r * 1000 + x.c;
  return { rooms: rooms.sort((x, y) => key(x) - key(y)), things: things.sort((x, y) => key(x) - key(y) || x.kind.localeCompare(y.kind)) };
}
const sameQuote = (x: ExpansionQuote, y: ExpansionQuote) => JSON.stringify(x) === JSON.stringify(y);
/** The complete purchase an expansion would make right now at `spot`, or why it can't be made. */
const fullQuotes = new Map<string, ExpansionQuote | string>();
export function expansionQuote(s: TycoonState, id: ExpansionId, spot?: { c: number; r: number }): ExpansionQuote | string {
  const at = planAt(s, id, spot);
  if (typeof at === "string") return at;
  // the same key as the price quotes: everything the build depends on (layout, items and levels, land, level gate,
  // mode, the pup group families want)
  const key = `${layoutKey(s, id)}|${planKey(at.plan)}`;
  const hit = fullQuotes.get(key);
  if (hit !== undefined) return hit;
  const rich = { ...s, coins: RICH };
  const after = build(rich, id, at.plan);
  const out = typeof after === "string" ? after : { id, ...changeOf(rich, after), cost: today(fac(after)).expenses.building - today(fac(rich)).expenses.building };
  if (fullQuotes.size > 100) fullQuotes.clear();
  fullQuotes.set(key, out);
  return out;
}

/** The quote in plain words: "a 3 × 3 playroom for Large & Gentle pups with its door, and 3 Dog Beds". */
export function quoteWords(q: ExpansionQuote): string {
  const parts: string[] = [];
  for (const r of q.rooms) {
    const kind = r.type === "playroom" ? "playroom" : r.type === "bath" ? "bath room" : r.type === "boarding" ? "boarding room" : r.type === "staff" ? "staff room" : "room";
    parts.push(`a ${r.w} × ${r.d} ${kind}${r.group ? ` for ${groupName(r.group)} pups` : ""} with its door`);
  }
  const counts = new Map<string, number>();
  for (const x of q.things) {
    const name = x.level > 1 ? `${thingName(x.kind)} (level ${x.level})` : thingName(x.kind);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  for (const [name, n] of counts) parts.push(n > 1 ? `${n} ${name}s` : `a ${name}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : (parts[0] ?? "nothing");
}

/**
 * Buys an expansion at `spot`. Given `shown` (the quote the player saw), it builds exactly that or nothing: a plan that
 * changed since it was shown — another pup group, door, furnishing or price — is refused with nothing charged.
 */
export function buyExpansion(s: TycoonState, id: ExpansionId, spot?: { c: number; r: number }, shown?: ExpansionQuote): TResult {
  const o = expansionOptions(s).find((x) => x.id === id);
  if (!o) return { ok: false, error: "Pick an expansion." };
  const at = planAt(s, id, spot);
  if (typeof at === "string") return { ok: false, error: shown ? "That spot is no longer free — pick one of the spots shown now." : at };
  const plan = at.plan;
  if (!o.available) return { ok: false, error: o.why ?? "That expansion isn't possible right now." };
  const q = quote(s, id, plan);
  if (typeof q === "string") return { ok: false, error: q };
  const now = expansionQuote(s, id, spot);
  if (typeof now === "string") return { ok: false, error: now };
  if (shown && !sameQuote(shown, now))
    return { ok: false, error: `What this builds changed since you saw it — it's now ${o.title.toLowerCase()} for ${now.cost.toLocaleString("en-US")} coins. Check it and confirm again.` };
  if (s.coins < now.cost) return { ok: false, error: `${(now.cost - s.coins).toLocaleString("en-US")} more coins needed.` };
  const after = build(s, id, plan);
  if (typeof after === "string") return { ok: false, error: after };
  // exactly what was quoted, for exactly its price — or nothing
  const spent = today(fac(after)).expenses.building - today(fac(s)).expenses.building;
  if (spent !== now.cost || !sameQuote({ id, ...changeOf(s, after), cost: spent }, now)) return { ok: false, error: "The price changed — check the new price and try again." };
  return { ok: true, state: after, msg: `${o.title} — done! It's open and working.` };
}
