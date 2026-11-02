// PAWtastic Daycare Tycoon — the guided tour (Stage A, docs/superpowers/specs/2026-11-02-tycoon-replayability-design.md
// §3.2). Each beat completes when the real game state shows it; scripted pups arrive on cue; random drop-offs and the
// day clock wait until the tour reaches free play. Nothing is forced or timed, and skipping is always allowed.
import { BREEDS, groupOf, type GroupId } from "@/game/engine";
import { earn } from "./business";
import { GUIDE_REWARD } from "./catalog";
import { canOpen, caps } from "./connect";
import { quickStart } from "./start";
import { fac, withFac } from "./state";
import type { Facility, TDog, TourBeat, TourUpgrade, TycoonState } from "./types";

export const TOUR_ORDER: TourBeat[] = ["meet", "checkin", "place", "play", "checkout", "upgrade", "benefit", "decision", "goals"];
export const TOUR_DOGS = { first: "Biscuit", second: "Daisy", third: "Rocket" } as const;

const named = (f: Facility, name: string) => f.dogs.find((d) => d.name === name) ?? null;

/** The tour is running and holding random drop-offs and the day clock (until free play). */
export const tourHolds = (s: TycoonState) => !!s.tour && !s.tour.done && !s.tour.skipped;

/** The group of the first working playroom (the first pup should fit it), else Small & Gentle. */
export function firstDogGroup(f: Facility): GroupId {
  return caps(f).playrooms.find((p) => p.spots > 0)?.room.group ?? "small-gentle";
}

/** A group no working playroom takes — the decision pup — or null if every group has a room. */
function uncoveredGroup(f: Facility): GroupId | null {
  const have = new Set(caps(f).playrooms.map((p) => p.room.group));
  return (["large-active", "large-gentle", "small-active", "small-gentle"] as GroupId[]).find((g) => !have.has(g)) ?? null;
}

const BREED_FOR: Record<"small" | "large", number[]> = { small: [1, 4, 5], large: [0, 3, 2] };

/** A scripted pup dropped off in the lobby (once, by name). Null if there's no working lobby with room. */
function dropOff(s: TycoonState, name: string, group: GroupId, pick: number): TycoonState | null {
  const f = fac(s);
  const c = caps(f);
  if (!c.lobby || named(f, name)) return null;
  if (f.dogs.filter((d) => d.place.kind === "lobby").length >= c.waiting) return null;
  const [size, temper] = group.split("-") as ["small" | "large", "gentle" | "active"];
  const breed = BREED_FOR[size][pick % 3]!;
  const dog: TDog = {
    id: "d" + s.seq,
    name,
    breed: breed < BREEDS.length ? breed : 0,
    size,
    temper,
    visits: 1,
    place: { kind: "lobby" },
    checkedIn: false,
    happiness: 72,
    clean: 70,
    boarding: false,
    played: 0,
    bathed: false,
  };
  return withFac({ ...s, seq: s.seq + 1 }, { ...f, dogs: [...f.dogs, dog] });
}

/** Whether the current beat is complete in this state. Pups that went home early never leave the tour stuck. */
function complete(s: TycoonState, beat: TourBeat): boolean {
  const f = fac(s);
  const first = named(f, TOUR_DOGS.first);
  switch (beat) {
    case "meet":
      return !!first;
    case "checkin":
      return !first || first.checkedIn;
    case "place":
      return !first || first.place.kind === "room" || first.place.kind === "bed";
    case "play":
      return !first || first.played >= 1;
    case "checkout":
      return !first;
    case "upgrade":
      return f.items.some((i) => i.kind === "toy_bin" || i.kind === "play_yard");
    case "benefit":
      return !named(f, TOUR_DOGS.second);
    case "decision": {
      const r = named(f, TOUR_DOGS.third);
      if (!r) return true;
      if (r.place.kind !== "room") return false;
      const room = f.rooms.find((x) => x.uid === (r.place as { room: string }).room);
      return room?.group === groupOf(r);
    }
    case "goals":
      return false;
  }
}

