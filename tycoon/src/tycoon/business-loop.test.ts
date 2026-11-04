// Zero-liquidity recovery scenario (audit finding 7 relabelled it; it is NOT a new game). Quick start, then every
// starting coin removed (0 coins) and the starter accounting cleared, so whatever the daycare builds later can only be
// paid for by what it earns from there. A deterministic player presses each pup's next-action button (the same rules
// staff use). The proof that starts from a real new game, with nothing injected or erased, is business-loop-real.test.ts.
import { describe, expect, it } from "vitest";
import { groupOf, mulberry, seedFrom } from "@/game/engine";
import type { GroupId } from "@/game/engine";
import { assessVisit } from "./assess";
import { SUPPLY_COST, dayExpenses, facilityUpkeep, upkeepOf } from "./business";
import { EXPANSION_LEVEL, askedToday, buyExpansion, expansionOptions } from "./expansion";
import { nextAction } from "./nextAction";
import { level, levelReward } from "./progress";
import { assignBed, assignRoom, bath, checkIn, checkout, clean, createArrival, playtime, setOpen, tick } from "./run";
import { quickStart } from "./start";
import { fac, newTycoon, withFac } from "./state";
import { hire, letGo } from "./team";
import { ok, richState } from "./testkit";
import type { TReport, TycoonState } from "./types";

type Paid = { day: number; min: number; dog: string; group: GroupId; room: string | null; total: number; incomeDelta: number };
type Bought = { day: number; min: number; group: GroupId; room: string; cost: number; coinsBefore: number; earnedSoFar: number; runningSoFar: number };

/** A player who presses each pup's next-action button; every payment is recorded with what the ledger gained. */
function serve(s: TycoonState, paid: Paid[]): TycoonState {
  for (const d0 of fac(s).dogs) {
    const f = fac(s);
    const d = f.dogs.find((x) => x.id === d0.id);
    if (!d) continue;
    const n = nextAction(f, d);
    const r =
      n.id === "checkin" ? checkIn(s, d.id)
      : n.id === "room" && n.room ? assignRoom(s, d.id, n.room)
      : n.id === "bed" && n.bed ? assignBed(s, d.id, n.bed)
      : n.id === "bath" ? bath(s, d.id)
      : n.id === "play" ? playtime(s, d.id)
      : null;
    if (r?.ok) s = r.state;
    if (n.id === "checkout") {
      const room = d.place.kind === "room" || d.place.kind === "bed" ? d.place.room : null;
      const total = assessVisit(f, d, {}).total;
      const income0 = Object.values(f.ledger.at(-1)!.income).reduce((a, b) => a + b, 0);
      const lv0 = level(s);
      const out = checkout(s, d.id, false);
      if (out.ok) {
        s = out.state;
        const g = fac(s);
        const income1 = Object.values(g.ledger.at(-1)!.income).reduce((a, b) => a + b, 0);
        const receipt = g.outcomes.at(-1)!; // what the family's receipt says they paid
        expect(receipt.total).toBeGreaterThanOrEqual(total); // the visit, plus any loyalty bonus, itemized
        // a level reached by this checkout pays its own reward (bonus income, not part of the family's bill)
        let levelUp = 0;
        for (let n = lv0 + 1; n <= level(s); n++) levelUp += levelReward(n);
        // and a loyalty milestone's reward is its own (bonus income, shown apart from the bill)
        paid.push({ day: f.day, min: f.clockMin, dog: d.name, group: groupOf(d), room, total: receipt.total, incomeDelta: income1 - income0 - levelUp - (receipt.reward?.amount ?? 0) });
      }
    }
  }
  if (fac(s).cleanliness < 55) {
    const r = clean(s);
    if (r.ok) s = r.state;
  }
  return s;
}

