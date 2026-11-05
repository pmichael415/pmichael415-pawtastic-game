// PAWtastic Daycare Tycoon — the tour's one-tap choices (Stage A), made of the normal game actions so they follow
// every rule: building a playroom with a dog spot for the decision pup, or letting a pup rest and go home free.
import { groupName, type GroupId } from "@/game/engine";
import { placeFirstFree, placeThing, setRoomType } from "./build";
import { attachedRoom, changeOf } from "./expansion";
import { today } from "./business";
import { roomTiles } from "./grid";
import { checkout, toCalm } from "./run";
import { fac, withFac } from "./state";
import type { Facility, TResult, TycoonState } from "./types";


/** Exactly what the guide's "Build a playroom" builds — the room, its door, the bed and where — and the total. */
export type PlayroomQuote = { group: GroupId } & ReturnType<typeof changeOf> & { cost: number };
const spentToday = (s: TycoonState) => today(fac(s)).expenses.building;
export function playroomQuote(s: TycoonState, group: GroupId): PlayroomQuote | null {
  const rich = { ...s, coins: Math.max(s.coins, 1_000_000) };
  const r = makePlayroom(rich, group);
  return r.ok ? { group, ...changeOf(rich, r.state), cost: spentToday(r.state) - spentToday(rich) } : null;
}

/**
 * A playroom for this group plus one Dog Bed inside it: joined to the building (next to a room, with a door into it)
 * when there's a spot, else at the first free spot on the lot with its door and path. Given `shown` (the quote on the
 * guide's button), it builds exactly that or nothing (audit gap E): a changed plan charges nothing.
 */
export function buildPlayroomFor(s: TycoonState, group: GroupId, shown?: PlayroomQuote): TResult {
  if (shown) {
    const now = playroomQuote(s, group);
    if (!now || JSON.stringify(now) !== JSON.stringify(shown)) return { ok: false, error: now ? `The playroom you saw can't be built as shown any more — it's now ${now.cost} coins. Check it and confirm again.` : "There's no spot for that playroom any more." };
    if (s.coins < shown.cost) return { ok: false, error: `${shown.cost - s.coins} more coins needed.` };
    const r = makePlayroom(s, group);
    if (r.ok && spentToday(r.state) - spentToday(s) !== shown.cost) return { ok: false, error: "The price changed — check it and try again." };
    return r;
  }
  return makePlayroom(s, group);
}
function makePlayroom(s: TycoonState, group: GroupId): TResult {
  const joined = attachedRoom(s, 3, 3);
  const typed = joined ? setRoomType(joined.state, joined.uid, "playroom", group) : null;
  const r = typed && typed.ok ? typed : placeFirstFree(s, { room: "playroom", group });
  if (!r.ok) return r;
  const room = fac(r.state).rooms.at(-1)!;
  for (const t of roomTiles(room)) {
    const b = placeThing(r.state, "dog_bed", t.c, t.r, 0);
    if (b.ok) return { ok: true, state: b.state, msg: `New ${groupName(group)} playroom, with a bed, is ready.` };
  }
  return { ok: true, state: r.state, msg: `New ${groupName(group)} playroom built — add a Dog Bed so a pup can stay.` };
}

/** What buildPlayroomFor would cost right now (null if it can't be built). */
export function playroomCost(s: TycoonState, group: GroupId): number | null {
  return playroomQuote(s, group)?.cost ?? null;
}

/** Checks the pup in if needed, lets them settle in the calm room, and sends them home free of charge. */
export function restAtHome(s: TycoonState, dogId: string): TResult {
  let out = s;
  const dog = fac(s).dogs.find((d) => d.id === dogId);
  if (!dog) return { ok: false, error: "That pup already went home." };
  if (!dog.checkedIn) {
    // Never checked in: the family takes the pup home from the lobby. No check-in is counted, so no supplies are
    // charged for this visit — resting is free.
    const f = fac(out);
    return {
      ok: true,
      state: withFac(out, { ...f, dogs: f.dogs.filter((d) => d.id !== dogId) }),
      msg: `${dog.name} is resting at home today — no charge, and everyone stayed safe.`,
    };
  }
  if (fac(out).dogs.find((d) => d.id === dogId)?.place.kind !== "calm") {
    const r = toCalm(out, dogId);
    if (!r.ok) return r;
    out = r.state;
  }
  const r = checkout(out, dogId, false);
  return r.ok ? { ...r, msg: `${dog.name} rested in the calm room and went home happy — no charge, and everyone stayed safe.` } : r;
}
