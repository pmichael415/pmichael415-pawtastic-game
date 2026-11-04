// Today's money at a glance (staff design §6; audit finding 5): the same numbers as Finances and the day report.
import { todayMoney } from "@/tycoon/business";
import type { TycoonState } from "@/tycoon/types";

const n = (x: number) => Math.round(x).toLocaleString("en-US");
const signed = (x: number) => `${x >= 0 ? "+" : "−"}${n(Math.abs(x))}`;

/**
 * Today's money in one line, from the same calculation as Finances and the day report (audit finding 5): revenue from
 * serving families, operating costs (so far and still due tonight), the operating profit the day will close with, and
 * apart from it any bonuses, building and sales. Game coins only — not PAWtastic's real prices.
 */
export function TodayStrip({ state, onOpen }: { state: TycoonState; onOpen: () => void }) {
  const m = todayMoney(state);
  const costs = m.costsSoFar + m.dueTonight;
  const label = `Today: revenue ${n(m.revenue)}, operating costs ${n(costs)} (${n(m.costsSoFar)} so far, ${n(m.dueTonight)} due tonight), operating profit by closing ${m.profitAtClose < 0 ? "−" : ""}${n(Math.abs(m.profitAtClose))}${m.bonuses ? `, bonuses ${n(m.bonuses)}` : ""}${m.invested ? `, invested ${n(m.invested)}` : ""}${m.sales ? `, sale proceeds ${n(m.sales)}` : ""} game coins`;
  return (
    <button type="button" onClick={onOpen} aria-label={label} className="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 rounded-2xl border border-border bg-card px-3 py-2 text-left text-xs shadow-soft hover:bg-muted">
      <span className="font-bold text-secondary">Today</span>
      <span className="text-secondary">Revenue <b className="tabular-nums text-primary">+{n(m.revenue)}</b></span>
      <span className="text-secondary">Costs <b className="tabular-nums">−{n(costs)}</b> <span className="text-muted-foreground">({n(m.dueTonight)} tonight)</span></span>
      <span className="text-secondary">Profit by closing <b className={`tabular-nums ${m.profitAtClose >= 0 ? "text-primary" : "text-destructive"}`}>{signed(m.profitAtClose)}</b></span>
      {m.bonuses > 0 && <span className="text-secondary">Bonuses <b className="tabular-nums">+{n(m.bonuses)}</b></span>}
      {m.invested > 0 && <span className="text-secondary">Invested <b className="tabular-nums">{n(m.invested)}</b></span>}
      {m.sales > 0 && <span className="text-secondary">Sales <b className="tabular-nums">+{n(m.sales)}</b></span>}
      <span className="ml-auto text-[11px] text-muted-foreground">game coins · costs charged at 18:00</span>
    </button>
  );
}
