// Audit finding 5: the money screens agree. One shared calculation: Revenue (from serving families), Operating costs,
// Operating profit, Bonuses (game rewards, kept apart), Invested, Sale proceeds and Change in coins. Today's screens
// show what's recorded so far and say what's still due tonight; the day report is the same numbers after closing.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
vi.mock("sonner", () => ({ toast: Object.assign(() => {}, { success: () => {}, error: () => {}, warning: () => {}, info: () => {} }) }));
import { FinancesSheet } from "./FinancesSheet";
import { TodayStrip } from "./TodayStrip";
import { closeDay, earn, todayMoney } from "@/tycoon/business";
import { sellThing } from "@/tycoon/build";
import { checkout } from "@/tycoon/run";
import { quickStart } from "@/tycoon/start";
import { fac, newTycoon, withFac } from "@/tycoon/state";
import { ok } from "@/tycoon/testkit";
import type { TycoonState } from "@/tycoon/types";

/** Quick Start, a family served and paid, a game reward and a sale — mid-day. */
function midDay(): TycoonState {
  let s: TycoonState = { ...ok(quickStart(newTycoon(0))), tour: null };
  const f = fac(s);
  const play = f.rooms.find((r) => r.type === "playroom")!;
  const dog = { id: "dz", name: "Ziggy", breed: 1, size: "small" as const, temper: "gentle" as const, visits: 1, place: { kind: "room" as const, room: play.uid }, checkedIn: true, happiness: 90, clean: 80, boarding: false, played: 1, bathed: false };
  s = withFac(s, { ...f, clockMin: 13 * 60, dogs: [dog] });
  s = ok(checkout(s, "dz", false));
  s = earn(s, { bonus: 50 });
  s = ok(sellThing(s, fac(s).items.find((i) => i.kind === "flowers")!.uid));
  return s;
}
const num = (t: string | null | undefined) => Number((t ?? "").replace(/[^\d−-]/g, "").replace("−", "-"));

beforeEach(() => localStorage.clear());

describe("one set of numbers", () => {
  it("the shared calculation: operating profit leaves bonuses and sales out; change in coins adds them", () => {
    const s = midDay();
    const m = todayMoney(s);
    expect(m.bonuses).toBe(fac(s).ledger.at(-1)!.income.bonus); // the 50 reward (and any level-up it brought)
    expect(m.bonuses).toBeGreaterThanOrEqual(50);
    expect(m.revenue).toBeGreaterThan(0);
    expect(m.sales).toBeGreaterThan(0);
    expect(m.profitAtClose).toBe(m.revenue - m.costsSoFar - m.dueTonight);
    expect(m.changeSoFar).toBe(m.revenue + m.bonuses + m.sales - m.costsSoFar - m.invested);
    // after closing, the day report's operating profit is exactly the projection
    const r = fac(closeDay(s)).report!;
    expect(r.running).toBe(m.profitAtClose);
    expect(r.bonuses).toBe(m.bonuses);
    expect(r.sales).toBe(m.sales);
  });

  it("the Today strip and Finances show the same operating profit for the same state", () => {
    const s = midDay();
    const m = todayMoney(s);
    const { unmount } = render(
      <>
        <TodayStrip state={s} onOpen={() => {}} />
        <FinancesSheet open state={s} act={() => ({ ok: false, error: "" })} onClose={() => {}} />
      </>,
    );
    const strip = screen.getByRole("button", { name: /^Today:/, hidden: true }); // (behind the open Finances sheet)
    expect(strip.getAttribute("aria-label")).toMatch(new RegExp(`operating profit by closing ${m.profitAtClose < 0 ? "−" : ""}${Math.abs(m.profitAtClose)}`));
    const summary = within(screen.getByRole("tabpanel", { name: "Summary" }));
    const row = summary.getByRole("row", { name: /^Operating profit/ });
    expect(num(within(row).getAllByRole("cell")[1]!.textContent)).toBe(m.profitAtClose);
    expect(summary.getByRole("row", { name: /^Bonuses/ })).toBeTruthy();
    expect(summary.getByRole("row", { name: /^Sale proceeds/ })).toBeTruthy();
    unmount();
  });
  it("the Finances chart's bar for today is the same operating profit by closing as the Today column (review finding)", () => {
    const s = midDay();
    const m = todayMoney(s);
    const { unmount } = render(<FinancesSheet open state={s} act={() => ({ ok: false, error: "" })} onClose={() => {}} />);
    const bar = screen.getByRole("img", { name: /^Profit for the last/ });
    const day = fac(s).day;
    const v = new RegExp(`day ${day} ([+−-]?[\\d,]+)`).exec(bar.getAttribute("aria-label") ?? "");
    expect(v).not.toBeNull();
    expect(num(v![1])).toBe(m.profitAtClose);
    unmount();
  });
  it("Finances' Change in coins is what actually changed — tonight's costs aren't taken off before they're paid (audit gap F)", () => {
    const s = midDay();
    const m = todayMoney(s);
    expect(m.dueTonight).toBeGreaterThan(0); // there is something still to pay tonight
    const { unmount } = render(<FinancesSheet open state={s} act={() => ({ ok: false, error: "" })} onClose={() => {}} />);
    const summary = within(screen.getByRole("tabpanel", { name: "Summary" }));
    const change = summary.getByRole("row", { name: /^Change in coins/ });
    expect(num(within(change).getAllByRole("cell")[1]!.textContent)).toBe(m.changeSoFar);
    // the projected result is labelled as such, on its own row
    const projected = summary.getByRole("row", { name: /^Operating profit by closing/ });
    expect(num(within(projected).getAllByRole("cell")[1]!.textContent)).toBe(m.profitAtClose);
    unmount();
  });
});

