// PAWtastic Daycare Tycoon — the first expansion decision (staff design §5): a playroom wing or a bath station,
// priced by a dry run of the real build, placed next to an existing room with a door into it, and improved (not
// duplicated) the second time. Game coins only. Pure.
import { GROUPS, groupName, groupOf, type GroupId } from "@/game/engine";
import { addDoor, drawRoom, placeThing, setRoomType } from "./build";
import { WAGES, facilityUpkeep } from "./business";
import { caps, connectedRooms, roomStatus } from "./connect";
import { containsTile, doorOutside, type Tile } from "./grid";
import { level } from "./progress";
import { roomName } from "./rooms";
import { fac } from "./state";
import type { Door, Facility, Side, TResult, TycoonState } from "./types";

export type ExpansionId = "playroom" | "bath";
export const EXPANSION_LEVEL = 2;
export type ExpansionOption = {
  id: ExpansionId;
  mode: "new" | "improve";
  title: string;
  cost: number;
  upkeep: number;
  capacity: string;
  staffing: string;
  unlocks: string;
  available: boolean;
  why: string | null;
};

const RICH = 10_000_000;
const newest = (s: TycoonState) => fac(s).rooms.at(-1)!.uid;
const freeTiles = (f: Facility, uid: string): Tile[] => {
  const r = f.rooms.find((x) => x.uid === uid)!;
  const out: Tile[] = [];
  for (let rr = r.r; rr < r.r + r.d; rr++) for (let c = r.c; c < r.c + r.w; c++) out.push({ c, r: rr });
  return out;
};
/** Places `kind` on the first square of the room where it fits. */
function placeIn(s: TycoonState, uid: string, kind: "dog_bed" | "toy_bin" | "bath_tub"): TycoonState | null {
  for (const t of freeTiles(fac(s), uid))
    for (const rot of [0, 1] as const) {
      const r = placeThing(s, kind, t.c, t.r, rot);
      if (r.ok) return r.state;
    }
  return null;
}

/** A new w × d room touching an existing room, with a door into it, on owned land (rooms near the lobby first). */
function attachRoom(s: TycoonState, w: number, d: number): { state: TycoonState; uid: string } | null {
  const f = fac(s);
  const connected = connectedRooms(f);
  const lobby = f.rooms.find((r) => r.type === "lobby");
  const anchors = f.rooms.filter((r) => connected.has(r.uid)).sort((a, b) => (lobby ? Math.abs(a.c - lobby.c) + Math.abs(a.r - lobby.r) - (Math.abs(b.c - lobby.c) + Math.abs(b.r - lobby.r)) : 0));
  for (const R of anchors) {
    const sides: [Side, Side][] = [["N", "S"], ["E", "W"], ["W", "E"], ["S", "N"]];
    for (const [side, doorSide] of sides) {
      const along = side === "N" || side === "S";
      const lo = along ? R.c - w + 2 : R.r - d + 2;
      const hi = along ? R.c + R.w - 2 : R.r + R.d - 2;
      for (let o = lo; o <= hi; o++) {
        const c = side === "E" ? R.c + R.w : side === "W" ? R.c - w : o;
        const r = side === "S" ? R.r + R.d : side === "N" ? R.r - d : o;
        const a = drawRoom(s, c, r, w, d);
        if (!a.ok) continue;
        const uid = newest(a.state);
        const room = fac(a.state).rooms.find((x) => x.uid === uid)!;
        const len = along ? w : d;
        for (let i = 1; i < len - 1; i++) {
          const door: Door = { side: doorSide, i };
          if (!containsTile(R, doorOutside(room, door))) continue;
          const b = addDoor(a.state, uid, door);
          if (b.ok) return { state: b.state, uid };
        }
      }
    }
  }
  return null;
}
const working = (s: TycoonState, uid: string) => {
  const f = fac(s);
  const room = f.rooms.find((r) => r.uid === uid);
  return !!room && roomStatus(f, room).working;
};

/** The group most in need of a playroom: one waiting at the desk with no room, else one with no room at all. */
export function neededGroup(f: Facility): GroupId {
  const c = caps(f);
  const has = (g: GroupId) => c.playrooms.some((p) => p.group === g);
  const waiting = f.dogs.filter((d) => !d.checkedIn && d.place.kind === "lobby" && !d.boarding).map((d) => groupOf(d)).find((g) => !has(g));
  return waiting ?? GROUPS.map((g) => g.id).find((g) => !has(g)) ?? c.playrooms[0]?.group ?? "small-gentle";
}

/** The playroom an improvement goes to: the fullest one that can still take another bed. */
function improveTarget(f: Facility): string | null {
  const c = caps(f);
  const fill = (uid: string, spots: number) => f.dogs.filter((d) => d.place.kind === "room" && d.place.room === uid).length / Math.max(1, spots);
  const rooms = c.playrooms.filter((p) => p.spots < Math.floor((p.room.w * p.room.d) / 2)).sort((a, b) => fill(b.room.uid, b.spots) - fill(a.room.uid, a.spots));
  return rooms[0]?.room.uid ?? c.playrooms[0]?.room.uid ?? null;
}

const modeOf = (f: Facility, id: ExpansionId): "new" | "improve" => (id === "bath" ? (caps(f).bath ? "improve" : "new") : f.rooms.filter((r) => r.type === "playroom").length >= 2 ? "improve" : "new");