/** What happens on reaching a beat: the next scripted pup, or the reward and free play. */
function enter(s: TycoonState, beat: TourBeat): TycoonState {
  const f = fac(s);
  if (beat === "benefit") return dropOff(s, TOUR_DOGS.second, firstDogGroup(f), 1) ?? s;
  if (beat === "decision") {
    const g = uncoveredGroup(f);
    return (g && dropOff(s, TOUR_DOGS.third, g, 1)) || s;
  }
  if (beat === "goals") {
    const done = { ...s, tour: { ...s.tour!, done: true } };
    if (s.guide.done || s.guide.skipped) return done;
    return earn({ ...done, guide: { ...done.guide, done: true } }, { bonus: GUIDE_REWARD });
  }
  if (beat === "upgrade") {
    const kind = fac(s).items.find((i) => i.kind === "toy_bin" || i.kind === "play_yard")?.kind as TourUpgrade | undefined;
    return kind && !s.tour!.upgrade ? { ...s, tour: { ...s.tour!, upgrade: kind } } : s;
  }
  return s;
}

/**
 * Lets the tour catch up with the game: drops Biscuit off when a scratch daycare first opens, then moves through every
 * beat the state shows as done. Returns the beats reached (for measurement).
 */
export function syncTour(s: TycoonState, _now: number): { state: TycoonState; reached: TourBeat[] } {
  if (!s.tour || s.tour.done || s.tour.skipped) return { state: s, reached: [] };
  let out = s;
  const reached: TourBeat[] = [];
  if (out.tour!.beat === "meet" && !named(fac(out), TOUR_DOGS.first)) {
    const f = fac(out);
    if (f.open && canOpen(f).ok) out = dropOff(out, TOUR_DOGS.first, firstDogGroup(f), 0) ?? out;
  }
  for (let guard = 0; guard < TOUR_ORDER.length && !out.tour!.done && complete(out, out.tour!.beat); guard++) {
    const next = TOUR_ORDER[TOUR_ORDER.indexOf(out.tour!.beat) + 1]!;
    out = enter({ ...out, tour: { ...out.tour!, beat: next } }, next);
    reached.push(next);
  }
  return { state: out, reached };
}

/** Starts the tour. Quick start builds the small daycare, opens it and drops Biscuit off; scratch starts on the lot. */
export function startTour(s: TycoonState, mode: "quick" | "scratch", now: number): TycoonState {
  let out = s;
  if (mode === "quick") {
    const q = quickStart(s);
    if (q.ok) out = withFac(q.state, { ...fac(q.state), open: true });
  }
  out = { ...out, tour: { mode, beat: "meet", startedAt: now, upgrade: null, done: false, skipped: false } };
  return syncTour(out, now).state;
}

/** The upgrade the player picked at the "upgrade" beat. */
export function chooseUpgrade(s: TycoonState, kind: TourUpgrade): TycoonState {
  return s.tour && !s.tour.done ? { ...s, tour: { ...s.tour, upgrade: kind } } : s;
}

/** Skips the tour (and the old checklist) for good. Nothing is paid; drop-offs and the clock run as normal. */
export function skipTour(s: TycoonState): TycoonState {
  return { ...s, tour: s.tour ? { ...s.tour, skipped: true } : null, guide: { ...s.guide, skipped: true } };
}

/**
 * Short of coins for any first upgrade: carry on to the decision instead (Daisy's benefit beat needs an upgrade).
 * Nothing is paid or charged; the guide's reward still comes at the end.
 */
export function passUpgrade(s: TycoonState): TycoonState {
  if (!s.tour || s.tour.beat !== "upgrade" || s.tour.done || s.tour.skipped) return s;
  return syncTour(enter({ ...s, tour: { ...s.tour, beat: "decision" } }, "decision"), Date.now()).state;
}

/** Whether the daycare has one of the tour's upgrades (so the benefit beat really happened). */
export const hasTourUpgrade = (s: TycoonState) => fac(s).items.some((i) => i.kind === "toy_bin" || i.kind === "play_yard");

