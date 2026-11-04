import { describe, expect, it } from "vitest";
import { placeThing, setClosed } from "./build";
import {
  spendWarning,
  bathPay,
  campaignBoost,
  checkoutPay,
  closeDay,
  countToday,
  dayExpenses,
  demand,
  earn,
  fairPrice,
  moneyTip,
  refuses,
  setPrice,
  setSupplies,
  setWage,
  spend,
  startCampaign,
  upkeepOf,
  wageRecovery,
} from "./business";
import { fac, newTycoon, withFac } from "./state";
import { guidedBuild, ok, richState } from "./testkit";
import type { Facility, Placed, Room, TDog, TycoonState } from "./types";

const dog = (over: Partial<TDog> = {}): TDog =>
  ({ id: "d1", name: "Biscuit", breed: 0, size: "small", temper: "gentle", visits: 1, place: { kind: "lobby" }, checkedIn: true, happiness: 50, clean: 70, boarding: false, played: 0, bathed: false, ...over }) as TDog;
const room = (spent: number, over: Partial<Room> = {}): Room => ({ uid: "rX", c: 10, r: 16, w: 4, d: 3, type: "playroom", group: "small-gentle", doors: [], floor: "wood", wall: "#FFFFFF", spent, closed: false, ...over });
const thing = (kind: Placed["kind"], spent: number, over: Partial<Placed> = {}): Placed => ({ uid: "tX", kind, c: 0, r: 0, rot: 0, level: 1, spent, room: null, closed: false, ...over });
const setF = (s: TycoonState, over: Partial<Facility>) => withFac(s, { ...fac(s), ...over });
/** Only an entrance and the given rooms, so upkeep is exactly the rooms' upkeep. */
const bare = (rooms: Room[], coins = 3000) => setF({ ...newTycoon(0), coins }, { rooms });

describe("pay", () => {
  const f = fac(newTycoon(0));
  it("checkout at default prices and happiness 50 pays round(40 × 0.8) = 32", () => {
    expect(checkoutPay(f, dog(), false)).toEqual({ total: 32, parts: { daycare: 32 } });
  });
  it("boarders add the boarding price, and an exit bath its price", () => {
    expect(checkoutPay(f, dog({ boarding: true }), true)).toEqual({ total: 32 + 90 + 30, parts: { daycare: 32, boarding: 90, exitBaths: 30 } });
  });
  it("Appeal 40 tips +10", () => {
    const fortyAppeal = { ...f, items: [...f.items, ...Array.from({ length: 20 }, (_, i) => thing("lights", 0, { uid: `l${i}`, c: i }))] }; // 20 × 2 = 40
    expect(checkoutPay(fortyAppeal, dog(), false)).toEqual({ total: 42, parts: { daycare: 32, tips: 10 } });
  });
  it("a bath with a deluxe tub pays 25 + 10", () => {
    expect(bathPay(fac(richState()))).toBe(35);
    expect(bathPay(f)).toBe(25);
  });
});

describe("fair price and demand", () => {
  it("fair = default × (0.7 + 0.6 × rep/100) × (1 + appeal/200)", () => {
    expect(fairPrice("daycare", 80, 0)).toBeCloseTo(47.2);
    expect(fairPrice("bath", 80, 0)).toBeCloseTo(29.5);
    expect(fairPrice("daycare", 100, 50)).toBeCloseTo(40 * 1.3 * 1.25);
  });
  it("demand = clamp((fair / price)^1.5, 0.3, 1.6)", () => {
    const f = fac(newTycoon(0));
    expect(demand(f)).toBeCloseTo(Math.pow(47.2 / 40, 1.5), 3);
    expect(demand(f)).toBeCloseTo(1.282, 2);
    // At reputation 80 the top price still draws (47.2 / 80)^1.5 ≈ 0.453; the 0.3 floor shows at low reputation.
    expect(demand({ ...f, prices: { ...f.prices, daycare: 80 } })).toBeCloseTo(Math.pow(47.2 / 80, 1.5), 3);
    expect(demand({ ...f, reputation: 0, prices: { ...f.prices, daycare: 80 } })).toBe(0.3);
    expect(demand({ ...f, prices: { ...f.prices, daycare: 20 } })).toBe(1.6);
    expect(demand({ ...f, prices: { ...f.prices, boarding: 50 } }, "boarding")).toBeCloseTo(Math.min(1.6, Math.pow((90 * 1.18) / 50, 1.5)));
  });
  it("baths over 1.5 × fair are refused", () => {
    const f = fac(newTycoon(0));
    expect(refuses("bath", { ...f, prices: { ...f.prices, bath: 80 } })).toBe(true);
    expect(refuses("bath", { ...f, prices: { ...f.prices, bath: 44 } })).toBe(false);
  });
  it("setPrice clamps to the range", () => {
    const s = ok(setPrice(newTycoon(0), "daycare", 200));
    expect(fac(s).prices.daycare).toBe(80);
    expect(fac(ok(setPrice(s, "bath", 3))).prices.bath).toBe(10);
    expect(fac(ok(setPrice(s, "exitBath", 33.6))).prices.exitBath).toBe(34);
  });
});

