// PAWtastic Daycare Tycoon — the tour's one-tap choices (Stage A), made of the normal game actions so they follow
// every rule: building a playroom with a dog spot for the decision pup, or letting a pup rest and go home free.
import { groupName, type GroupId } from "@/game/engine";
import { placeFirstFree, placeThing } from "./build";
import { roomTiles } from "./grid";
import { checkout, toCalm } from "./run";
import { fac, withFac } from "./state";
import type { Facility, TResult, TycoonState } from "./types";

const spent = (f: Facility) => f.rooms.reduce((n, r) => n + r.spent, 0) + f.items.reduce((n, i) => n + i.spent, 0);

/** A playroom for this group (first free spot, with its door and path) plus one Dog Bed inside it. */
export function buildPlayroomFor(s: TycoonState, group: GroupId): TResult {
  const r = placeFirstFree(s, { room: "playroom", group });
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
  const r = buildPlayroomFor({ ...s, coins: Math.max(s.coins, 1_000_000) }, group);
  return r.ok ? spent(fac(r.state)) - spent(fac(s)) : null;
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