function play(days: number) {
  const rand = mulberry(seedFrom("earn-reinvest-expand"));
  let s: TycoonState = { ...ok(quickStart(newTycoon(0))), tour: null, coins: 0 };
  // the starter layout (and its level-up reward) came out of the starting coins, all of them gone: the books start clean
  const f0 = fac(s);
  s = withFac(s, { ...f0, ledger: f0.ledger.map((l) => ({ ...l, income: { ...l.income, bonus: 0 }, expenses: { ...l.expenses, building: 0 } })) });
  s = ok(setOpen(s, true));
  const paid: Paid[] = [];
  const reports: (TReport & { coinsAfter: number; coinsBefore: number; expectedAfter: number })[] = [];
  let bought: Bought | null = null;
  let coinsAtDayStart = s.coins;
  while (fac(s).day <= days) {
    const day = fac(s).day;
    s = tick(s, 1, rand);
    if (fac(s).day !== day) {
      const r = fac(s).report!;
      reports.push({ ...r, coinsBefore: coinsAtDayStart, coinsAfter: s.coins, expectedAfter: coinsAtDayStart + r.profit });
      coinsAtDayStart = s.coins;
      continue;
    }
    s = serve(s, paid);
    // reinvest: once families have asked for a kind of pup with no room here, and the earnings cover a playroom wing
    // for them plus tonight's running costs
    if (!bought && level(s) >= EXPANSION_LEVEL) {
      const want = askedToday(fac(s))[0];
      const wing = expansionOptions(s).find((o) => o.id === "playroom");
      const tonight = Object.values(dayExpenses(fac(s))).reduce((a, b) => a + b, 0);
      if (want && want.n >= 2 && wing && wing.mode === "new" && s.coins >= wing.cost + tonight) {
        const earned = reports.reduce((a, r) => a + r.income, 0) + Object.values(fac(s).ledger.at(-1)!.income).reduce((a, b) => a + b, 0);
        const running = reports.reduce((a, r) => a + r.running, 0);
        const coinsBefore = s.coins;
        const r = buyExpansion(s, "playroom");
        if (r.ok) {
          s = r.state;
          const room = fac(s).rooms.at(-1)!;
          bought = { day: fac(s).day, min: fac(s).clockMin, group: room.group!, room: room.uid, cost: coinsBefore - s.coins, coinsBefore, earnedSoFar: earned, runningSoFar: running };
        }
      }
    }
  }
  return { s, paid, reports, bought };
}

describe("zero-liquidity recovery scenario: from 0 coins, earn → cover costs → reinvest → serve more", () => {
  const run = play(6);

  it("prints the story", () => {
    console.log("payments:", run.paid.length, "· first:", run.paid[0]);
    console.table(run.reports.map((r) => ({ day: r.day, income: r.income, running: r.running, invested: r.invested, profit: r.profit, coins: r.coinsAfter })));
    console.log("expansion:", run.bought);
    expect(run.reports.length).toBeGreaterThanOrEqual(5);
  });

  it("a visit earns coins: the first checkout pays exactly what its receipt says, once, into today's income", () => {
    const first = run.paid[0]!;
    expect(first.total).toBeGreaterThan(0);
    expect(first.incomeDelta).toBe(first.total);
    for (const p of run.paid) expect(p.incomeDelta).toBe(p.total); // every payment, exactly once
  });

  it("running costs are charged every night, and coins follow the ledger exactly (income − every expense)", () => {
    for (const r of run.reports) {
      expect(r.expenses - r.invested).toBeGreaterThan(0); // wages, upkeep and supplies were charged
      expect(r.coinsAfter).toBe(r.expectedAfter);
    }
  });

  it("starting from 0 coins, the first expansion is bought with earned profits, within the first few days", () => {
    const b = run.bought!;
    expect(b).not.toBeNull();
    expect(b.cost).toBeGreaterThan(0);
    expect(b.coinsBefore).toBeGreaterThanOrEqual(b.cost); // every coin here was earned: the daycare started at 0
    expect(b.earnedSoFar).toBeGreaterThan(b.cost);
    expect(b.day).toBeLessThanOrEqual(4);
  });

  it("the new playroom serves demand that was turned away before: its families now pay, from that room", () => {
    const b = run.bought!;
    const before = run.paid.filter((p) => p.day < b.day || (p.day === b.day && p.min < b.min));
    const after = run.paid.filter((p) => !before.includes(p));
    expect(before.filter((p) => p.group === b.group)).toHaveLength(0); // nobody of that kind could stay before
    const served = after.filter((p) => p.room === b.room);
    console.log(`new room: ${served.length} families paid ${served.reduce((a, p) => a + p.total, 0)} from it; ${before.length} payments before it, ${after.length} after`);
    expect(served.length).toBeGreaterThanOrEqual(3);
    expect(served.every((p) => p.group === b.group && p.total > 0)).toBe(true);
    // and it pays its way: what it took in beats what it cost to run over those days — the room's upkeep and its
    // furniture's, the supplies for each check-in, and wages for anyone hired for it (nobody is, in this scenario)
    const f = fac(run.s);
    const daysOpen = run.reports.filter((r) => r.day >= b.day).length;
    const room = f.rooms.find((r) => r.uid === b.room)!;
    const upkeep = (upkeepOf(room) + f.items.filter((i) => i.room === b.room).reduce((a, i) => a + upkeepOf(i), 0)) * daysOpen;
    const supplies = SUPPLY_COST[f.supplies] * served.length;
    expect(f.staff.filter((x) => !x.founder)).toHaveLength(0);
    expect(served.reduce((a, p) => a + p.total, 0) - upkeep - supplies).toBeGreaterThan(0);
  });
});

