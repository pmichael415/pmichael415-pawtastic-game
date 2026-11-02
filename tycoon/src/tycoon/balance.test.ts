// First-week balance check (spec §7): a deterministic bot plays the guided build for 7 game days.
import { describe, expect, it } from "vitest";
import { groupOf, mulberry, seedFrom } from "@/game/engine";
import type { GroupId } from "@/game/engine";
import { addDoor, buyLand, drawRoom, placeThing, setRoomType } from "./build";
import { caps } from "./connect";
import { level } from "./progress";
import { assignBed, assignRoom, bath, checkIn, checkout, clean, playtime, setOpen, tick } from "./run";
import { fac, newTycoon } from "./state";
import { guidedBuild, ok } from "./testkit";
import type { TResult, TycoonState } from "./types";

const REPLAY_BELOW = 70; // the bot plays with a pup again below this happiness
const MOP_BELOW = 55; // and mops below this cleanliness
const BUFFER = 250; // the bot keeps this many coins in hand for the night's expenses
/** 3 × 3 rooms north of (or beside) the guided build, each with a door into a connected room. */
const SLOTS = [
  { c: 16, r: 19, door: { side: "S" as const, i: 1 } },
  { c: 20, r: 19, door: { side: "S" as const, i: 1 } },
  { c: 13, r: 19, door: { side: "S" as const, i: 1 } },
  { c: 23, r: 22, door: { side: "W" as const, i: 1 } },
];

type Log = { day: number; income: number; expenses: number; building: number; profit: number; coins: number; level: number; dogs: number };

function tryDo(s: TycoonState, r: TResult): TycoonState {
  return r.ok ? r.state : s;
}

/** Builds a 3 × 3 room in the next free slot; returns null if it can't. */
function buildRoom(s: TycoonState, slot: number, setup: (s: TycoonState, uid: string) => TycoonState | null): TycoonState | null {
  const sl = SLOTS[slot];
  if (!sl) return null;
  const a = drawRoom(s, sl.c, sl.r, 3, 3);
  if (!a.ok) return null;
  const uid = fac(a.state).rooms.at(-1)!.uid;
  const d = addDoor(a.state, uid, sl.door);
  if (!d.ok) return null;
  return setup(d.state, uid);
}