describe("expenses", () => {
  it("upkeep is ceil(2% of spend); paths, fences, the sign and closed things are free", () => {
    expect(upkeepOf(room(600))).toBe(12);
    expect(upkeepOf(room(430))).toBe(9);
    expect(upkeepOf(room(600, { closed: true }))).toBe(0);
    expect(upkeepOf(thing("path", 10))).toBe(0);
    expect(upkeepOf(thing("fence", 15))).toBe(0);
    expect(upkeepOf(thing("sign", 0))).toBe(0);
    expect(upkeepOf(thing("fountain", 800))).toBe(16);
    expect(upkeepOf(thing("fountain", 800, { closed: true }))).toBe(0);
  });
  it("closeDay with 1 standard staff, upkeep 30 and 8 basic check-ins charges 40 + 30 + 16 = 86", () => {
    let s = bare([room(1500)]);
    for (let i = 0; i < 8; i++) s = countToday(s, "checkIns");
    expect(dayExpenses(fac(s))).toEqual({ wages: 40, upkeep: 30, supplies: 16, marketing: 0, building: 0, refunds: 0 });
    const t = closeDay(s);
    expect(t.coins).toBe(3000 - 86);
    expect(fac(t).report).toMatchObject({ day: 1, income: 0, expenses: 86, profit: -86, record: false, admitted: 8 });
    expect(fac(t).day).toBe(2);
    expect(fac(t).ledger.at(-1)).toMatchObject({ day: 2, checkIns: 0 });
  });
  it("the report's profit is income minus every expense, building included", () => {
    let s = bare([]);
    s = ok(spend(s, 300, "building"));
    s = earn(s, { daycare: 120, tips: 6 });
    s = countToday(s, "checkouts");
    const r = fac(closeDay(s)).report!;
    expect(r).toMatchObject({ income: 126, expenses: 300 + 40, profit: 126 - 340, checkouts: 1 });
  });
  it("a record only when the profit beats the best, which is then updated", () => {
    const s = earn(bare([]), { daycare: 500 });
    const t = closeDay(s);
    expect(fac(t).report!.record).toBe(true);
    expect(t.bestProfit).toBe(460);
    const u = closeDay(earn(t, { daycare: 100 }));
    expect(fac(u).report!.record).toBe(false);
    expect(u.bestProfit).toBe(460);
  });
  it("investing doesn't spoil a good day: the report splits running profit from what was invested, and the record uses the running profit", () => {
    let s = earn(bare([]), { daycare: 500 });
    s = ok(spend(s, 300, "building"));
    const t = closeDay(s);
    expect(fac(t).report).toMatchObject({ income: 500, running: 460, invested: 300, profit: 160, record: true });
    expect(t.bestProfit).toBe(460); // "Have a profitable day" means beating the day's wages, upkeep and supplies
  });
  it("a purchase that leaves less than tonight's running costs says so, before you buy (smart spending)", () => {
    const s = { ...bare([]), coins: 600 };
    const tonight = Object.values(dayExpenses(fac(s))).reduce((a, b) => a + b, 0);
    expect(spendWarning(s, 600 - tonight - 1)).toBeNull();
    const w = spendWarning(s, 590)!;
    expect(w).toMatch(new RegExp(`leaves 10 coins.*about ${tonight}.*below zero`));
  });
  it("keeps 14 ledger days", () => {
    let s = bare([]);
    for (let i = 0; i < 20; i++) s = closeDay(earn(s, { daycare: 50 }));
    expect(fac(s).ledger).toHaveLength(14);
    expect(fac(s).ledger.at(-1)!.day).toBe(21);
  });
  it("supplies: premium costs 5 per check-in", () => {
    let s = ok(setSupplies(bare([]), "premium"));
    s = countToday(countToday(s, "checkIns"), "checkIns");
    expect(dayExpenses(fac(s)).supplies).toBe(10);
  });
});

