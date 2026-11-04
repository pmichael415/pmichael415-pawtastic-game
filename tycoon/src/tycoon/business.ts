// PAWtastic Daycare Tycoon — the business: prices, pay, demand, expenses, marketing and the daily ledger (spec §4.7).
// All amounts are game coins, never real money or real PAWtastic prices.
import { CAMPAIGNS, PRICE_DEFAULTS, PRICE_RANGES, outdoorDef, furnitureDef } from "./catalog";
import { caps } from "./connect";
import { funAppeal, tip } from "./effects";
import { level } from "./progress";
import { adjustRep } from "./reputation";
import { fac, withFac } from "./state";
import type { CampaignId, DayLedger, ExpenseKey, Facility, IncomeKey, Placed, Prices, Room, Supplies, TDog, TReport, TResult, TycoonState, Wage } from "./types";

export { PRICE_DEFAULTS, PRICE_RANGES };

export const WAGES: Record<Wage, number> = { lean: 30, standard: 40, generous: 60 };
export const SUPPLY_COST: Record<Supplies, number> = { basic: 2, premium: 5 };
export const DELUXE_BATH_BONUS = 10;
export const UPKEEP_RATE = 0.02;
const LEDGER_DAYS = 14;
const SERVICE_NAMES: Record<keyof Prices, string> = { daycare: "Daycare", boarding: "Boarding", bath: "Bath", exitBath: "Exit bath" };

export const wageRecovery = (wage: Wage) => ({ lean: 0.8, standard: 1, generous: 1.25 })[wage];

// ---------- the ledger ----------

const zeroIncome = (): Record<IncomeKey, number> => ({ daycare: 0, boarding: 0, baths: 0, exitBaths: 0, tips: 0, bonus: 0 });
const zeroExpenses = (): Record<ExpenseKey, number> => ({ wages: 0, upkeep: 0, supplies: 0, marketing: 0, building: 0, refunds: 0 });
const emptyDay = (day: number): DayLedger => ({ day, income: zeroIncome(), expenses: zeroExpenses(), sales: 0, checkIns: 0, checkouts: 0 });

/** Today's ledger entry (a fresh one if today has none yet). */
export const today = (f: Facility): DayLedger => {
  const last = f.ledger[f.ledger.length - 1];
  return last && last.day === f.day ? last : emptyDay(f.day);
};
function withToday(f: Facility, change: (d: DayLedger) => DayLedger): Facility {
  const last = f.ledger[f.ledger.length - 1];
  const has = !!last && last.day === f.day;
  const next = change(today(f));
  return { ...f, ledger: [...(has ? f.ledger.slice(0, -1) : f.ledger), next].slice(-LEDGER_DAYS) };
}
/** Counts a check-in or checkout for today's report (and supplies). */
export function countToday(s: TycoonState, key: "checkIns" | "checkouts"): TycoonState {
  return withFac(s, withToday(fac(s), (d) => ({ ...d, [key]: d[key] + 1 })));
}

// ---------- prices and pay ----------

export function setPrice(s: TycoonState, service: keyof Prices, value: number): TResult {
  const [lo, hi] = PRICE_RANGES[service];
  if (!Number.isFinite(value)) return { ok: false, error: "Pick a price." };
  const price = Math.max(lo, Math.min(hi, Math.round(value)));
  const f = fac(s);
  return { ok: true, state: withFac(s, { ...f, prices: { ...f.prices, [service]: price } }), msg: `${SERVICE_NAMES[service]} price: ${price} coins.` };
}

/** What players of this reputation and appeal think a service is worth. */
export function fairPrice(service: keyof Prices, reputation: number, appeal: number): number {
  return PRICE_DEFAULTS[service] * (0.7 + (0.6 * reputation) / 100) * (1 + appeal / 200);
}
const fairFor = (f: Facility, service: keyof Prices) => fairPrice(service, f.reputation, funAppeal(f).appeal);

/** Multiplies arrivals (daycare) or the boarder share (boarding): clamp((fair / price)^1.5, 0.3, 1.6). */
export function demand(f: Facility, service: "daycare" | "boarding" = "daycare"): number {
  const ratio = fairFor(f, service) / Math.max(1, f.prices[service]);
  return Math.max(0.3, Math.min(1.6, Math.pow(ratio, 1.5)));
}

