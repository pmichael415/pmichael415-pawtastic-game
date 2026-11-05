// The business loop from a real new game (audit finding 7). Nothing is injected: no coins, no experience, no erased
// books. A brand-new save; the player taps Quick start and follows the guide; then plays by hand with each pup's
// next-action button (the same rules staff use). The player's rules, stated so the result can be judged:
//   • the guide: care for each pup, buy the Toy Bin it suggests, and let Rocket rest at home (free) at the decision;
//   • no reserve policy: once the playroom wing and the bath station are offered, compare them on the game's own
//     labelled estimates (what each would add a day from today's demand, after upkeep and supplies) and buy the one
//     that pays back sooner as soon as the coins on hand cover it and still leave tonight's costs (the game warns
//     otherwise);
//   • staff it with the room's own one-tap plan only if its estimate covers the wage; then back to caring by hand.
// Game rewards (level-ups, the guide, loyalty, trophies) are counted apart from serving families throughout. Since
// the milestone "make PAWtastic feel like a daycare tycoon" (§4), the coins the guide leaves are less than a first
// expansion costs, so the service profit earned after the guide visibly pays for part of it.
import { describe, expect, it } from "vitest";
import { groupOf, mulberry, seedFrom } from "@/game/engine";
import type { GroupId } from "@/game/engine";
import { placeFirstFree } from "./build";
import { SUPPLY_COST, WAGES, todayMoney, upkeepOf } from "./business";
import { START_COINS } from "./catalog";
import { roomStatus } from "./connect";
import { EXPANSION_LEVEL, askedToday, buyExpansion, expansionOptions, type ExpansionOption } from "./expansion";
import { nextAction } from "./nextAction";
import { savingFor } from "./objectives";
import { level } from "./progress";
import { applyStaffPlan, staffPlanFor } from "./roomCare";
import { assignBed, assignRoom, bath, checkIn, checkout, clean, playtime, tick } from "./run";
import { isFreshSave } from "./start";
import { fac, newTycoon } from "./state";
import { TOUR_DOGS, chooseUpgrade, startTour, syncTour } from "./tour";
import { restAtHome } from "./tourActions";
import type { DayLedger, TReport, TResult, TycoonState } from "./types";

const T0 = Date.UTC(2026, 10, 4, 15);
const DAYS = 10;
const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
/** The store lets the guide catch up after every change; so does this player. */
const sync = (s: TycoonState) => syncTour(s, T0).state;
const guiding = (s: TycoonState) => !!s.tour && !s.tour.done && !s.tour.skipped;

/** Everything on the books so far, split the way the money screens split it. */
function books(s: TycoonState) {
  const all = (pick: (d: DayLedger) => number) => fac(s).ledger.reduce((a, d) => a + pick(d), 0);
  const revenue = all((d) => sum(d.income) - d.income.bonus);
  const bonuses = all((d) => d.income.bonus);
  const sales = all((d) => d.sales ?? 0);
  const operating = all((d) => d.expenses.wages + d.expenses.upkeep + d.expenses.supplies + d.expenses.marketing + d.expenses.refunds);
  const invested = all((d) => d.expenses.building);
  return { revenue, bonuses, sales, operating, invested };
}
type Books = ReturnType<typeof books>;
const minus = (a: Books, b: Books): Books => ({ revenue: a.revenue - b.revenue, bonuses: a.bonuses - b.bonuses, sales: a.sales - b.sales, operating: a.operating - b.operating, invested: a.invested - b.invested });

type Paid = { day: number; min: number; dog: string; group: GroupId | null; room: string | null; total: number; lines: number; serviceDelta: number; reward: number; by: "you" | "staff" };
type Night = TReport & { coinsBefore: number; coinsAfter: number };
type Choice = { id: "playroom" | "bath"; cost: number; upkeep: number; perDay: number; payback: number; text: string; option: ExpansionOption };

