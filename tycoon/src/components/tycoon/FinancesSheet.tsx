// The business screen (spec §3): Summary with a 14-day profit chart, Prices, Staff, Upkeep, Marketing, and the
// trophy shelf. All amounts are game coins.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { MAX_STAFF, hireCost } from "@/game/engine";
import { track } from "@/lib/analytics";
import { CAMPAIGNS, PRICE_RANGES, furnitureDef, outdoorDef, ROOM_TYPE_NAMES } from "@/tycoon/catalog";
import { setClosed } from "@/tycoon/build";
import { SUPPLY_COST, WAGES, campaignBoost, demand, facilityUpkeep, fairPrice, setPrice, setSupplies, setWage, startCampaign, upkeepOf } from "@/tycoon/business";
import { funAppeal } from "@/tycoon/effects";
import { level } from "@/tycoon/progress";
import { hireStaff } from "@/tycoon/run";
import { fac } from "@/tycoon/state";
import type { ActOpts, ActResult } from "@/tycoon/store";
import { TrophyShelf } from "./TrophyShelf";
import type { DayLedger, ExpenseKey, Facility, IncomeKey, Prices, Supplies, TResult, TycoonState, Wage } from "@/tycoon/types";

type Act = (fn: (s: TycoonState) => TResult, opts?: ActOpts) => ActResult;
const TABS = ["Summary", "Prices", "Staff", "Upkeep", "Marketing"] as const;
type Tab = (typeof TABS)[number];

const INCOME: [IncomeKey, string][] = [["daycare", "Daycare"], ["boarding", "Boarding"], ["baths", "Baths"], ["exitBaths", "Exit baths"], ["tips", "Tips"], ["bonus", "Bonuses"]];
const EXPENSES: [ExpenseKey, string][] = [["wages", "Wages"], ["upkeep", "Upkeep"], ["supplies", "Supplies"], ["marketing", "Marketing"], ["refunds", "Refunds"]];
const PROFIT = "#2a78d6";
const LOSS = "#d0473f";

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, n) => a + n, 0);
/** What running the daycare made that day: income minus running costs. Building is an investment, shown apart. */
const profitOf = (d: DayLedger) => sum(d.income) - (sum(d.expenses) - d.expenses.building);
const fmt = (n: number) => (n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString());

function addUp(days: DayLedger[]) {
  const income = Object.fromEntries(INCOME.map(([k]) => [k, days.reduce((a, d) => a + d.income[k], 0)])) as Record<IncomeKey, number>;
  const expenses = Object.fromEntries(EXPENSES.map(([k]) => [k, days.reduce((a, d) => a + d.expenses[k], 0)])) as Record<ExpenseKey, number>;
  const invested = days.reduce((a, d) => a + d.expenses.building, 0);
  const profit = sum(income) - sum(expenses); // running costs only: building isn't in EXPENSES
  return { income, expenses, profit, invested, change: profit - invested };
}