/** Baths and exit baths priced above 1.5 × fair are turned down ("Too pricey"). */
export const refuses = (service: "bath" | "exitBath", f: Facility) => f.prices[service] > 1.5 * fairFor(f, service);

export function checkoutPay(f: Facility, dog: TDog, exitBath: boolean): { total: number; parts: Partial<Record<IncomeKey, number>> } {
  const parts: Partial<Record<IncomeKey, number>> = { daycare: Math.round(f.prices.daycare * (0.6 + (0.4 * dog.happiness) / 100)) };
  const t = tip(funAppeal(f).appeal);
  if (t > 0) parts.tips = t;
  if (dog.boarding) parts.boarding = f.prices.boarding;
  if (exitBath) parts.exitBaths = f.prices.exitBath;
  return { total: Object.values(parts).reduce((a, n) => a + (n ?? 0), 0), parts };
}

/** A bath pays the bath price, +10 with a Deluxe Bath Tub. */
export const bathPay = (f: Facility) => f.prices.bath + (caps(f).bath?.tub === "deluxe" ? DELUXE_BATH_BONUS : 0);

/** Adds coins and records them as today's income. */
export function earn(s: TycoonState, parts: Partial<Record<IncomeKey, number>>): TycoonState {
  const total = Object.values(parts).reduce((a, n) => a + Math.max(0, n ?? 0), 0);
  if (total <= 0) return s;
  const f = withToday(fac(s), (d) => {
    const income = { ...d.income };
    for (const [k, n] of Object.entries(parts) as [IncomeKey, number][]) income[k] += Math.max(0, n ?? 0);
    return { ...d, income };
  });
  return withFac({ ...s, coins: s.coins + total }, f);
}

// ---------- one set of numbers for every money screen (audit finding 5) ----------

const SERVICE_INCOME: IncomeKey[] = ["daycare", "boarding", "baths", "exitBaths", "tips"];
const OPERATING_COSTS: ExpenseKey[] = ["wages", "upkeep", "supplies", "marketing", "refunds"];
export type DayMoney = {
  /** From serving families: daycare, boarding, baths, exit baths and tips. */
  revenue: number;
  /** Game rewards (kept apart from revenue). */
  bonuses: number;
  /** What selling rooms, doors and things paid back. */
  sales: number;
  /** Operating costs recorded so far: wages (sign-on fees during the day), marketing, refunds; at closing also tonight's. */
  costsSoFar: number;
  /** Still due when the day closes (wages, upkeep, supplies); 0 for a closed day. */
  dueTonight: number;
  /** Coins put into building. */
  invested: number;
  /** revenue − costs so far. */
  profitSoFar: number;
  /** revenue − costs so far − what's due tonight: the day's operating profit once it closes. */
  profitAtClose: number;
  /** Every coin in − every coin out, so far. */
  changeSoFar: number;
};
export function dayMoney(d: DayLedger, dueTonight = 0): DayMoney {
  const revenue = SERVICE_INCOME.reduce((a, k) => a + (d.income[k] ?? 0), 0);
  const bonuses = d.income.bonus ?? 0;
  const sales = d.sales ?? 0;
  const costsSoFar = OPERATING_COSTS.reduce((a, k) => a + (d.expenses[k] ?? 0), 0);
  const invested = d.expenses.building ?? 0;
  return { revenue, bonuses, sales, costsSoFar, dueTonight, invested, profitSoFar: revenue - costsSoFar, profitAtClose: revenue - costsSoFar - dueTonight, changeSoFar: revenue + bonuses + sales - costsSoFar - invested };
}
/** Today's money: recorded so far, plus what closing will charge tonight. */
export function todayMoney(s: TycoonState): DayMoney {
  const f = fac(s);
  const due = dayExpenses(f);
  return dayMoney(today(f), due.wages + due.upkeep + due.supplies);
}

/** Adds what selling a room, a door or a thing paid back, recorded as today's sale proceeds (not service revenue). */
export function recordSale(s: TycoonState, amount: number): TycoonState {
  if (!(amount > 0)) return s;
  const f = withToday(fac(s), (d) => ({ ...d, sales: (d.sales ?? 0) + amount }));
  return withFac({ ...s, coins: s.coins + amount }, f);
}