/** One player, ten days. With `expand: false`, the same player on the same seed never buys the expansion (a control). */
function play(expand = true) {
  const rand = mulberry(seedFrom("real-new-game"));
  const fresh = newTycoon(T0);
  expect(isFreshSave(fresh)).toBe(true);
  expect(fresh.coins).toBe(START_COINS);
  // the start card's Quick start
  let s = startTour(fresh, "quick", T0);
  const afterQuick = { coins: s.coins, books: books(s) };
  const paid: Paid[] = [];
  const nights: Night[] = [];
  const mine = { checkIns: 0, plays: 0, baths: 0, checkouts: 0, afterExpansion: 0 };

  /** One tap; a payment is recorded with exactly what the books gained from it. */
  const tap = (fn: (x: TycoonState) => TResult, checkingOut?: { id: string }) => {
    const b0 = books(s);
    const lv = level(s);
    const before = fac(s).dogs.find((d) => d.id === checkingOut?.id);
    const r = fn(s);
    if (!r.ok) return false;
    s = sync(r.state);
    if (checkingOut && before) {
      const g = fac(s);
      const receipt = g.outcomes.at(-1)!;
      const room = before.place.kind === "room" || before.place.kind === "bed" ? before.place.room : null;
      const b1 = books(s);
      paid.push({ day: g.day, min: g.clockMin, dog: before.name, group: groupOf(before), room, total: receipt.total, lines: receipt.lines.reduce((a, l) => a + l.amount, 0), serviceDelta: b1.revenue - b0.revenue - (b1.operating - b0.operating), reward: b1.bonuses - b0.bonuses, by: "you" });
      expect(level(s) >= lv).toBe(true);
    }
    return true;
  };

  /** The player's round: each pup's next action, by hand. */
  const care = (bought: boolean) => {
    for (const d0 of fac(s).dogs) {
      const d = fac(s).dogs.find((x) => x.id === d0.id);
      if (!d) continue;
      if (guiding(s) && s.tour!.beat === "decision" && d.name === TOUR_DOGS.third) {
        tap((x) => restAtHome(x, d.id));
        continue;
      }
      const n = nextAction(fac(s), d);
      const did =
        n.id === "checkin" ? tap((x) => checkIn(x, d.id)) && ++mine.checkIns
        : n.id === "room" && n.room ? tap((x) => assignRoom(x, d.id, n.room!))
        : n.id === "bed" && n.bed ? tap((x) => assignBed(x, d.id, n.bed!))
        : n.id === "bath" ? tap((x) => bath(x, d.id)) && ++mine.baths
        : n.id === "play" ? tap((x) => playtime(x, d.id)) && ++mine.plays
        : n.id === "checkout" ? tap((x) => checkout(x, d.id, false), d) && ++mine.checkouts
        // in the guide, the coach says "Check out" once the pup has played (the family is on the way)
        : guiding(s) && n.id === "none" && d.played > 0 && (s.tour!.beat === "checkout" || s.tour!.beat === "benefit") ? tap((x) => checkout(x, d.id, false), d) && ++mine.checkouts
        : false;
      if (did && bought) mine.afterExpansion++;
    }
    if (guiding(s) && s.tour!.beat === "upgrade") {
      s = chooseUpgrade(s, "toy_bin");
      tap((x) => placeFirstFree(x, "toy_bin"));
    }
    if (fac(s).cleanliness < 55) tap(clean);
  };

  // ---- the guide ----
  for (let i = 0; i < 40 && guiding(s); i++) {
    care(false);
    s = sync(tick(s, 1, rand));
  }
  expect(guiding(s)).toBe(false);
  const reserve = { coins: s.coins, books: books(s), level: level(s), options: expansionOptions(s).filter((o) => o.mode === "new" && (o.id === "playroom" || o.id === "bath")).map((o) => ({ id: o.id, cost: o.cost, why: o.why })) };
  const saving: { day: number; saving: ReturnType<typeof savingFor>; coins: number }[] = [];

  // ---- free play ----
  let bought: { day: number; min: number; uid: string; group: GroupId | null; askedToday: number; choice: Choice; other: Choice | null; shownCost: number; investedDelta: number; at: Books & { coins: number; dueTonight: number; serviceProfit: number }; savingBefore: ReturnType<typeof savingFor>; hired: { day: number; min: number; signOn: number } | null; estimate: number } | null = null;
  /** The first moment both options were offered, and what they said. */
  let firstOffer: { day: number; min: number; coins: number; choices: Choice[] } | null = null;
  // day 1 began with the fresh save (Quick start and the guide happened on it), so its books start from there
  let coinsAtDayStart = fresh.coins;
  const staffCheckouts0 = () => fac(s).outcomes.length;
  while (fac(s).day <= DAYS) {
    const day = fac(s).day;
    const outcomes0 = staffCheckouts0();
    s = sync(tick(s, 1, rand));
    // checkouts done by staff during the tick (the player didn't tap them)
    for (const o of fac(s).outcomes.slice(outcomes0)) if (o.how === "checkout") paid.push({ day: fac(s).day, min: fac(s).clockMin, dog: o.dog, group: null, room: null, total: o.total, lines: o.lines.reduce((a, l) => a + l.amount, 0), serviceDelta: NaN, reward: o.reward?.amount ?? 0, by: "staff" });
    if (fac(s).day !== day) {
      const r = fac(s).report!;
      nights.push({ ...r, coinsBefore: coinsAtDayStart, coinsAfter: s.coins });
      if (bought) saving.push({ day: r.day, saving: savingFor(s), coins: s.coins });
      coinsAtDayStart = s.coins;
      continue;
    }
    care(!!bought);

    // ---- staff the new room once the sign-on is affordable (still leaving tonight's costs) and its estimate covers the wage ----
    if (bought && !bought.hired) {
      const g = fac(s);
      const plan = staffPlanFor(g, g.rooms.find((r) => r.uid === bought!.uid)!);
      if (plan.kind === "hire" && bought.estimate > plan.wage && s.coins - plan.cost >= todayMoney(s).dueTonight) {
        const w0 = books(s).operating;
        if (tap((x) => applyStaffPlan(x, plan))) bought.hired = { day: fac(s).day, min: fac(s).clockMin, signOn: books(s).operating - w0 };
      }
    }

    // ---- reinvest ----
    if (expand && !bought && level(s) >= EXPANSION_LEVEL) {
      const since = minus(books(s), reserve.books);
      const due = todayMoney(s).dueTonight;
      const opts = expansionOptions(s);
      const offered = (["playroom", "bath"] as const).map((id) => opts.find((o) => o.id === id && o.mode === "new" && o.estimate)).filter((o): o is ExpansionOption => !!o);
      // the game's own estimates (after upkeep and supplies); only an option that would add something is worth buying
      const choices = offered.map((o): Choice => ({ id: o.id as "playroom" | "bath", cost: o.cost, upkeep: o.upkeep, perDay: o.estimate!.perDay, payback: o.estimate!.perDay > 0 ? o.cost / o.estimate!.perDay : Infinity, text: o.estimate!.text, option: o }));
      if (!firstOffer && offered.length === 2) firstOffer = { day: fac(s).day, min: fac(s).clockMin, coins: s.coins, choices };
      const [choice, other = null] = [...choices].filter((c) => c.perDay > 0).sort((a, b) => a.payback - b.payback);
      if (choice) {
        if (s.coins - choice.cost >= due) {
          const savingBefore = savingFor(s);
          const askedBefore = askedToday(fac(s));
          const spent0 = books(s).invested;
          const coins0 = s.coins;
          const r = buyExpansion(s, choice.id);
          if (r.ok) {
            s = sync(r.state);
            const g = fac(s);
            const newRoom = g.rooms.at(-1)!;
            const askedNow = askedBefore.find((a) => a.group === newRoom.group)?.n ?? 0;
            bought = { day: g.day, min: g.clockMin, uid: newRoom.uid, group: newRoom.group, askedToday: askedNow, choice, other, shownCost: choice.cost, investedDelta: books(s).invested - spent0, at: { ...since, coins: coins0, dueTonight: due, serviceProfit: since.revenue - since.operating }, savingBefore, hired: null, estimate: choice.perDay };
          }
        }
      }
    }
  }
  return { s, afterQuick, reserve, paid, nights, bought, mine, saving, firstOffer };
}