/** 14-day profit, one bar per game day from a zero line: blue up for profit, red down for a loss. */
function ProfitChart({ days }: { days: DayLedger[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 320;
  const H = 140;
  const pad = { l: 8, r: 8, t: 18, b: 22 };
  const vals = days.map(profitOf);
  const max = Math.max(10, ...vals.map((v) => Math.abs(v)));
  const hasNeg = vals.some((v) => v < 0);
  const hasPos = vals.some((v) => v > 0) || !hasNeg;
  const top = pad.t;
  const bottom = H - pad.b;
  const zero = hasNeg && hasPos ? top + (bottom - top) / 2 : hasNeg ? top : bottom;
  const scale = (hasNeg && hasPos ? (bottom - top) / 2 : bottom - top) / max;
  const slot = (W - pad.l - pad.r) / 14;
  const bw = Math.min(16, slot - 4);
  const label = days.length ? `Profit for the last ${days.length} game days: ${days.map((d, i) => `day ${d.day} ${fmt(vals[i]!)}`).join(", ")}` : "Profit for the last 14 game days: no days played yet";
  return (
    <figure className="mt-2">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="w-full">
        <line x1={pad.l} x2={W - pad.r} y1={zero} y2={zero} stroke="currentColor" className="text-border" strokeWidth={1} />
        {days.map((d, i) => {
          const v = vals[i]!;
          const h = Math.max(v === 0 ? 0 : 2, Math.abs(v) * scale);
          const x = pad.l + slot * (14 - days.length + i) + (slot - bw) / 2;
          const y = v >= 0 ? zero - h : zero;
          const r = Math.min(4, h / 2, bw / 2);
          // rounded data-end, square at the baseline
          const path =
            v >= 0
              ? `M${x},${zero} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${zero} Z`
              : `M${x},${zero} V${zero + h - r} Q${x},${zero + h} ${x + r},${zero + h} H${x + bw - r} Q${x + bw},${zero + h} ${x + bw},${zero + h - r} V${zero} Z`;
          const last = i === days.length - 1;
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`Day ${d.day}: ${fmt(v)} coins`}>
              <rect x={x - 3} y={top} width={bw + 6} height={bottom - top} fill="transparent" />
              {h > 0 && <path d={path} fill={v >= 0 ? PROFIT : LOSS} opacity={hover === null || hover === i ? 1 : 0.55} />}
              <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="fill-muted-foreground" fontSize={9}>
                {d.day}
              </text>
              {(last || hover === i) && (
                <text x={x + bw / 2} y={v >= 0 ? Math.max(10, y - 4) : Math.min(bottom + 12, zero + h + 11)} textAnchor="middle" className="fill-foreground" fontSize={10} fontWeight={700}>
                  {fmt(v)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="text-[11px] text-muted-foreground">
        Daily profit from running the daycare (before building), game coins, last 14 game days. <span style={{ color: PROFIT }}>■</span> profit · <span style={{ color: LOSS }}>■</span> loss
      </figcaption>
    </figure>
  );
}

function Summary({ f }: { f: Facility }) {
  const ledger = f.ledger;
  const today = ledger.find((d) => d.day === f.day) ?? null;
  const yesterday = ledger.find((d) => d.day === f.day - 1) ?? null;
  const week = ledger.filter((d) => d.day > f.day - 7);
  const cols = [
    { name: "Today", v: addUp(today ? [today] : []) },
    { name: "Yesterday", v: addUp(yesterday ? [yesterday] : []) },
    { name: "7 days", v: addUp(week) },
  ];
  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="text-left font-medium" />
            {cols.map((c) => (
              <th key={c.name} className="text-right font-medium">
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={4} className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Income
            </td>
          </tr>
          {INCOME.map(([k, name]) => (
            <tr key={k}>
              <td>{name}</td>
              {cols.map((c) => (
                <td key={c.name} className="text-right tabular-nums">
                  {c.v.income[k].toLocaleString()}
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td colSpan={4} className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Running costs
            </td>
          </tr>
          {EXPENSES.map(([k, name]) => (
            <tr key={k}>
              <td>{name}</td>
              {cols.map((c) => (
                <td key={c.name} className="text-right tabular-nums">
                  {c.v.expenses[k].toLocaleString()}
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t border-border font-bold text-secondary">
            <td className="pt-1">Profit</td>
            {cols.map((c) => (
              <td key={c.name} className="pt-1 text-right tabular-nums">
                {fmt(c.v.profit)}
              </td>
            ))}
          </tr>
          <tr>
            <td>Invested in building</td>
            {cols.map((c) => (
              <td key={c.name} className="text-right tabular-nums">
                {c.v.invested.toLocaleString()}
              </td>
            ))}
          </tr>
          <tr className="text-muted-foreground">
            <td>Change in coins</td>
            {cols.map((c) => (
              <td key={c.name} className="text-right tabular-nums">
                {fmt(c.v.change)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="mt-1 text-[11px] text-muted-foreground">Profit is what running the daycare made; building is what you put back in to grow. Wages, upkeep and supplies are charged when each game day ends.</p>
      <ProfitChart days={ledger.slice(-14)} />
    </div>
  );
}

const SERVICES: { key: keyof Prices; name: string; note: string }[] = [
  { key: "daycare", name: "Daycare day", note: "paid at checkout, more when pups are happy" },
  { key: "boarding", name: "Boarding night", note: "added for boarders" },
  { key: "bath", name: "Bath", note: "+10 with a Deluxe Bath Tub" },
  { key: "exitBath", name: "Exit bath", note: "at checkout" },
];

function PricesTab({ f, act }: { f: Facility; act: Act }) {
  const appeal = funAppeal(f).appeal;
  return (
    <div className="space-y-4">
      {SERVICES.map((sv) => {
        const [lo, hi] = PRICE_RANGES[sv.key];
        const price = f.prices[sv.key];
        const fair = fairPrice(sv.key, f.reputation, appeal);
        const pct = ((Math.min(hi, Math.max(lo, fair)) - lo) / (hi - lo)) * 100;
        const bathLike = sv.key === "bath" || sv.key === "exitBath";
        const hint = bathLike && price > 1.5 * fair ? "Too pricey: owners will say no" : price > fair * 1.05 ? "Above fair: fewer dogs will come" : price < fair * 0.95 ? "Below fair: more dogs, less per dog" : "About fair";
        const id = `price-${sv.key}`;
        return (
          <div key={sv.key} role="group" aria-label={sv.name}>
            <div className="flex items-baseline justify-between">
              <label htmlFor={id} className="font-semibold text-secondary">
                {sv.name}
              </label>
              <span className="font-display text-lg font-bold tabular-nums text-secondary">{price}</span>
            </div>
            <div className="relative">
              <input
                id={id}
                type="range"
                min={lo}
                max={hi}
                step={1}
                value={price}
                aria-label={`${sv.name} price`}
                aria-valuetext={`${price} coins, fair is about ${Math.round(fair)}`}
                className="h-11 w-full accent-[var(--primary)]"
                onChange={(e) => act((s) => setPrice(s, sv.key, Number(e.target.value)), { quiet: true })}
                onMouseUp={(e) => track("tycoon_price", { service: sv.key, price: Number((e.target as HTMLInputElement).value) })}
                onTouchEnd={(e) => track("tycoon_price", { service: sv.key, price: Number((e.target as HTMLInputElement).value) })}
                onKeyUp={(e) => track("tycoon_price", { service: sv.key, price: Number((e.target as HTMLInputElement).value) })}
              />
              <span aria-hidden className="pointer-events-none absolute top-1 h-2 w-0.5 rounded bg-secondary" style={{ left: `calc(${pct}% - 1px)` }} title="fair price" />
            </div>
            <p className="text-xs text-muted-foreground">
              {lo}–{hi} · fair ≈ {Math.round(fair)} · {sv.note}
            </p>
            <p className={`text-sm font-semibold ${hint.startsWith("About") ? "text-primary" : "text-secondary"}`}>{hint}</p>
            {sv.key === "daycare" && <p className="text-xs text-muted-foreground">Customer demand: ×{demand(f).toFixed(2)}</p>}
          </div>
        );
      })}
    </div>
  );
}

const WAGE_NAME: Record<Wage, string> = { lean: "Lean", standard: "Standard", generous: "Generous" };
const WAGE_INFO: Record<Wage, string> = {
  lean: "Staff energy recovers 20% slower.",
  standard: "The usual pace.",
  generous: "Staff recover 25% faster, and reputation slowly grows.",
};
const SUPPLY_INFO: Record<Supplies, string> = { basic: "Everything pups need.", premium: "+5 happiness at check-in and at each bath." };

function StaffTab({ f, act }: { f: Facility; act: Act }) {
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="font-semibold text-secondary">Wages (per staff member, per day)</legend>
        <div role="radiogroup" aria-label="Wages" className="mt-1 space-y-1">
          {(Object.keys(WAGES) as Wage[]).map((w) => (
            <button key={w} type="button" role="radio" aria-checked={f.wage === w} onClick={() => act((s) => setWage(s, w))} className={`flex w-full items-center gap-2 rounded-xl border p-2 text-left ${f.wage === w ? "border-primary bg-primary/10" : "border-border"}`}>
              <span className="font-semibold text-secondary">{WAGE_NAME[w]}</span>
              <span className="text-sm tabular-nums">{WAGES[w]}</span>
              <span className="ml-auto text-xs text-muted-foreground">{WAGE_INFO[w]}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="font-semibold text-secondary">Supplies (per pup checked in)</legend>
        <div role="radiogroup" aria-label="Supplies" className="mt-1 space-y-1">
          {(Object.keys(SUPPLY_COST) as Supplies[]).map((sp) => (
            <button key={sp} type="button" role="radio" aria-checked={f.supplies === sp} onClick={() => act((s) => setSupplies(s, sp))} className={`flex w-full items-center gap-2 rounded-xl border p-2 text-left ${f.supplies === sp ? "border-primary bg-primary/10" : "border-border"}`}>
              <span className="font-semibold text-secondary">{sp === "premium" ? "Premium" : "Basic"}</span>
              <span className="text-sm tabular-nums">{SUPPLY_COST[sp]}</span>
              <span className="ml-auto text-xs text-muted-foreground">{SUPPLY_INFO[sp]}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <div>
        <p className="font-semibold text-secondary">
          Team: {f.staff.length}/{MAX_STAFF}
        </p>
        <p className="text-xs text-muted-foreground">{f.staff.map((st) => `${st.name} (${Math.round(st.energy)}% energy)`).join(" · ")}</p>
        {f.staff.length < MAX_STAFF && (
          <Button className="mt-2 h-11" onClick={() => act(hireStaff)}>
            Hire · {hireCost(f.staff.length)}
          </Button>
        )}
      </div>
    </div>
  );
}

function UpkeepTab({ f, act }: { f: Facility; act: Act }) {
  const closedRooms = new Set(f.rooms.filter((r) => r.closed).map((r) => r.uid));
  const rows = [
    ...f.rooms.map((r) => ({ uid: r.uid, name: r.type ? ROOM_TYPE_NAMES[r.type] : "Room", cost: upkeepOf(r), closed: r.closed, inClosed: false })),
    ...f.items
      .filter((i) => i.kind !== "path" && i.uid !== "entrance" && !(outdoorDef(i.kind)?.freeUpkeep))
      .map((i) => ({ uid: i.uid, name: (furnitureDef(i.kind) ?? outdoorDef(i.kind))?.name ?? i.kind, cost: i.room && closedRooms.has(i.room) ? 0 : upkeepOf(i), closed: i.closed, inClosed: !!i.room && closedRooms.has(i.room) })),
  ];
  return (
    <div>
      <p className="text-sm text-secondary">
        Total upkeep: <span data-testid="upkeep-total" className="font-bold tabular-nums">{facilityUpkeep(f)}</span> a day. Paths, fences and the sign are free. Closed things cost nothing and do nothing; a closed room keeps the pups already inside.
      </p>
      <ul className="mt-2 divide-y divide-border">
        {rows.map((row) => (
          <li key={row.uid} className="flex items-center gap-2 py-1.5">
            <span className="min-w-0 flex-1 truncate text-sm">
              {row.name}
              {row.inClosed ? <span className="text-xs text-muted-foreground"> · in a closed room</span> : null}
            </span>
            <span className="w-10 text-right text-sm tabular-nums">{row.cost}</span>
            <Switch checked={!row.closed} aria-label={`${row.name} open`} onCheckedChange={(open) => act((s) => setClosed(s, row.uid, !open), { quiet: true })} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function MarketingTab({ state, f, act }: { state: TycoonState; f: Facility; act: Act }) {
  const lv = level(state);
  const running = f.campaign && f.day < f.campaign.untilDay ? f.campaign : null;
  return (
    <div className="space-y-2">
      {running && (
        <p className="rounded-xl bg-primary/10 p-2 text-sm font-semibold text-secondary">
          {CAMPAIGNS.find((c) => c.id === running.id)?.name} running: arrivals ×{campaignBoost(f).toFixed(1)} until day {running.untilDay}.
        </p>
      )}
      <ul className="divide-y divide-border">
        {CAMPAIGNS.map((c) => (
          <li key={c.id} className="flex items-center gap-2 py-2">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-secondary">{c.name}</p>
              <p className="text-xs text-muted-foreground">
                Arrivals +{Math.round(c.boost * 100)}% for {c.days} game days{c.reputation ? `, reputation +${c.reputation}` : ""}
              </p>
            </div>
            {c.level > lv ? (
              <span className="text-xs font-semibold text-muted-foreground">Unlocks at level {c.level}</span>
            ) : (
              <Button size="sm" className="h-11" disabled={!!running} onClick={() => act((s) => startCampaign(s, c.id), { event: { name: "tycoon_marketing", props: { campaign: c.id } } })}>
                Start {c.name} · {c.price}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">One campaign at a time. Game coins only.</p>
    </div>
  );
}

export function FinancesSheet({ open, state, act, onClose }: { open: boolean; state: TycoonState; act: Act; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("Summary");
  const f = fac(state);
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[88svh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Finances</SheetTitle>
          <SheetDescription>
            {state.coins.toLocaleString()} coins · day {f.day}. Game coins only — never real money.
          </SheetDescription>
        </SheetHeader>
        <div role="tablist" aria-label="Finances" className="-mx-1 mt-2 flex gap-1 overflow-x-auto px-1 pb-1">
          {TABS.map((t) => (
            <Button key={t} role="tab" aria-selected={tab === t} size="sm" variant={tab === t ? "default" : "outline"} className="h-11 shrink-0" onClick={() => setTab(t)}>
              {t}
            </Button>
          ))}
        </div>
        <div role="tabpanel" aria-label={tab} className="mt-2">
          {tab === "Summary" && (
            <>
              <Summary f={f} />
              <TrophyShelf state={state} />
            </>
          )}
          {tab === "Prices" && <PricesTab f={f} act={act} />}
          {tab === "Staff" && <StaffTab f={f} act={act} />}
          {tab === "Upkeep" && <UpkeepTab f={f} act={act} />}
          {tab === "Marketing" && <MarketingTab state={state} f={f} act={act} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