/** Takes coins and records them as today's expense. Paused while coins are below zero. */
export function spend(s: TycoonState, amount: number, key: ExpenseKey): TResult {
  if (amount <= 0) return { ok: true, state: s };
  if (s.coins < 0) return { ok: false, error: "Paused until your coins are back above zero." };
  if (s.coins < amount) return { ok: false, error: `Need ${amount - s.coins} more coins.` };
  const f = withToday(fac(s), (d) => ({ ...d, expenses: { ...d.expenses, [key]: d.expenses[key] + amount } }));
  return { ok: true, state: withFac({ ...s, coins: s.coins - amount }, f) };
}

// ---------- expenses ----------

const isRoom = (x: Placed | Room): x is Room => "doors" in x;
/** Daily upkeep: ceil(2% of coins spent on it). Paths, fences, the sign and closed things cost nothing. */
export function upkeepOf(x: Placed | Room): number {
  if (x.closed) return 0;
  if (!isRoom(x) && outdoorDef(x.kind)?.freeUpkeep) return 0;
  return Math.ceil(UPKEEP_RATE * x.spent);
}
/** Upkeep of the whole facility. Furniture in a closed room is closed with it. */
export function facilityUpkeep(f: Facility): number {
  const closedRooms = new Set(f.rooms.filter((r) => r.closed).map((r) => r.uid));
  return (
    f.rooms.reduce((a, r) => a + upkeepOf(r), 0) +
    f.items.reduce((a, i) => a + (i.room !== null && closedRooms.has(i.room) ? 0 : upkeepOf(i)), 0)
  );
}

/** What closing the day will charge (marketing and building were paid when spent). */
export function dayExpenses(f: Facility): Record<ExpenseKey, number> {
  return {
    ...zeroExpenses(),
    wages: WAGES[f.wage] * f.staff.length,
    upkeep: facilityUpkeep(f),
    supplies: SUPPLY_COST[f.supplies] * today(f).checkIns,
  };
}

/**
 * A warning when a purchase would leave less than tonight's running costs (smart spending): you'd start tomorrow below
 * zero, and building pauses until you earn it back. Never a block — care and checkouts carry on at any balance.
 */
export function spendWarning(s: TycoonState, cost: number): string | null {
  const tonight = Object.values(dayExpenses(fac(s))).reduce((a, b) => a + b, 0);
  const left = s.coins - cost;
  if (cost <= 0 || left < 0 || left >= tonight) return null;
  return `This leaves ${left.toLocaleString("en-US")} coins — tonight's wages, upkeep and supplies come to about ${tonight.toLocaleString("en-US")}, so you'd start tomorrow below zero (building pauses until you earn it back).`;
}

export function setWage(s: TycoonState, wage: Wage): TResult {
  if (!(wage in WAGES)) return { ok: false, error: "Pick a wage." };
  const label = { lean: "Lean wages — staff recover 20% slower.", standard: "Standard wages.", generous: "Generous wages — staff recover 25% faster." }[wage];
  return { ok: true, state: withFac(s, { ...fac(s), wage }), msg: label };
}

export function setSupplies(s: TycoonState, supplies: Supplies): TResult {
  if (!(supplies in SUPPLY_COST)) return { ok: false, error: "Pick supplies." };
  const label = supplies === "premium" ? "Premium supplies — happier check-ins and baths." : "Basic supplies.";
  return { ok: true, state: withFac(s, { ...fac(s), supplies }), msg: label };
}

// ---------- marketing ----------

const running = (f: Facility) => !!f.campaign && f.day < f.campaign.untilDay;

export function startCampaign(s: TycoonState, id: CampaignId): TResult {
  const c = CAMPAIGNS.find((x) => x.id === id);
  if (!c) return { ok: false, error: "Unknown campaign." };
  if (c.level > level(s)) return { ok: false, error: `Unlocks at level ${c.level}.` };
  if (running(fac(s))) return { ok: false, error: "One campaign at a time." };
  const paid = spend(s, c.price, "marketing");
  if (!paid.ok) return paid;
  const f = fac(paid.state);
  const next = adjustRep({ ...f, campaign: { id, untilDay: f.day + c.days } }, c.reputation, `${c.name} — new families heard about you`);
  return { ok: true, state: withFac(paid.state, next), msg: `${c.name} running for ${c.days} days!` };
}