describe("a receipt explains what each line earned", () => {
  it("daycare pay follows happiness; tips follow how the family felt and the daycare's Appeal", () => {
    const { paid, s: r } = play(1);
    const receipts = fac(r).outcomes.filter((o) => o.how === "checkout");
    expect(paid.length).toBeGreaterThan(0);
    const daycare = receipts.flatMap((o) => o.lines).filter((l) => l.label.startsWith("Daycare") && l.amount > 0);
    expect(daycare.length).toBeGreaterThan(0);
    for (const l of daycare) expect(l.label).toMatch(new RegExp(`^Daycare — \\d+% happy, so ${l.amount} of ${fac(r).prices.daycare}`));
    const tips = receipts.flatMap((o) => o.lines).filter((l) => /^Tip/.test(l.label) && !/told them/.test(l.label));
    for (const l of tips) expect(l.label).toMatch(/^Tip — (delighted|happy) with the day \(Appeal \d+\)$/);
  });
});

describe("boarding is charged per night (audit finding 7: this used to be claimed without a boarder)", () => {
  /** A boarder dropped off in the afternoon, checked in, put in a bed (or not), then picked up the next morning. */
  function overnight(bed: boolean) {
    let s: TycoonState = ok(setOpen({ ...richState(), tour: null }, true));
    s = withFac(s, { ...fac(s), clockMin: 14 * 60 });
    s = ok(createArrival(s, mulberry(seedFrom("boarder")), true));
    const pup = fac(s).dogs.at(-1)!;
    expect(pup.boarding).toBe(true);
    s = ok(checkIn(s, pup.id));
    const n = nextAction(fac(s), fac(s).dogs.find((d) => d.id === pup.id)!);
    if (bed) s = ok(assignBed(s, pup.id, n.bed!));
    else return { refused: assignRoom(s, pup.id, fac(s).rooms.find((r) => r.type === "playroom")!.uid) };
    const day = fac(s).day;
    const rand = mulberry(seedFrom("overnight"));
    for (let i = 0; i < 24 * 60 && fac(s).dogs.find((d) => d.id === pup.id)?.visit?.ownerHere == null; i++) s = tick(s, 1, rand);
    const income0 = fac(s).ledger.at(-1)!.income.boarding;
    s = ok(checkout(s, pup.id, false));
    return { s, pup, day, income0, refused: null };
  }
  it("a boarder who slept in a bed pays one night's boarding the next morning, recorded as boarding income", () => {
    const { s, pup, day, income0 } = overnight(true) as { s: TycoonState; pup: { name: string }; day: number; income0: number };
    expect(fac(s).day).toBe(day + 1); // picked up the morning after
    const receipt = fac(s).outcomes.find((o) => o.dog === pup.name)!;
    const line = receipt.lines.find((l) => /^Boarding/.test(l.label))!;
    expect(line).toMatchObject({ label: "Boarding — 1 night", amount: fac(s).prices.boarding });
    expect(fac(s).ledger.at(-1)!.income.boarding - income0).toBe(fac(s).prices.boarding);
  });
  it("the night has to be in a boarding bed: a playroom instead is refused", () => {
    const { refused } = overnight(false);
    expect(refused?.ok).toBe(false);
    if (refused && !refused.ok) expect(refused.error).toMatch(/boarding bed/);
  });
});