function play(): { logs: Log[]; minCoins: number; reachedL3: number | null; reachedL5: number | null; guidedCost: number } {
  const rand = mulberry(seedFrom("week1"));
  let s = guidedBuild(newTycoon(0));
  const guidedCost = fac(s).ledger.at(-1)!.expenses.building;
  s = ok(setOpen(s, true));
  let slot = 0;
  let minCoins = s.coins;
  let reachedL3: number | null = null;
  let reachedL5: number | null = null;
  let hasBath = false;
  let pit = false;
  let water = false;
  const logs: Log[] = [];

  const afford = (price: number) => s.coins >= price + BUFFER;

  while (fac(s).day <= 7) {
    const dayBefore = fac(s).day;
    s = tick(s, 1, rand);
    const f = fac(s);
    if (f.day !== dayBefore) {
      const day = f.ledger.at(-2)!;
      const r = f.report!;
      logs.push({ day: r.day, income: r.income, expenses: r.expenses, building: day.expenses.building, profit: r.profit, coins: s.coins, level: level(s), dogs: r.checkouts });
      minCoins = Math.min(minCoins, s.coins);
      continue;
    }
    minCoins = Math.min(minCoins, s.coins);
    const when = f.day + (f.clockMin - 420) / 660;
    if (reachedL3 === null && level(s) >= 3) reachedL3 = when;
    if (reachedL5 === null && level(s) >= 5) reachedL5 = when;

    // care for every pup
    for (const d of fac(s).dogs) {
      if (!d.checkedIn) s = tryDo(s, checkIn(s, d.id));
    }
    for (const d of fac(s).dogs) {
      if (d.place.kind !== "lobby" || !d.checkedIn) continue;
      const c = caps(fac(s));
      if (d.boarding) {
        const free = c.beds.find((b) => !fac(s).dogs.some((x) => x.place.kind === "bed" && x.place.bed === b.bed));
        if (free) s = tryDo(s, assignBed(s, d.id, free.bed));
        continue;
      }
      const g: GroupId = groupOf(d);
      const fit = c.playrooms.find((p) => p.group === g && fac(s).dogs.filter((x) => x.place.kind === "room" && x.place.room === p.room.uid).length < p.spots);
      if (fit) {
        s = tryDo(s, assignRoom(s, d.id, fit.room.uid));
        continue;
      }
      // building one more playroom for a group when none exists for it
      if (!c.playrooms.some((p) => p.group === g) && afford(330 + 30 + 120)) {
        const built = buildRoom(s, slot, (t, uid) => {
          let u = tryDo(t, setRoomType(t, uid, "playroom", g));
          const sl = SLOTS[slot]!;
          for (const [dc, dr] of [[0, 0], [2, 0]]) u = tryDo(u, placeThing(u, "dog_bed", sl.c + dc!, sl.r + dr!, 0));
          return u;
        });
        if (built) {
          s = built;
          slot++;
          s = tryDo(s, assignRoom(s, d.id, fac(s).rooms.at(-1)!.uid));
        }
      }
    }
    // a reasonable player: plays again when a pup gets bored, mops before the rooms look dirty, starts booked baths
    for (const d of fac(s).dogs) {
      if ((d.place.kind === "room" || d.place.kind === "bed") && !d.bathing && (d.played === 0 || d.happiness < REPLAY_BELOW)) s = tryDo(s, playtime(s, d.id));
      const now = fac(s).dogs.find((x) => x.id === d.id);
      if (hasBath && now && now.checkedIn && !now.bathed && !now.bathing && now.place.kind !== "lobby") s = tryDo(s, bath(s, d.id));
    }
    if (fac(s).cleanliness < MOP_BELOW) s = tryDo(s, clean(s));
    // each family is checked out when they arrive (a bath still running finishes first); closing collects the rest
    for (const d of fac(s).dogs) if (d.checkedIn && d.visit?.ownerHere != null && !d.bathing) s = tryDo(s, checkout(s, d.id, false));

    // building plan
    if (!hasBath && level(s) >= 2 && afford(330 + 30 + 400)) {
      const built = buildRoom(s, slot, (t, uid) => {
        const u = setRoomType(t, uid, "bath");
        if (!u.ok) return null;
        const tub = placeThing(u.state, "bath_tub", SLOTS[slot]!.c, SLOTS[slot]!.r, 0);
        return tub.ok ? tub.state : null;
      });
      if (built) {
        s = built;
        slot++;
        hasBath = true;
      }
    }
    if (!pit && level(s) >= 2 && afford(300)) {
      const r = placeThing(s, "ball_pit", 11, 25, 0);
      if (r.ok) (s = r.state), (pit = true);
    }
    if (!water && afford(80)) {
      const r = placeThing(s, "water", 13, 26, 0);
      if (r.ok) (s = r.state), (water = true);
    }
    if (level(s) >= 3 && !fac(s).land.includes("west") && afford(1500)) s = tryDo(s, buyLand(s, "west"));
  }
  return { logs, minCoins, reachedL3, reachedL5, guidedCost };
}

describe("first week", () => {
  const run = play();
  it("prints the ledger", () => {
    console.log(`guided build: ${run.guidedCost}; level 3 at day ${run.reachedL3?.toFixed(2)}, level 5 at day ${run.reachedL5?.toFixed(2)}; min coins ${run.minCoins}`);
    console.table(run.logs);
    expect(run.logs).toHaveLength(7);
  });
  it("the guided build costs at most 1,700", () => {
    expect(run.guidedCost).toBeLessThanOrEqual(1700);
  });
  it("day 1 and day 2 break even before building", () => {
    for (const d of run.logs.slice(0, 2)) expect(d.profit + d.building).toBeGreaterThanOrEqual(0);
  });
  it("every day's non-building profit is at least 0", () => {
    for (const d of run.logs) expect(d.profit + d.building).toBeGreaterThanOrEqual(0);
  });
  it("level 3 by day 4.5 and level 5 by day 7.5", () => {
    expect(run.reachedL3).not.toBeNull();
    expect(run.reachedL3!).toBeLessThanOrEqual(4.5);
    expect(run.reachedL5).not.toBeNull();
    expect(run.reachedL5!).toBeLessThanOrEqual(7.5);
  });
  it("coins never drop below 0", () => {
    expect(run.minCoins).toBeGreaterThanOrEqual(0);
  });
});