/** Does the expansion on `s` (coins permitting) — the real build, step by step. */
function build(s: TycoonState, id: ExpansionId): TycoonState | string {
  const f = fac(s);
  const mode = modeOf(f, id);
  if (id === "bath") {
    if (mode === "improve") {
      const room = caps(f).bath!.room.uid;
      return placeIn(s, room, "bath_tub") ?? "The bath room is full — build a bigger one by hand to add a station.";
    }
    const at = attachRoom(s, 4, 3);
    if (!at) return "There's no free spot next to your rooms — buy more land or build by hand.";
    const typed = setRoomType(at.state, at.uid, "bath");
    if (!typed.ok) return typed.error;
    const done = placeIn(typed.state, at.uid, "bath_tub");
    return done && working(done, at.uid) ? done : "The new bath room couldn't be set up there.";
  }
  if (mode === "improve") {
    const target = improveTarget(f);
    if (!target) return "There's no playroom to improve.";
    return placeIn(s, target, "dog_bed") ?? placeIn(s, target, "toy_bin") ?? "That playroom is full of furniture already.";
  }
  const at = attachRoom(s, 3, 3);
  if (!at) return "There's no free spot next to your rooms — buy more land or build by hand.";
  const typed = setRoomType(at.state, at.uid, "playroom", neededGroup(f));
  if (!typed.ok) return typed.error;
  let out: TycoonState | null = typed.state;
  for (let i = 0; i < 3 && out; i++) out = placeIn(out, at.uid, "dog_bed");
  return out && working(out, at.uid) ? out : "The new playroom couldn't be set up there.";
}

const quotes = new Map<string, { cost: number; upkeep: number } | string>();
function quote(s: TycoonState, id: ExpansionId): { cost: number; upkeep: number } | string {
  const f = fac(s);
  const key = `${id}|${level(s) >= EXPANSION_LEVEL}|${f.land.join()}|${f.rooms.map((r) => `${r.uid}${r.c},${r.r},${r.w},${r.d},${r.type},${r.group},${r.doors.length}`).join(";")}|${f.items.map((i) => i.uid).join()}|${neededGroup(f)}`;
  const hit = quotes.get(key);
  if (hit !== undefined) return hit;
  const after = build({ ...s, coins: RICH }, id);
  const q = typeof after === "string" ? after : { cost: RICH - after.coins, upkeep: facilityUpkeep(fac(after)) - facilityUpkeep(f) };
  if (quotes.size > 200) quotes.clear();
  quotes.set(key, q);
  return q;
}

export function expansionOptions(s: TycoonState): ExpansionOption[] {
  const f = fac(s);
  const wage = WAGES[f.wage];
  const lvl = level(s) >= EXPANSION_LEVEL;
  return (["playroom", "bath"] as ExpansionId[]).map((id) => {
    const mode = modeOf(f, id);
    const q = lvl ? quote(s, id) : null;
    const cost = q && typeof q !== "string" ? q.cost : 0;
    const upkeep = q && typeof q !== "string" ? q.upkeep : 0;
    const why = !lvl ? `Unlocks at level ${EXPANSION_LEVEL}.` : typeof q === "string" ? q : s.coins < cost ? `${(cost - s.coins).toLocaleString("en-US")} more coins needed.` : null;
    const target = id === "playroom" && mode === "improve" ? improveTarget(f) : null;
    const group = groupName(neededGroup(f));
    const text =
      id === "playroom"
        ? mode === "new"
          ? { title: `Playroom wing for ${group} pups`, capacity: `+3 spots for ${group} pups`, unlocks: `Take ${group} families instead of turning them away — each spot can earn about ${f.prices.daycare} coins a day.` }
          : { title: `Improve ${target ? roomName(f, target) : "a playroom"}`, capacity: `+1 spot (or more fun when it's full of beds)`, unlocks: `One more family a day in your busiest playroom.` }
        : mode === "new"
          ? { title: "Bath station", capacity: "1 bath station (one 40-minute bath at a time)", unlocks: `Families can book baths (about 3 in 10 do, ${f.prices.bath} coins each), and exit baths at pickup.` }
          : { title: "Second bath station", capacity: "+1 bath station — two baths at once", unlocks: "The bath queue moves twice as fast, so fewer families wait at pickup." };
    const staffing =
      id === "playroom"
        ? `Pups here need play: tap Play yourself, or a daycare attendant (${wage} coins a day) can look after it.`
        : `Each bath takes someone 40 minutes: tap Bath yourself, or a bath attendant (${wage} coins a day). Two baths at once need two bath attendants.`;
    return { id, mode, ...text, cost, upkeep, staffing, available: why === null, why };
  });
}

/** Buys the expansion for game coins (refused, with nothing changed, if it isn't possible or affordable). */
export function buyExpansion(s: TycoonState, id: ExpansionId): TResult {
  const o = expansionOptions(s).find((x) => x.id === id);
  if (!o) return { ok: false, error: "Pick an expansion." };
  if (!o.available) return { ok: false, error: o.why ?? "That expansion isn't possible right now." };
  const after = build(s, id);
  if (typeof after === "string") return { ok: false, error: after };
  return { ok: true, state: after, msg: `${o.title} — done! It's open and working.` };
}