describe("from a real new game: earn → cover costs → reinvest → serve more → save for the next (audit finding 7)", () => {
  const run = play();
  const control = play(false);
  const b = run.bought!;

  it("prints the story", () => {
    console.log("after Quick start:", run.afterQuick.coins, "coins; invested", run.afterQuick.books.invested, "; bonuses", run.afterQuick.books.bonuses);
    console.log("after the guide:", run.reserve.coins, "coins (the reserve), level", run.reserve.level, JSON.stringify(run.reserve.books), JSON.stringify(run.reserve.options));
    console.table(run.nights.map((n) => ({ day: n.day, revenue: n.income - n.bonuses, operatingCosts: n.expenses - n.invested, operatingProfit: n.running, bonuses: n.bonuses, invested: n.invested, sales: n.sales, changeInCoins: n.profit, coins: n.coinsAfter })));
    console.log("expansion:", JSON.stringify({ ...b, choice: { ...b.choice, option: undefined }, other: { ...b.other, option: undefined } }));
    console.log("hands-on:", JSON.stringify(run.mine), "payments", run.paid.length, "by you", run.paid.filter((p) => p.by === "you").length);
    console.log("saving toward:", JSON.stringify(run.saving));
    console.log("first offer:", JSON.stringify(run.firstOffer && { ...run.firstOffer, choices: run.firstOffer.choices.map((c) => ({ ...c, option: undefined })) }));
    expect(run.nights.length).toBe(DAYS);
  });

  it("1. a real start: a fresh save, Quick start spends real coins (recorded as building), the guide's reward is a bonus", () => {
    expect(run.afterQuick.books.invested).toBe(START_COINS - run.afterQuick.coins + run.afterQuick.books.bonuses);
    expect(run.afterQuick.books.revenue).toBe(0);
    // what the guide's pups paid is service revenue; its reward and level-ups are bonuses, kept apart
    expect(run.reserve.books.revenue).toBeGreaterThan(0);
    expect(run.reserve.books.bonuses).toBeGreaterThan(run.afterQuick.books.bonuses);
  });

  it("2. a visit pays an itemised bill, once: the receipt's lines add up to its total, and that is exactly what service revenue gained", () => {
    const mine = run.paid.filter((p) => p.by === "you");
    expect(mine.length).toBeGreaterThan(20);
    for (const p of mine) {
      expect(p.lines).toBe(p.total);
      expect(p.serviceDelta).toBe(p.total); // game rewards (p.reward) went to bonuses, not into the bill
    }
    expect(mine.some((p) => p.reward > 0)).toBe(true);
  });

  it("3. operating costs are charged every night, and coins follow the books exactly", () => {
    for (const n of run.nights) {
      expect(n.expenses - n.invested).toBeGreaterThan(0); // wages, upkeep, supplies
      expect(n.coinsAfter).toBe(n.coinsBefore + n.profit);
      expect(n.running).toBe(n.income - n.bonuses - (n.expenses - n.invested)); // operating profit leaves bonuses out
    }
  });

  it("4. a real limit: families asked for a kind of pup with no room here, and nobody of that kind could stay; no baths without a bath room", () => {
    const before = run.paid.filter((p) => p.day < b.day || (p.day === b.day && p.min < b.min));
    expect(before.length).toBeGreaterThanOrEqual(5);
    expect(before.filter((p) => p.group === b.group)).toHaveLength(0);
    expect(b.askedToday).toBeGreaterThanOrEqual(2); // turned away today for want of a room
    expect(fac(run.s).ledger.reduce((a, d) => a + d.income.baths, 0)).toBe(0); // the daycare never had a bath room
  });

  it("5. playroom wing vs bath station, compared on the game's own labelled estimates; the one that pays back sooner was bought", () => {
    expect(run.firstOffer).not.toBeNull();
    expect(b.choice.id).toBe("playroom");
    expect(b.other?.id).toBe("bath");
    expect(b.choice.payback).toBeLessThan(b.other!.payback);
    for (const c of [b.choice, b.other!]) {
      expect(c.text).toMatch(/^Estimate/);
      expect(c.text).toMatch(/upkeep/);
      expect(c.option.capacity).toBeTruthy();
      expect(c.option.staffing).toBeTruthy();
    }
    // neither is always the obvious choice: when the options first appeared, the bath station estimated nothing
    // (no bath asks yet) and the wing little (one family turned away) — it took the day's demand to decide
    expect(run.firstOffer!.choices.find((c) => c.id === "playroom")!.perDay).toBeLessThan(b.choice.perDay);
  });

  it("6. paid for from earnings: the guide's coins couldn't cover it, and the service profit earned since made up the difference", () => {
    expect(run.reserve.coins).toBeLessThan(b.choice.cost);
    expect(b.at.serviceProfit).toBe(b.at.revenue - b.at.operating);
    expect(b.at.serviceProfit).toBeGreaterThan(0);
    // without what families paid (after running costs) since the guide, it was out of reach
    expect(b.at.coins - b.at.serviceProfit).toBeLessThan(b.choice.cost);
    // every coin at that moment is accounted for: reserve + revenue − operating costs + bonuses + sales − invested
    expect(b.at.coins).toBe(run.reserve.coins + b.at.revenue - b.at.operating + b.at.bonuses + b.at.sales - b.at.invested);
    // bought only with tonight's costs still covered (the game's own warning)
    expect(b.at.coins - b.choice.cost).toBeGreaterThanOrEqual(b.at.dueTonight);
    console.log(`the first expansion: ${b.choice.cost} coins on day ${b.day} at ${Math.floor(b.min / 60)}:${String(b.min % 60).padStart(2, "0")} — the guide left ${run.reserve.coins}; since then families paid ${b.at.revenue} and running costs charged ${b.at.operating} (service profit ${b.at.serviceProfit}), game rewards ${b.at.bonuses}; ${b.at.coins} on hand, ${b.at.dueTonight} due tonight`);
  });

  it("7. bought, connected, furnished and staffed: the wing works, for exactly the price shown", () => {
    const f = fac(run.s);
    const room = f.rooms.find((r) => r.uid === b.uid)!;
    expect(room.type).toBe("playroom");
    expect(room.group).toBe(b.group);
    expect(roomStatus(f, room).connected).toBe(true);
    expect(roomStatus(f, room).working).toBe(true);
    expect(f.items.filter((i) => i.room === b.uid && i.kind === "dog_bed").length).toBeGreaterThanOrEqual(3);
    expect(b.investedDelta).toBe(b.shownCost);
    expect(b.hired).not.toBeNull();
    expect(b.hired!.signOn).toBeGreaterThan(0);
    expect(f.staff.some((x) => x.role === "attendant")).toBe(true);
  });

  it("8. the wing serves the demand that was turned away — and pays its way after its upkeep, supplies, wage and sign-on", () => {
    const f = fac(run.s);
    const room = f.rooms.find((r) => r.uid === b.uid)!;
    const served = run.paid.filter((p) => p.room === b.uid);
    expect(served.length).toBeGreaterThanOrEqual(5);
    expect(served.every((p) => p.group === b.group && p.total > 0)).toBe(true);
    const nightsSince = run.nights.filter((n) => n.day >= b.day).length;
    const nightsStaffed = run.nights.filter((n) => n.day >= b.hired!.day).length;
    const upkeep = (upkeepOf(room) + f.items.filter((i) => i.room === b.uid).reduce((a, i) => a + upkeepOf(i), 0)) * nightsSince;
    const supplies = SUPPLY_COST[f.supplies] * served.length;
    const wages = WAGES[f.wage] * nightsStaffed + b.hired!.signOn;
    const takings = served.reduce((a, p) => a + p.total, 0);
    const net = takings - upkeep - supplies - wages;
    console.log(`the wing: ${served.length} families paid ${takings} over ${nightsSince} nights (estimate was ${b.estimate}/day after upkeep and supplies); upkeep ${upkeep}, supplies ${supplies}, wages + sign-on ${wages} → net ${net}; the build cost ${b.choice.cost}, so it ${net >= b.choice.cost ? "has paid for itself" : `has ${b.choice.cost - net} still to earn back`}`);
    expect(net).toBeGreaterThan(0);
  });

  it("9. the same player on the same seed without the wing makes less: operating profit a day and coins at the end, with the wing's price, wage, sign-on and upkeep paid", () => {
    const after = (r: typeof run) => r.nights.filter((n) => n.day > b.day);
    const avg = (xs: Night[]) => xs.reduce((a, n) => a + n.running, 0) / xs.length;
    console.table(after(run).map((n, i) => ({ day: n.day, withWing: n.running, without: after(control)[i]?.running, hiredDay: b.hired?.day })));
    console.log(`operating profit a day after day ${b.day}: ${avg(after(run)).toFixed(0)} with the wing, ${avg(after(control)).toFixed(0)} without; coins after day ${DAYS}: ${run.s.coins} with, ${control.s.coins} without`);
    expect(control.bought).toBeNull();
    expect(after(run).length).toBeGreaterThanOrEqual(5);
    expect(avg(after(run))).toBeGreaterThan(avg(after(control)));
    // every day makes an operating profit, except the one that carried the attendant's one-off sign-on
    for (const n of after(run)) if (n.day !== b.hired?.day) expect(n.running).toBeGreaterThan(0);
    expect(run.s.coins).toBeGreaterThan(control.s.coins);
  });

  it("10. back to hands-on care after building and hiring: you still check families in, play and check out yourself", () => {
    expect(run.mine.afterExpansion).toBeGreaterThan(50);
    expect(run.paid.filter((p) => p.by === "you" && (p.day > b.day || (p.day === b.day && p.min > b.min))).length).toBeGreaterThan(10);
  });

  it("11. then saving toward the next expansion: it's named with its price, and the coins toward it grow", () => {
    expect(run.saving.length).toBeGreaterThanOrEqual(5);
    for (const x of run.saving) {
      expect(x.saving).not.toBeNull();
      expect(x.saving!.cost).toBeGreaterThan(0);
      expect(x.saving!.have).toBe(Math.max(0, x.coins));
    }
    expect(run.saving.at(-1)!.coins).toBeGreaterThan(run.saving[0]!.coins);
  });

  it("balance note: the guide leaves less than a first expansion costs, so serving families pays for part of it", () => {
    // (milestone "make PAWtastic feel like a daycare tycoon" §4; until then the guide left about 1,500 coins against a
    // ~540 wing, so the first expansion didn't need any earnings)
    const wing = run.reserve.options.find((o) => o.id === "playroom")!;
    expect(run.reserve.coins).toBeLessThan(wing.cost);
    expect(wing.why).toMatch(/more coins needed/);
  });
});
