// Today's money at a glance (staff design §6): revenue so far, wages due tonight, other costs and the net. Game coins
// only — these are not PAWtastic's real prices.
import { dayExpenses, today } from "@/tycoon/business";
import { fac } from "@/tycoon/state";
import type { TycoonState } from "@/tycoon/types";

const n = (x: number) => Math.round(x).toLocaleString("en-US");
export function todayMoney(state: TycoonState) {
  const f = fac(state);
  const t = today(f);
  const due = dayExpenses(f);
  const revenue = Object.values(t.income).reduce((a, b) => a + b, 0);
  const wages = due.wages + t.expenses.wages; // tonight's wages plus any sign-on fees already paid today
  const other = due.upkeep + due.supplies + t.expenses.marketing + t.expenses.refunds;
  const building = t.expenses.building;
  return { revenue, wages, other, building, net: revenue - wages - other - building };
}

export function TodayStrip({ state, onOpen }: { state: TycoonState; onOpen: () => void }) {
  const m = todayMoney(state);
  return (
    <button type="button" onClick={onOpen} aria-label={`Today: revenue ${n(m.revenue)}, wages ${n(m.wages)}, other costs ${n(m.other)}${m.building ? `, building ${n(m.building)}` : ""}, net ${n(m.net)} game coins`} className="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 rounded-2xl border border-border bg-card px-3 py-2 text-left text-xs shadow-soft hover:bg-muted">
      <span className="font-bold text-secondary">Today</span>
      <span className="text-secondary">Revenue <b className="tabular-nums text-primary">+{n(m.revenue)}</b></span>
      <span className="text-secondary">Wages <b className="tabular-nums">−{n(m.wages)}</b></span>
      <span className="text-secondary">Other <b className="tabular-nums">−{n(m.other)}</b></span>
      {m.building > 0 && <span className="text-secondary">Building <b className="tabular-nums">−{n(m.building)}</b></span>}
      <span className="text-secondary">Net <b className={`tabular-nums ${m.net >= 0 ? "text-primary" : "text-destructive"}`}>{m.net >= 0 ? "+" : "−"}{n(Math.abs(m.net))}</b></span>
      <span className="ml-auto text-[11px] text-muted-foreground">game coins · costs charged at 18:00</span>
    </button>
  );
}