describe("the bill is what the family paid; game rewards are shown apart (audit finding 2)", () => {
  it("every receipt's total is the sum of its lines; a loyalty bonus is a separate reward, not part of the bill", () => {
    const { s } = play(6);
    const receipts = fac(s).outcomes;
    for (const o of receipts) expect(o.total).toBe(o.lines.reduce((a, l) => a + l.amount, 0));
    expect(receipts.some((o) => o.reward && o.reward.amount > 0)).toBe(true);
    for (const o of receipts) expect(o.lines.some((l) => /Loyalty bonus/.test(l.label))).toBe(false);
  });
});

describe("more rooms are an opportunity, not a guarantee", () => {
  it("a room costs upkeep from its first night, and earns only when pups are served in it", () => {
    const s = { ...ok(quickStart(newTycoon(0))), tour: null, coins: 5000, xp: 1000 };
    const t = ok(buyExpansion(s, "playroom"));
    expect(facilityUpkeep(fac(t))).toBeGreaterThan(facilityUpkeep(fac(s)));
    expect(fac(t).ledger.at(-1)!.income).toEqual(fac(s).ledger.at(-1)!.income);
  });
});

describe("staff-run checkouts earn under the same rules", () => {
  it("a receptionist's checkout pays the receipt once; the pup can't be charged again", () => {
    let s: TycoonState = { ...ok(quickStart(newTycoon(0))), tour: null, coins: 3000 };
    s = ok(hire(s, "reception"));
    s = ok(setOpen(s, true));
    s = ok(createArrival(withFac(s, { ...fac(s), clockMin: 9 * 60 }), () => 0.1));
    // a small, gentle pup: the starter playroom is theirs
    s = withFac(s, { ...fac(s), dogs: fac(s).dogs.map((d, i, all) => (i === all.length - 1 ? { ...d, size: "small" as const, temper: "gentle" as const, boarding: false } : d)) });
    const pup = fac(s).dogs.at(-1)!;
    s = ok(checkIn(s, pup.id));
    const room = nextAction(fac(s), fac(s).dogs.find((d) => d.id === pup.id)!);
    s = ok(assignRoom(s, pup.id, room.room!));
    s = ok(playtime(s, pup.id));
    const f = fac(s);
    s = withFac(s, { ...f, dogs: f.dogs.map((d) => (d.id === pup.id ? { ...d, visit: { ...d.visit!, ownerHere: f.clockMin } } : d)) });
    const income0 = Object.values(fac(s).ledger.at(-1)!.income).reduce((a, b) => a + b, 0);
    const coins0 = s.coins;
    const rand = mulberry(seedFrom("staff-checkout"));
    for (let i = 0; i < 30 && fac(s).dogs.some((d) => d.id === pup.id); i++) s = tick(s, 1, rand);
    expect(fac(s).dogs.some((d) => d.id === pup.id)).toBe(false);
    const outcome = fac(s).outcomes.find((o) => o.dog === pup.name)!;
    const income1 = Object.values(fac(s).ledger.at(-1)!.income).reduce((a, b) => a + b, 0);
    expect(outcome.total).toBeGreaterThan(0);
    expect(income1 - income0).toBe(outcome.total);
    expect(s.coins - coins0).toBe(outcome.total);
    expect(checkout(s, pup.id, false).ok).toBe(false);
  });
});

describe("a free way back after a poor decision", () => {
  it("below zero: building pauses, care and checkouts still work, letting someone go is free, and serving by hand climbs back", () => {
    let s: TycoonState = { ...ok(quickStart(newTycoon(0))), tour: null, coins: 1000 };
    s = ok(hire(s, "attendant"));
    s = { ...s, coins: -150 };
    expect(buyExpansion({ ...s, xp: 1000 }, "playroom").ok).toBe(false);
    const team = fac(s).staff.find((x) => !x.founder)!;
    const coins = s.coins;
    s = ok(letGo(s, team.id));
    expect(s.coins).toBe(coins); // free
    s = ok(setOpen(s, true));
    const paid: Paid[] = [];
    const rand = mulberry(seedFrom("recovery"));
    while (fac(s).day <= 2) {
      s = tick(s, 1, rand);
      s = serve(s, paid);
    }
    expect(paid.length).toBeGreaterThan(3); // pups were cared for and paid, at any balance
    expect(s.coins).toBeGreaterThan(0);
  });
});