/** Arrival multiplier from the running campaign. */
export function campaignBoost(f: Facility): number {
  if (!running(f)) return 1;
  return 1 + (CAMPAIGNS.find((c) => c.id === f.campaign!.id)?.boost ?? 0);
}

// ---------- the end of the day ----------

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, n) => a + n, 0);

/** Fun and Appeal points a thing adds (0 if it adds none). */
function pointsOf(i: Placed): { fun: number; appeal: number } {
  const od = outdoorDef(i.kind);
  if (od) return { fun: od.fun?.[i.level - 1] ?? 0, appeal: od.appeal?.[i.level - 1] ?? 0 };
  const fd = furnitureDef(i.kind);
  return { fun: fd?.fun ?? 0, appeal: fd?.appeal ?? 0 };
}

/** One money tip: the open thing with the highest upkeep per point of Fun + Appeal, or a general hint. */
export function moneyTip(f: Facility, report: Pick<TReport, "profit">): string {
  const closedRooms = new Set(f.rooms.filter((r) => r.closed).map((r) => r.uid));
  let best: { name: string; upkeep: number; fun: number; appeal: number; ratio: number } | null = null;
  for (const i of f.items) {
    if (i.closed || (i.room !== null && closedRooms.has(i.room))) continue;
    const upkeep = upkeepOf(i);
    const { fun, appeal } = pointsOf(i);
    if (upkeep <= 0 || fun + appeal <= 0) continue;
    const ratio = upkeep / (fun + appeal);
    if (!best || ratio > best.ratio) best = { name: (outdoorDef(i.kind) ?? furnitureDef(i.kind))!.name, upkeep, fun, appeal, ratio };
  }
  if (best) {
    const adds = [best.fun ? `Fun ${best.fun}` : "", best.appeal ? `Appeal ${best.appeal}` : ""].filter(Boolean).join(" and ");
    if (best.ratio > 4) return `Your ${best.name} costs ${best.upkeep} a day for ${adds}. Close it on the Upkeep list to save ${best.upkeep} a day.`;
    return `Your ${best.name} costs ${best.upkeep} a day and adds ${adds} — worth it while you have room for more dogs.`;
  }
  return report.profit < 0
    ? "Wages and upkeep are charged each night. More dog spots, or a slightly higher price, will cover them."
    : "More dog spots and more Appeal bring in more dogs.";
}

/** Charges wages, upkeep and supplies (coins may go below zero), writes the report and starts the next day. */
export function closeDay(s: TycoonState): TycoonState {
  const f0 = fac(s);
  const charges = dayExpenses(f0);
  const f1 = withToday(f0, (d) => {
    const expenses = { ...d.expenses };
    for (const k of Object.keys(charges) as ExpenseKey[]) expenses[k] += charges[k];
    return { ...d, expenses };
  });
  const day = today(f1);
  const income = sum(day.income);
  const expenses = sum(day.expenses);
  const m = dayMoney(day);
  const profit = income + m.sales - expenses; // the change in coins
  const invested = m.invested;
  const running = m.profitAtClose; // operating profit: service revenue − operating costs (no bonuses, no sales)
  // a record is about running the business well: building for growth doesn't spoil a good day
  const record = running > s.bestProfit;
  const avgHappy = f1.dogs.length ? Math.round(f1.dogs.reduce((a, d) => a + d.happiness, 0) / f1.dogs.length) : 100;
  const report: TReport = { day: f1.day, income, expenses, profit, running, invested, bonuses: m.bonuses, sales: m.sales, record, tip: moneyTip(f1, { profit }), admitted: day.checkIns, checkouts: day.checkouts, avgHappy };
  const nextDay = f1.day + 1;
  const campaign = f1.campaign && nextDay < f1.campaign.untilDay ? f1.campaign : null;
  const f2: Facility = { ...f1, day: nextDay, campaign, report, ledger: [...f1.ledger, emptyDay(nextDay)].slice(-LEDGER_DAYS) };
  return withFac({ ...s, coins: s.coins - (charges.wages + charges.upkeep + charges.supplies), bestProfit: record ? running : s.bestProfit }, f2);
}