describe("below zero (Review Focus 3)", () => {
  it("day-end expenses can go below zero; spending pauses until income pays it back", () => {
    let s = bare([room(1500)], 50);
    for (let i = 0; i < 8; i++) s = countToday(s, "checkIns");
    s = closeDay(s);
    expect(s.coins).toBe(-36);
    for (const key of ["building", "wages", "marketing"] as const)
      expect(spend(s, 10, key)).toEqual({ ok: false, error: "Paused until your coins are back above zero." });
    s = earn(s, { daycare: 40 });
    expect(s.coins).toBe(4);
    expect(spend(s, 10, "building")).toEqual({ ok: false, error: "Need 6 more coins." });
    expect(ok(spend(s, 4, "building")).coins).toBe(0);
  });
  it("earning and spending record today's ledger", () => {
    const s = ok(spend(earn(bare([]), { daycare: 32, tips: 3 }), 120, "marketing"));
    expect(fac(s).ledger.at(-1)).toMatchObject({ day: 1, income: { daycare: 32, tips: 3 }, expenses: { marketing: 120 } });
  });
});

describe("marketing", () => {
  const at = (n: number) => ({ ...newTycoon(0), xp: 50 * n * (n - 1) });
  it("unlocks by level and costs its price", () => {
    expect(startCampaign(at(4), "online")).toEqual({ ok: false, error: "Unlocks at level 5." });
    const s = ok(startCampaign(at(5), "online"));
    expect(s.coins).toBe(3000 - 400);
    expect(fac(s).campaign).toEqual({ id: "online", untilDay: 4 });
    expect(campaignBoost(fac(s))).toBe(1.4);
  });
  it("lasts its days, one at a time", () => {
    let s = ok(startCampaign(at(5), "online"));
    expect(startCampaign(s, "flyers")).toEqual({ ok: false, error: "One campaign at a time." });
    s = closeDay(closeDay(s));
    expect(campaignBoost(fac(s))).toBe(1.4); // day 3
    s = closeDay(s);
    expect(fac(s).day).toBe(4);
    expect(campaignBoost(fac(s))).toBe(1);
    expect(fac(s).campaign).toBeNull();
    expect(startCampaign(s, "flyers").ok).toBe(true);
  });
  it("an open house adds reputation +5", () => {
    const s = ok(startCampaign(at(8), "openhouse"));
    expect(fac(s).reputation).toBe(85);
    expect(campaignBoost(fac(s))).toBe(1.6);
  });
});

describe("wages", () => {
  it("lean recovers slower, generous costs 60 a head", () => {
    expect(wageRecovery("lean")).toBe(0.8);
    expect(wageRecovery("standard")).toBe(1);
    expect(wageRecovery("generous")).toBe(1.25);
    const s = ok(setWage(bare([]), "generous"));
    const two = setF(s, { staff: [...fac(s).staff, { id: "s1", name: "Maya", energy: 100 }] });
    expect(dayExpenses(fac(two)).wages).toBe(120);
  });
});

describe("closing things (Review Focus 2)", () => {
  it("a closed occupied playroom keeps its dogs and costs nothing, furniture included", () => {
    let s = guidedBuild(newTycoon(0));
    const play = fac(s).rooms.find((r) => r.type === "playroom")!;
    s = setF(s, { dogs: [dog({ place: { kind: "room", room: play.uid } })] });
    const before = dayExpenses(fac(s)).upkeep;
    s = ok(setClosed(s, play.uid, true));
    expect(fac(s).dogs).toHaveLength(1);
    const furniture = fac(s).items.filter((i) => i.room === play.uid).reduce((a, i) => a + upkeepOf(i), 0);
    expect(dayExpenses(fac(s)).upkeep).toBe(before - upkeepOf({ ...play, closed: false }) - furniture);
    const t = closeDay(s);
    expect(fac(t).ledger.at(-2)!.expenses.upkeep).toBe(dayExpenses(fac(s)).upkeep);
  });
});

describe("money tip", () => {
  it("names the costliest open thing per point of Fun + Appeal", () => {
    let s = { ...newTycoon(0), xp: 50 * 7 * 6, coins: 5000 };
    s = ok(placeThing(s, "fountain", 12, 20, 0));
    s = ok(placeThing(s, "play_yard", 15, 20, 0));
    const t = closeDay(s);
    expect(fac(t).report!.tip).toBe("Your Fountain costs 16 a day and adds Appeal 6 — worth it while you have room for more dogs.");
  });
  it("suggests closing it above 4 coins a point", () => {
    const f = fac(newTycoon(0));
    const pricey = { ...f, items: [...f.items, thing("nap_cabana", 2500, { level: 3 })] }; // upkeep 50 for 11 points
    expect(moneyTip(pricey, { profit: -10 })).toBe("Your Nap Cabana costs 50 a day for Fun 7 and Appeal 4. Close it on the Upkeep list to save 50 a day.");
    expect(moneyTip(f, { profit: -10 })).toMatch(/Wages and upkeep/);
    expect(moneyTip(f, { profit: 10 })).toMatch(/More dog spots/);
  });
});
